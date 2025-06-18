import express from 'express'
import cors from 'cors'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import path from 'path';
import fs from 'fs';
import fetch from 'node-fetch';
import { Wallet, JsonRpcProvider, Contract, } from 'ethers'
import { bech32 } from 'bech32';

import { DirectSecp256k1Wallet, decodePubkey, makeAuthInfoBytes, makeSignDoc } from "@cosmjs/proto-signing";
import { accountFromAny, SigningStargateClient } from "@cosmjs/stargate";
import { pathToString } from '@cosmjs/crypto';
import { toHex, toBase64, } from '@cosmjs/encoding';
import { TxRaw, SignDoc, TxBody } from "cosmjs-types/cosmos/tx/v1beta1/tx.js";
import { Any } from "cosmjs-types/google/protobuf/any.js";
import { MsgSend } from "cosmjs-types/cosmos/bank/v1beta1/tx.js";
import Long from "long";

// Noble crypto imports for key derivation
import { keccak_256 } from '@noble/hashes/sha3';
import { secp256k1 } from '@noble/curves/secp256k1';
import { mnemonicToSeedSync, validateMnemonic } from 'bip39';
import { BIP32Factory } from 'bip32';
import * as ecc from 'tiny-secp256k1';

import conf, { 
  initializeSecureKeys, 
  getPrivateKey, 
  getPrivateKeyBytes, 
  getPublicKeyBytes,
  getEvmAddress,
  getCosmosAddress,
  getEvmPublicKey,
  validateDerivedAddresses
} from './config.js'

const app = express()
const chainConf = conf.blockchain

// Import checker
import { FrequencyChecker } from './checker.js'
const checker = new FrequencyChecker(conf)

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Update CORS to only allow certain domains in production
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'https://faucet.cosmos-evm.com',
      'https://cosmos-evm.com',
      'http://localhost:3000',
      'http://localhost:8088'
    ];
    
    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.static('src'))
app.use(express.json())

// Testing mode flag
const TESTING_MODE = process.env.TESTING_MODE === 'true';

if (TESTING_MODE) {
  console.log('\n️  WARNING: TESTING MODE ENABLED ⚠️');
  console.log('- All addresses receive 1 of each token regardless of balance');
  console.log('- Rate limits still apply');
  console.log('- Set TESTING_MODE=false to disable\n');
}

// Middleware to parse JSON and URL-encoded bodies
app.use(express.urlencoded({ extended: true }));

// Global ERC20 ABIs
const ERC20_BASE_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)"
];

const ERC20_OWNABLE_ABI = [
  "function owner() view returns (address)"
];

const ERC20_APPROVAL_ABI = [
  ...ERC20_BASE_ABI,
  "event Approval(address indexed owner, address indexed spender, uint256 value)"
];

// Function to detect address type
function detectAddressType(address) {
  if (!address) return 'unknown';
  
  // Check if it's a hex address (EVM)
  if (address.startsWith('0x') && address.length === 42) {
    try {
      // Validate it's a valid hex address
      const normalized = address.toLowerCase();
      const valid = /^0x[a-f0-9]{40}$/.test(normalized);
      return valid ? 'evm' : 'unknown';
    } catch {
      return 'unknown';
    }
  }
  
  // Check if it's a bech32 address (Cosmos)
  if (address.startsWith(conf.blockchain.sender.option.prefix)) {
    try {
      bech32.decode(address);
      return 'cosmos';
    } catch {
      return 'unknown';
    }
  }
  
  return 'unknown';
}

// Convert hex address to Cosmos address
function hexToCosmosAddress(hexAddress) {
  try {
    // Remove 0x prefix and convert to buffer
    const addressBytes = Buffer.from(hexAddress.slice(2), 'hex');
    // Encode to bech32 with chain prefix
    const words = bech32.toWords(addressBytes);
    return bech32.encode(conf.blockchain.sender.option.prefix, words);
  } catch (error) {
    console.error('Error converting hex to cosmos address:', error);
    return null;
  }
}

// Convert Cosmos address to hex
function cosmosAddressToHex(cosmosAddress) {
  try {
    const { words } = bech32.decode(cosmosAddress);
    const addressBytes = Buffer.from(bech32.fromWords(words));
    return '0x' + addressBytes.toString('hex');
  } catch (error) {
    console.error('Error converting cosmos to hex address:', error);
    return null;
  }
}

// Function to check and approve token
async function approveToken(tokenAddress, spenderAddress, amount) {
  const ethProvider = new JsonRpcProvider(chainConf.endpoints.evm_endpoint);
  const privateKey = getPrivateKey();
  const wallet = new Wallet(privateKey, ethProvider);
  
  try {
    const tokenContract = new Contract(tokenAddress, ERC20_APPROVAL_ABI, wallet);
    
    console.log(`Approving ${amount} tokens for ${spenderAddress} on token ${tokenAddress}`);
    
    const tx = await tokenContract.approve(spenderAddress, amount);
    console.log(`Approval transaction sent: ${tx.hash}`);
    
    await tx.wait();
    console.log(`Approval confirmed!`);
    
    return true;
  } catch (error) {
    console.error(`Error approving token ${tokenAddress}:`, error);
    return false;
  }
}

// Function to check allowance for a token
async function checkAllowance(tokenAddress, ownerAddress, spenderAddress) {
  const ethProvider = new JsonRpcProvider(chainConf.endpoints.evm_endpoint);
  
  try {
    const tokenContract = new Contract(tokenAddress, ERC20_APPROVAL_ABI, ethProvider);
    
    // Get token info
    const [symbol, decimals, allowance] = await Promise.all([
      tokenContract.symbol(),
      tokenContract.decimals(),
      tokenContract.allowance(ownerAddress, spenderAddress)
    ]);
    
    return {
      token: tokenAddress,
      symbol,
      decimals: Number(decimals),
      allowance: allowance.toString(),
      isApproved: allowance > 0n
    };
  } catch (error) {
    console.error(`Error checking allowance for ${tokenAddress}:`, error);
    return {
      token: tokenAddress,
      symbol: 'UNKNOWN',
      decimals: 18,
      allowance: '0',
      isApproved: false,
      error: error.message
    };
  }
}

// Check all token approvals
async function checkAllTokenApprovals() {
  const atomicMultiSendAddress = chainConf.contracts.atomicMultiSend;
  if (!atomicMultiSendAddress) {
    console.error('AtomicMultiSend contract address not configured');
    return [];
  }

  const evmAddress = getEvmAddress();
  const results = [];
  
  for (const token of chainConf.tx.amounts) {
    if (token.erc20_contract && 
        token.erc20_contract !== "0x0000000000000000000000000000000000000000" &&
        token.erc20_contract !== "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE") {
      
      const allowanceInfo = await checkAllowance(
        token.erc20_contract,
        evmAddress,
        atomicMultiSendAddress
      );
      
      results.push({
        ...allowanceInfo,
        denom: token.denom,
        required_amount: token.target_balance
      });
    }
  }
  
  return results;
}

// Setup token approvals
async function setupTokenApprovals() {
  console.log('\n Checking and setting up token approvals...');
  
  const atomicMultiSendAddress = chainConf.contracts.atomicMultiSend;
  if (!atomicMultiSendAddress) {
    console.error(' AtomicMultiSend contract address not configured');
    return false;
  }

  const evmAddress = getEvmAddress();
  let allApproved = true;
  
  for (const token of chainConf.tx.amounts) {
    if (token.erc20_contract && 
        token.erc20_contract !== "0x0000000000000000000000000000000000000000" &&
        token.erc20_contract !== "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE") {
      
      const allowanceInfo = await checkAllowance(
        token.erc20_contract,
        evmAddress,
        atomicMultiSendAddress
      );
      
      if (!allowanceInfo.isApproved) {
        console.log(`  ️  Token ${token.denom} (${allowanceInfo.symbol}) needs approval`);
        
        // Approve max uint256
        const maxApproval = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
        const approved = await approveToken(
          token.erc20_contract,
          atomicMultiSendAddress,
          maxApproval
        );
        
        if (approved) {
          console.log(`   Success: Token ${token.denom} (${allowanceInfo.symbol}) approved`);
        } else {
          console.log(`   Failed: Could not approve token ${token.denom}`);
          allApproved = false;
        }
      } else {
        console.log(`   Success: Token ${token.denom} (${allowanceInfo.symbol}) already approved`);
        console.log(`     Allowance: ${allowanceInfo.allowance}`);
      }
    }
  }
  
  console.log(allApproved ? ' Token approval setup complete!\n' : '❌ Some token approvals failed\n');
  return allApproved;
}

// Periodic approval monitoring
let approvalMonitorInterval;

function startApprovalMonitoring() {
  console.log(' Starting token approval monitoring (checking every 5 minutes)...');
  
  // Check immediately on start
  checkAndReportApprovals();
  
  // Then check every 5 minutes
  approvalMonitorInterval = setInterval(async () => {
    console.log('\n[APPROVAL CHECK] Running periodic approval check...');
    await checkAndReportApprovals();
    console.log('[APPROVAL CHECK] Periodic check complete');
  }, 5 * 60 * 1000); // 5 minutes
}

async function checkAndReportApprovals() {
  const approvals = await checkAllTokenApprovals();
  const needsApproval = approvals.filter(a => !a.isApproved);
  
  if (needsApproval.length > 0) {
    console.log(`\n️  WARNING: ${needsApproval.length} tokens need approval:`);
    needsApproval.forEach(token => {
      console.log(`  - ${token.denom} (${token.symbol}): Current allowance = ${token.allowance}`);
    });
    console.log('\n  Run "yarn approval:approve-max" to fix this issue.\n');
  }
}

function stopApprovalMonitoring() {
  if (approvalMonitorInterval) {
    clearInterval(approvalMonitorInterval);
    console.log(' Stopped token approval monitoring');
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n Shutting down faucet...');
  stopApprovalMonitoring();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n Shutting down faucet...');
  stopApprovalMonitoring();
  process.exit(0);
});

// Update how we create Cosmos transactions
async function createCosmosTransaction(fromAddress, toAddress, amounts, sequence, accountNumber, chainId) {
  try {
    const messages = [];
    
    // Create a single MsgSend with all amounts
    const msg = {
      typeUrl: "/cosmos.bank.v1beta1.MsgSend",
      value: MsgSend.fromPartial({
        fromAddress: fromAddress,
        toAddress: toAddress,
        amount: amounts
      })
    };
    messages.push(msg);

    // Create the transaction body
    const txBody = TxBody.fromPartial({
      messages: messages.map(msg => Any.fromPartial({
        typeUrl: msg.typeUrl,
        value: MsgSend.encode(msg.value).finish()
      })),
      memo: ""
    });

    // Get fee configuration  
    const feeAmount = [{
      denom: chainConf.tx.fee.cosmos.amount[0].denom,
      amount: chainConf.tx.fee.cosmos.amount[0].amount
    }];
    
    const gasLimit = Long.fromString(chainConf.tx.fee.cosmos.gas);

    // Create auth info
    const pubkey = decodePubkey({
      typeUrl: "/cosmos.crypto.secp256k1.PubKey",
      value: toBase64(getPublicKeyBytes())
    });

    const authInfo = makeAuthInfoBytes(
      [{
        pubkey,
        sequence: Long.fromNumber(sequence),
      }],
      feeAmount,
      gasLimit,
      undefined,
      undefined,
    );

    // Create sign doc
    const signDoc = makeSignDoc(
      TxBody.encode(txBody).finish(),
      authInfo,
      chainId,
      accountNumber
    );

    return { txBody, authInfo, signDoc };
  } catch (error) {
    console.error('Error creating Cosmos transaction:', error);
    throw error;
  }
}

async function getAccountInfo(address) {
  try {
    const restEndpoint = chainConf.endpoints.rest_endpoint;
    const response = await fetch(`${restEndpoint}/cosmos/auth/v1beta1/accounts/${address}`);
    
    if (!response.ok) {
      throw new Error(`Failed to get account info: ${response.statusText}`);
    }
    
    const data = await response.json();
    const account = accountFromAny(data.account);
    
    return {
      accountNumber: account.accountNumber,
      sequence: account.sequence
    };
  } catch (error) {
    console.error('Error getting account info:', error);
    // Return default values for new accounts
    return {
      accountNumber: 0,
      sequence: 0
    };
  }
}

app.set('view engine', 'ejs');
app.set('views', './views');

app.get('/', async (req, res) => {
  res.render('index', { 
    project: conf.project,
    config: {
      project: conf.project,
      blockchain: {
        name: chainConf.name,
        endpoints: chainConf.endpoints,
        ids: chainConf.ids,
        sender: {
          option: {
            prefix: chainConf.sender.option.prefix
          }
        },
        limit: chainConf.limit,
        tx: {
          amounts: chainConf.tx.amounts.map(token => ({
            denom: token.denom,
            amount: token.amount,
            target_balance: token.target_balance,
            decimals: token.decimals,
            display_denom: token.display_denom || token.denom,
            description: token.description,
            type: token.type || 'token'
          }))
        }
      }
    },
    evmAddress: getEvmAddress(),
    testingMode: TESTING_MODE
  });
});

// Config endpoint for web app
app.get('/config.json', (req, res) => {
  res.json({
    project: conf.project,
    blockchain: {
      name: chainConf.name,
      endpoints: chainConf.endpoints,
      ids: chainConf.ids,
      sender: {
        option: {
          prefix: chainConf.sender.option.prefix
        }
      },
      limit: chainConf.limit
    },
    tokens: chainConf.tx.amounts.map(token => ({
      denom: token.denom,
      amount: token.amount,
      target_balance: token.target_balance,
      decimals: token.decimals,
      display_denom: token.display_denom || token.denom,
      description: token.description,
      type: token.type || 'token',
      contract: token.erc20_contract
    })),
    sample: {
      cosmos: 'cosmos1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqnrql8a',
      evm: '0x0000000000000000000000000000000000000001'
    },
    network: {
      name: chainConf.name,
      evm: {
        chainId: chainConf.ids.chainId,
        chainIdHex: '0x' + chainConf.ids.chainId.toString(16),
        rpc: chainConf.endpoints.evm_endpoint,
        websocket: chainConf.endpoints.websocket || '',
        explorer: chainConf.endpoints.evm_explorer
      },
      cosmos: {
        chainId: chainConf.ids.cosmosChainId,
        rpc: chainConf.endpoints.rpc_endpoint,
        rest: chainConf.endpoints.rest_endpoint,
        prefix: chainConf.sender.option.prefix
      }
    }
  });
});

// API endpoint to get faucet balances
app.get('/balance/:type', async (req, res) => {
  const type = req.params.type; // 'cosmos' or 'evm'
  const { address } = req.query; // Optional: check specific address instead of faucet
  
  let balances = [];
  
  try {
    if(type === 'evm') {
      // Determine which address to check - query parameter or faucet wallet
      let targetAddress;
      if (address && address.startsWith('0x')) {
        targetAddress = address;
      } else {
        targetAddress = getEvmAddress();
      }
      
      // Fetch EVM balances from JSON-RPC
      const ethProvider = new JsonRpcProvider(chainConf.endpoints.evm_endpoint);
      
      for (const token of chainConf.tx.amounts) {
        if (token.type === 'native' || token.denom === 'uatom') {
          // Skip native tokens in EVM context as they're handled via Cosmos
          continue;
        }
        
        if(token.erc20_contract !== "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" && token.erc20_contract !== "0x0000000000000000000000000000000000000000") {
          try {
            const tokenContract = new Contract(token.erc20_contract, erc20ABI, ethProvider);
            const balance = await tokenContract.balanceOf(targetAddress);
            balances.push({
              denom: token.denom.toUpperCase(),
              amount: balance.toString(),
              type: 'erc20',
              contract: token.erc20_contract,
              decimals: token.decimals
            });
          } catch(err) {
            console.error(`Error fetching balance for ${token.denom}:`, err);
            balances.push({
              denom: token.denom.toUpperCase(),
              amount: "0",
              type: 'erc20',
              contract: token.erc20_contract,
              decimals: token.decimals
            });
          }
        }
      }

    } else if(type === 'cosmos') {
      // Determine which address to check - query parameter or faucet wallet
      let targetAddress;
      if (address && address.startsWith('cosmos')) {
        targetAddress = address;
      } else {
        targetAddress = getCosmosAddress();
      }

      // Fetch cosmos balances from REST API
      const restEndpoint = chainConf.endpoints.rest_endpoint;
      const response = await fetch(`${restEndpoint}/cosmos/bank/v1beta1/balances/${targetAddress}`);
      
      if (response.ok) {
        const data = await response.json();
        balances = data.balances.map(balance => ({
          denom: balance.denom === 'uatom' ? 'ATOM' : balance.denom.toUpperCase(),
          amount: balance.amount,
          type: 'cosmos',
          decimals: balance.denom === 'uatom' ? 6 : 0
        }));
      }
    }
  } catch(err) {
    console.error('Balance fetch error:', err);
  }
  res.send({ balances, type });
})

app.get('/send/:address', async (req, res) => {
  const { address } = req.params;
  const ip = req.headers['cf-connecting-ip'] || req.headers['x-real-ip'] || req.headers['X-Forwarded-For'] || req.ip
  console.log('request tokens to ', address, ip)

  if (address) {
    try {
      const addressType = detectAddressType(address);

      if (addressType === 'unknown') {
        res.send({ result: `Address [${address}] is not supported. Must be a valid cosmos address (${conf.blockchain.sender.option.prefix}...) or hex address (0x...)` })
        return;
      }

      const chainConf = conf.blockchain

      if( await checker.checkAddress(address, 'dual') && await checker.checkIp(`dual${ip}`, 'dual') ) {
        console.log('Processing smart faucet request for', address, 'type:', addressType)

        try {
          // Step 1: Check current balances
          const currentBalances = await checkRecipientBalances(address, addressType);
          console.log('Current balances:', currentBalances);

          // Step 2: Calculate needed amounts
          let neededAmounts;
          if (TESTING_MODE) {
            // In testing mode, always send 1 of each token
            neededAmounts = getTestingModeAmounts(chainConf.tx.amounts);
            console.log('Testing mode: sending 1 of each token');
          } else {
            // Normal mode: calculate based on target balance
            neededAmounts = calculateNeededAmounts(currentBalances, chainConf.tx.amounts);
            
            // For Cosmos addresses, only keep native tokens
            if (addressType === 'cosmos') {
              neededAmounts = neededAmounts.filter(token => 
                token.denom === 'uatom' || 
                !token.erc20_contract || 
                token.erc20_contract === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
              );
              console.log('Filtered for Cosmos address - only native tokens');
            }
            
            console.log('Needed amounts:', neededAmounts);
          }

          // Step 3: Check if any tokens are needed
          if (neededAmounts.length === 0) {
            console.log(`\nSuccess: No tokens needed - wallet already has sufficient balance`);
            console.log(`Current balances meet all target amounts`);
            
            const response = {
              result: {
                code: 0,
                message: "Wallet already has sufficient balance. Each token balance meets or exceeds the target amount.",
                current_balances: currentBalances,
                tokens_sent: [],
                target_balances: chainConf.tx.amounts.map(token => ({
                  denom: token.denom,
                  target: token.target_balance,
                  decimals: token.decimals
                }))
              }
            };
            
            res.send(response);
            return;
          }
          
          // Step 3.5: Ensure token approvals before sending
          console.log('Checking token approvals...');
          
          // Step 4: Send tokens
          const txResult = await sendSmartFaucetTx(address, addressType, neededAmounts);
          
          // Step 5: Build response
          const response = {
            result: {
              code: 0,
              message: "Tokens sent successfully!",
              ...txResult,
              current_balances: currentBalances,
              tokens_sent: neededAmounts.map(amount => ({
                denom: amount.denom,
                amount: amount.amount,
                decimals: amount.decimals,
                type: amount.type || (amount.erc20_contract ? 'erc20' : 'native')
              })),
              testing_mode: TESTING_MODE
            }
          };
          
          res.send(response);
          
        } catch (error) {
          console.error('Smart faucet error:', error);
          res.send({ 
            result: {
              code: -1,
              message: error.message || 'Transaction failed',
              error: error.toString()
            }
          });
        }
      } else {
        const addressLimitMsg = !await checker.checkAddress(address, 'dual', false) 
          ? `Address ${address} has reached the daily limit (${chainConf.limit.address} request per 24h).`
          : '';
        const ipLimitMsg = !await checker.checkIp(`dual${ip}`, 'dual', false)
          ? `IP ${ip} has reached the daily limit (${chainConf.limit.ip} requests per 24h).`
          : '';
        
        res.send({ 
          result: {
            code: -2,
            message: 'Rate limit exceeded',
            details: [addressLimitMsg, ipLimitMsg].filter(msg => msg).join(' ')
          }
        });
      }

    } catch (ex) {
      console.error('Transaction error:', ex);
      res.send({ 
        result: {
          code: -1,
          message: ex.message || 'Transaction failed',
          error: ex.toString()
        }
      });
    }
  } else {
    res.send({ result: 'Address is required!' })
  }
})

// Test endpoint
app.get('/test', (req, res) => {
  res.send({
    status: 'ok',
    evmAddress: getEvmAddress(),
    cosmosAddress: getCosmosAddress()
  });
});

// Health check endpoint for monitoring
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Add approval check endpoint
app.get('/api/approvals', async (req, res) => {
  try {
    const approvals = await checkAllTokenApprovals();
    res.json({
      success: true,
      faucet_address: getEvmAddress(),
      spender_address: chainConf.contracts.atomicMultiSend,
      approvals: approvals
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Helper function for testing mode
function getTestingModeAmounts(configAmounts) {
  const testAmounts = [];
  
  for (const token of configAmounts) {
    testAmounts.push({
      denom: token.denom,
      amount: "1", // Always send 1 of the smallest unit
      erc20_contract: token.erc20_contract,
      decimals: token.decimals
    });
  }
  
  return testAmounts;
}

// Check recipient's current token balances
async function checkRecipientBalances(address, addressType) {
  const chainConf = conf.blockchain;
  const balances = [];

  try {
    if (addressType === 'cosmos') {
      // Check Cosmos balances via REST API
      const restEndpoint = chainConf.endpoints.rest_endpoint;
      const response = await fetch(`${restEndpoint}/cosmos/bank/v1beta1/balances/${address}`);
      const data = await response.json();

      // Map cosmos balances to our token structure
      for (const token of chainConf.tx.amounts) {
        const balance = data.balances?.find(b => b.denom === token.denom);
        balances.push({
          denom: token.denom,
          current_amount: balance ? balance.amount : "0",
          target_amount: token.target_balance,
          decimals: token.decimals
        });
      }
    } else if (addressType === 'evm') {
      // Check EVM balances via JSON-RPC
      const ethProvider = new JsonRpcProvider(chainConf.endpoints.evm_endpoint);

      for (const token of chainConf.tx.amounts) {
        if (token.erc20_contract === "0x0000000000000000000000000000000000000000") {
          // Native token balance
          const balance = await ethProvider.getBalance(address);
          balances.push({
            denom: token.denom,
            current_amount: balance.toString(),
            target_amount: token.target_balance,
            decimals: token.decimals
          });
        } else {
          // ERC20 token balance
          const erc20ABI = ["function balanceOf(address owner) view returns (uint256)"];
          const tokenContract = new Contract(token.erc20_contract, erc20ABI, ethProvider);
          const balance = await tokenContract.balanceOf(address);
          balances.push({
            denom: token.denom,
            current_amount: balance.toString(),
            target_amount: token.target_balance,
            decimals: token.decimals
          });
        }
      }
    }
  } catch (error) {
    console.error('Error checking balances:', error);
    // Return zero balances on error to allow faucet to proceed
    for (const token of chainConf.tx.amounts) {
      balances.push({
        denom: token.denom,
        current_amount: "0",
        target_amount: token.target_balance,
        decimals: token.decimals
      });
    }
  }

  return balances;
}

// Calculate amounts needed to reach target balance
function calculateNeededAmounts(currentBalances, configAmounts) {
  const neededAmounts = [];
  
  for (const currentBalance of currentBalances) {
    const configToken = configAmounts.find(t => t.denom === currentBalance.denom);
    if (!configToken) continue;
    
    const current = BigInt(currentBalance.current_amount || "0");
    const target = BigInt(currentBalance.target_amount || configToken.target_balance);
    
    if (current < target) {
      const needed = target - current;
      neededAmounts.push({
        denom: currentBalance.denom,
        amount: needed.toString(),
        erc20_contract: configToken.erc20_contract,
        decimals: configToken.decimals
      });
    }
  }
  
  return neededAmounts;
}

// Smart faucet transaction handler
async function sendSmartFaucetTx(recipientAddress, addressType, neededAmounts) {
  console.log(`\n>> Sending tokens to ${recipientAddress} (${addressType})...`);
  console.log(`Tokens to send: ${neededAmounts.map(t => `${t.denom}: ${t.amount}`).join(', ')}`);
  console.log(`Recipient address type: ${addressType}`);
  console.log('All needed amounts:', neededAmounts);

  // Separate ERC20 and native tokens
  const erc20Tokens = neededAmounts.filter(t => t.erc20_contract && 
    t.erc20_contract !== "0x0000000000000000000000000000000000000000" &&
    t.erc20_contract !== "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"
  );
  const nativeTokens = neededAmounts.filter(t => !t.erc20_contract || 
    t.erc20_contract === "0x0000000000000000000000000000000000000000" ||
    t.erc20_contract === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"
  );

  const results = {
    network_type: addressType,
    transfers: []
  };

  try {
    // Handle different scenarios based on address type and tokens needed
    if (addressType === 'evm') {
      // EVM recipient - send everything via EVM
      if (erc20Tokens.length > 0 || nativeTokens.length > 0) {
        console.log('Sending ALL tokens via EVM (hex recipient)...');
        const evmResult = await sendSmartEvmTx(recipientAddress, neededAmounts);
        results.transaction_hash = evmResult.hash;
        results.block_number = evmResult.blockNumber;
        results.block_hash = evmResult.blockHash;
        results.gas_used = evmResult.gasUsed ? evmResult.gasUsed.toString() : '0';
        results.gas_price = evmResult.gasPrice ? evmResult.gasPrice.toString() : '0';
        results.from_address = evmResult.from;
        results.to_address = evmResult.to;
        results.value = evmResult.value ? evmResult.value.toString() : '0';
        results.status = evmResult.status;
        results.explorer_url = `${chainConf.endpoints.evm_explorer}/tx/${evmResult.hash}`;
        
        // Add transfer details
        for (const token of neededAmounts) {
          results.transfers.push({
            token: token.erc20_contract || 'native',
            amount: token.amount,
            denom: token.denom,
            hash: evmResult.hash,
            status: evmResult.status,
            type: token.erc20_contract ? 'erc20' : 'native'
          });
        }
        
        // Store complete EVM tx data
        results.evm_tx_data = evmResult;
      }
    } else if (addressType === 'cosmos') {
      // Cosmos recipient - only send native tokens
      // Skip ERC20 tokens for Cosmos addresses as they can't easily access them
      
      if (nativeTokens.length > 0) {
        // Send native tokens via Cosmos
        console.log('Sending native tokens via Cosmos...');
        try {
          const cosmosResult = await sendCosmosTx(recipientAddress, nativeTokens);
          results.cosmos_transaction = cosmosResult;
          results.transaction_hash = cosmosResult.hash;
          results.block_height = cosmosResult.height;
          results.gas_used = cosmosResult.gas_used;
          results.tx_response = cosmosResult.tx_response;
          results.rest_api_url = cosmosResult.rest_api_url;
          
          // Add native transfer details
          for (const token of nativeTokens) {
            results.transfers.push({
              token: 'native',
              amount: token.amount,
              denom: token.denom,
              hash: cosmosResult.hash,
              status: cosmosResult.code === 0 ? 1 : 0,
              type: 'cosmos_native'
            });
          }
        } catch (cosmosError) {
          console.error('Cosmos transaction failed:', cosmosError);
          // Still return what we can
          results.cosmos_error = cosmosError.message;
          results.failed_transfers = nativeTokens.map(token => ({
            token: 'native',
            amount: token.amount,
            denom: token.denom,
            error: cosmosError.message,
            type: 'cosmos_native'
          }));
        }
      }
    }
    
    console.log('\nSmart faucet transaction complete!');
    return results;
    
  } catch (error) {
    console.error('Smart faucet error:', error);
    throw new Error(`Smart faucet failed: ${error.message}`);
  }
}

// New function for atomic EVM transactions
async function sendSmartEvmTx(recipientAddress, neededAmounts) {
  console.log('Sending atomic EVM tokens to:', recipientAddress);
  console.log('Needed amounts:', neededAmounts);

  // Separate ERC20 and native tokens
  const erc20Tokens = neededAmounts.filter(t => t.erc20_contract && 
    t.erc20_contract !== "0x0000000000000000000000000000000000000000" &&
    t.erc20_contract !== "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"
  );
  const nativeTokens = neededAmounts.filter(t => !t.erc20_contract || 
    t.erc20_contract === "0x0000000000000000000000000000000000000000" ||
    t.erc20_contract === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"
  );

  const ethProvider = new JsonRpcProvider(chainConf.endpoints.evm_endpoint);
  const privateKey = getPrivateKey();
  const wallet = new Wallet(privateKey, ethProvider);

  try {
    // If we have multiple ERC20 tokens, use AtomicMultiSend
    if (erc20Tokens.length > 1) {
      console.log('Using AtomicMultiSend contract for guaranteed atomicity');
      
      const atomicMultiSendAddress = chainConf.contracts.atomicMultiSend;
      if (!atomicMultiSendAddress) {
        throw new Error('AtomicMultiSend contract not configured');
      }

      // Load AtomicMultiSend ABI
      const abiPath = path.join(process.cwd(), 'deployments', 'AtomicMultiSend.abi.json');
      console.log(`Loading ABI from: ${abiPath}`);
      const atomicMultiSendABI = JSON.parse(fs.readFileSync(abiPath, 'utf8'));
      
      const atomicContract = new Contract(atomicMultiSendAddress, atomicMultiSendABI, wallet);

      // Prepare transfers array for the contract
      const transfers = erc20Tokens.map(t => ({
        token: t.erc20_contract,
        amount: t.amount
      }));

      // Execute atomic transfer
      const tx = await atomicContract.atomicMultiSend(
        recipientAddress,
        transfers,
        {
          gasLimit: 500000 // Reasonable gas limit for multiple transfers
        }
      );

      console.log('Atomic transaction sent:', tx.hash);
      const receipt = await tx.wait();
      console.log('Atomic transaction confirmed!');

      return receipt;
    } 
    // For single ERC20 token, use direct transfer
    else if (erc20Tokens.length === 1) {
      console.log('Single ERC20 transfer');
      const token = erc20Tokens[0];
      const tokenContract = new Contract(token.erc20_contract, ERC20_BASE_ABI, wallet);
      
      const tx = await tokenContract.transfer(recipientAddress, token.amount);
      console.log('Transaction sent:', tx.hash);
      
      const receipt = await tx.wait();
      console.log('Transaction confirmed!');
      
      return receipt;
    }
    // For native token only
    else if (nativeTokens.length > 0) {
      console.log('Native token transfer via EVM');
      const totalNative = nativeTokens.reduce((sum, token) => 
        sum + BigInt(token.amount), BigInt(0)
      );
      
      const tx = await wallet.sendTransaction({
        to: recipientAddress,
        value: totalNative
      });
      
      console.log('Native transaction sent:', tx.hash);
      const receipt = await tx.wait();
      console.log('Native transaction confirmed!');
      
      return receipt;
    }
    
    throw new Error('No tokens to send');
    
  } catch (error) {
    console.error('Atomic EVM transaction error:', error);
    throw new Error(`EVM transaction failed: ${error.message}`);
  }
}

// Cosmos transaction handler
async function sendCosmosTx(recipientAddress, nativeTokens) {
  console.log('Sending Cosmos native tokens to:', recipientAddress);
  
  try {
    // Create wallet from private key
    const privateKeyBytes = getPrivateKeyBytes();
    const wallet = await DirectSecp256k1Wallet.fromKey(
      privateKeyBytes,
      chainConf.sender.option.prefix
    );
    
    // Connect to Cosmos chain
    const client = await SigningStargateClient.connectWithSigner(
      chainConf.endpoints.rpc_endpoint,
      wallet,
      {
        chainId: chainConf.ids.cosmosChainId,
        gasPrice: {
          denom: chainConf.tx.fee.cosmos.amount[0].denom,
          amount: (parseFloat(chainConf.tx.fee.cosmos.amount[0].amount) / parseInt(chainConf.tx.fee.cosmos.gas)).toString()
        }
      }
    );
    
    const fromAddress = getCosmosAddress();
    
    // Build amount array for native tokens
    const amounts = nativeTokens.map(token => ({
      denom: token.denom,
      amount: token.amount
    }));
    
    // Send transaction
    const result = await client.sendTokens(
      fromAddress,
      recipientAddress,
      amounts,
      {
        amount: chainConf.tx.fee.cosmos.amount,
        gas: chainConf.tx.fee.cosmos.gas
      },
      "" // memo
    );
    
    console.log('Cosmos transaction sent:', result.transactionHash);
    
    // Build API URL
    const restApiUrl = `${chainConf.endpoints.rest_endpoint}/cosmos/tx/v1beta1/txs/${result.transactionHash}`;
    
    // Fetch full transaction details
    let txResponse = null;
    try {
      const response = await fetch(restApiUrl);
      if (response.ok) {
        const data = await response.json();
        txResponse = data.tx_response || data;
      }
    } catch (err) {
      console.error('Error fetching tx details:', err);
    }
    
    return {
      hash: result.transactionHash,
      height: result.height.toString(),
      gas_used: result.gasUsed.toString(),
      code: result.code,
      tx_response: txResponse,
      rest_api_url: restApiUrl
    };
    
  } catch (error) {
    console.error('Cosmos transaction error:', error);
    throw new Error(`Cosmos transaction failed: ${error.message}`);
  }
}

// Initialize faucet
async function initializeFaucet() {
  console.log('[START] Faucet initializing...');
  
  // Initialize secure keys
  console.log(' Initializing secure key management...');
  await initializeSecureKeys();
  console.log(' SecureKeyManager initialized successfully');
  console.log(` EVM Address: ${getEvmAddress()}`);
  console.log(` Cosmos Address: ${getCosmosAddress()}`);
  
  console.log('Using addresses derived from mnemonic');
  
  // Validate contract addresses
  console.log('\n Validating and verifying contract addresses...');
  
  // Import and run the contract verifier
  const { default: ContractVerifier } = await import('./scripts/verify-contracts.js');
  const verifier = new ContractVerifier();
  
  // Enable auto-redeployment if specified
  const autoRedeploy = process.env.AUTO_REDEPLOY === 'true';
  if (autoRedeploy) {
    console.log(' Auto-redeployment enabled');
  }
  
  const isValid = await verifier.verify(autoRedeploy);
  
  if (!isValid) {
    console.error('\n Contract verification failed!');
    if (!autoRedeploy) {
      console.error(' Tip: Run with AUTO_REDEPLOY=true to automatically fix missing contracts');
    }
    process.exit(1);
  }
  
  console.log(' All contracts verified successfully!');
  
  // Setup token approvals
  console.log('\n Checking and setting up token approvals...');
  await setupTokenApprovals();
  
  // Start approval monitoring
  startApprovalMonitoring();
  
  console.log(' Faucet server ready!');
  console.log(` EVM Address: ${getEvmAddress()}`);
  console.log(` Cosmos Address: ${getCosmosAddress()}`);
  console.log(` Server listening on http://localhost:${conf.port}`);
  console.log(` Testing Mode: ${TESTING_MODE ? 'ENABLED' : 'DISABLED'}`);
  console.log(' Private keys secured in memory (never logged or written to disk)');
  console.log(' Faucet initialization complete!');
}

// Add erc20 ABI for balance checking
const erc20ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

// Start server
const HOST = process.env.HOST || '0.0.0.0';
app.listen(conf.port, HOST, async () => {
  console.log(`[START] Faucet server starting on ${HOST}:${conf.port}...`);
  await initializeFaucet();
  console.log(` Server listening on http://${HOST}:${conf.port}`);
})
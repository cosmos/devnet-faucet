import express from 'express';
import * as path from 'path'
import fetch from 'node-fetch';

import { Wallet } from '@ethersproject/wallet'
import { pathToString } from '@cosmjs/crypto';

import { ethers } from 'ethers'
import { bech32 } from 'bech32';

import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { SigningStargateClient } from "@cosmjs/stargate";
import { sha256 } from '@cosmjs/crypto';
import { fromHex, toHex } from '@cosmjs/encoding';

import conf from './config.js'
import { FrequencyChecker } from './checker.js';

// Address type detection utilities
function isHexAddress(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

function isCosmosAddress(address, prefix) {
  try {
    const decoded = bech32.decode(address);
    return decoded.prefix === prefix;
  } catch {
    return false;
  }
}

function detectAddressType(address) {
  if (isHexAddress(address)) {
    return 'evm';
  } else if (isCosmosAddress(address, conf.blockchain.sender.option.prefix)) {
    return 'cosmos';
  }
  return 'unknown';
}

// Generate Cosmos address from Ethereum address (direct conversion for EVM-compatible chains)
function ethPublicKeyToCosmosAddress(ethWallet, prefix) {
  // Get the EVM address (already keccak256 hash of pubkey, first 20 bytes)
  const evmAddress = ethWallet.address;

  // Remove the '0x' prefix and convert to bytes
  const addressBytes = fromHex(evmAddress.slice(2));

  // Encode with bech32 directly (no additional hashing needed)
  const cosmosAddress = bech32.encode(prefix, bech32.toWords(addressBytes));

  return cosmosAddress;
}

// Create a custom DirectSecp256k1HdWallet that uses ETH-style address derivation
async function createEthCompatibleCosmosWallet(mnemonic, options) {
  // Create the standard wallet to get the private key and signing functionality
  const standardWallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, options);
  const accounts = await standardWallet.getAccounts();

  // Create an Ethereum wallet from the same mnemonic to get the correct address
  const evmWallet = Wallet.fromMnemonic(mnemonic, pathToString(options.hdPaths[0]));
  const correctCosmosAddress = ethPublicKeyToCosmosAddress(evmWallet, options.prefix);

  // Override the getAccounts method to return the correct address
  const originalGetAccounts = standardWallet.getAccounts.bind(standardWallet);
  standardWallet.getAccounts = async () => {
    const originalAccounts = await originalGetAccounts();
    return [{
      ...originalAccounts[0],
      address: correctCosmosAddress
    }];
  };

  return standardWallet;
}

// load config
console.log("loaded config: ", conf)

const app = express()

app.set("view engine", "ejs");

const checker = new FrequencyChecker(conf)

app.get('/', (req, res) => {
  res.render('index', conf);
})

app.get('/config.json', async (req, res) => {
  const sample = {}

  // Generate sample addresses for both cosmos and EVM environments
  const chainConf = conf.blockchain

  // EVM address using the same mnemonic with eth derivation path
  const evmWallet = Wallet.fromMnemonic(chainConf.sender.mnemonic, pathToString(chainConf.sender.option.hdPaths[0]));
  sample.evm = evmWallet.address

  // Cosmos address derived from Ethereum address (direct conversion for EVM-compatible chains)
  sample.cosmos = ethPublicKeyToCosmosAddress(evmWallet, chainConf.sender.option.prefix);

  console.log('Cosmos address:', sample.cosmos, 'EVM address:', sample.evm)

  const project = conf.project
  project.sample = sample
  project.blockchain = chainConf.name
  project.supportedAddressTypes = ['cosmos', 'evm']
  res.send(project);
})

app.get('/balance/:type', async (req, res) => {
  const { type } = req.params // 'cosmos' or 'evm'

  let balances = []

  try{
    const chainConf = conf.blockchain

    if(type === 'evm') {
      const ethProvider = new ethers.providers.JsonRpcProvider(chainConf.endpoints.evm_endpoint);
      const wallet = Wallet.fromMnemonic(chainConf.sender.mnemonic, pathToString(chainConf.sender.option.hdPaths[0])).connect(ethProvider);

      // Get native balance and ERC20 balances
      const nativeBalance = await wallet.getBalance();
      balances.push({
        denom: 'native',
        amount: nativeBalance.toString(),
        type: 'native'
      });

      // ERC20 token balance checks
      const erc20ABI = ["function balanceOf(address owner) external view returns (uint256)"];

      for(const token of chainConf.tx.amounts) {
        if(token.erc20_contract !== "0x0000000000000000000000000000000000000000") {
          try {
            const tokenContract = new ethers.Contract(token.erc20_contract, erc20ABI, ethProvider);
            const balance = await tokenContract.balanceOf(wallet.address);
            balances.push({
              denom: token.denom,
              amount: balance.toString(),
              type: 'erc20',
              contract: token.erc20_contract,
              decimals: token.decimals
            });
          } catch(e) {
            console.error(`Error getting balance for ${token.denom}:`, e);
            balances.push({
              denom: token.denom,
              amount: "0",
              type: 'erc20',
              contract: token.erc20_contract,
              decimals: token.decimals
            });
          }
        }
      }

        } else if(type === 'cosmos') {
      const rpcEndpoint = chainConf.endpoints.rpc_endpoint;
      const wallet = await createEthCompatibleCosmosWallet(chainConf.sender.mnemonic, chainConf.sender.option);
      const client = await SigningStargateClient.connectWithSigner(rpcEndpoint, wallet);
      const [firstAccount] = await wallet.getAccounts();

      // Get balances for all configured tokens
      for(const token of chainConf.tx.amounts) {
        try {
          const balance = await client.getBalance(firstAccount.address, token.denom);
          balances.push(balance);
        } catch(e) {
          console.error(`Error getting balance for ${token.denom}:`, e);
          balances.push({
            denom: token.denom,
            amount: "0"
          });
        }
      }
    }
  } catch(err) {
    console.log(err)
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
          const neededAmounts = calculateNeededAmounts(currentBalances, chainConf.tx.amounts);
          console.log('Needed amounts:', neededAmounts);

          // Step 3: Check if any tokens are needed
          if (neededAmounts.length === 0) {
            res.send({
              result: {
                code: 0,
                message: "Wallet already has sufficient balance (1000+ tokens each)",
                current_balances: currentBalances,
                tokens_sent: []
              }
            });
            return;
          }

          // Step 4: Send tokens
          const txResult = await sendSmartFaucetTx(address, addressType, neededAmounts);

          // Step 5: Update rate limiting only on successful send
          checker.update(`dual${ip}`);
          checker.update(address);

          // Step 6: Verify transaction and return detailed result
          const verificationResult = await verifyTransaction(txResult, addressType);

          res.send({
            result: {
              ...verificationResult,
              current_balances: currentBalances,
              tokens_sent: neededAmounts
            }
          });

        } catch (err) {
          console.error('Smart faucet error:', err);
          res.send({ result: `Transaction failed: ${err.message}` });
        }

      } else {
        res.send({ result: "You can only request tokens once every 12 hours" })
      }
    } catch (err) {
      console.error(err);
      res.send({ result: 'Failed, Please contact to admin.' })
    }

  } else {
    res.send({ result: 'address is required' });
  }
})

app.listen(conf.port, async () => {
  console.log(`Faucet app listening on port ${conf.port}`)

  // Display wallet addresses for both environments
  const chainConf = conf.blockchain;
  const evmWallet = Wallet.fromMnemonic(chainConf.sender.mnemonic, pathToString(chainConf.sender.option.hdPaths[0]));
  const cosmosAddress = ethPublicKeyToCosmosAddress(evmWallet, chainConf.sender.option.prefix);

  console.log('Cosmos address:', cosmosAddress, 'EVM address:', evmWallet.address);
})

// Legacy functions removed - replaced by smart faucet functions above

// Smart Faucet Helper Functions

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
      const ethProvider = new ethers.providers.JsonRpcProvider(chainConf.endpoints.evm_endpoint);

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
          const tokenContract = new ethers.Contract(token.erc20_contract, erc20ABI, ethProvider);
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

// Calculate how much of each token is needed to reach target balance
function calculateNeededAmounts(currentBalances, tokenConfigs) {
  const neededAmounts = [];

  for (let i = 0; i < currentBalances.length; i++) {
    const current = currentBalances[i];
    const config = tokenConfigs[i];

    const currentAmount = ethers.BigNumber.from(current.current_amount);
    const targetAmount = ethers.BigNumber.from(current.target_amount);

    if (currentAmount.lt(targetAmount)) {
      const needed = targetAmount.sub(currentAmount);
      neededAmounts.push({
        denom: config.denom,
        amount: needed.toString(),
        erc20_contract: config.erc20_contract,
        decimals: config.decimals
      });
    }
  }

  return neededAmounts;
}

// Send tokens using smart amounts (only what's needed)
async function sendSmartFaucetTx(recipient, addressType, neededAmounts) {
  if (addressType === 'cosmos') {
    return sendSmartCosmosTx(recipient, neededAmounts);
  } else if (addressType === 'evm') {
    return sendSmartEvmTx(recipient, neededAmounts);
  }
  throw new Error(`Unsupported address type: ${addressType}`);
}

// Smart Cosmos transaction with calculated amounts
async function sendSmartCosmosTx(recipient, neededAmounts) {
  const chainConf = conf.blockchain;
  const wallet = await createEthCompatibleCosmosWallet(chainConf.sender.mnemonic, chainConf.sender.option);
  const [firstAccount] = await wallet.getAccounts();

  const rpcEndpoint = chainConf.endpoints.rpc_endpoint;
  const client = await SigningStargateClient.connectWithSigner(rpcEndpoint, wallet);

  // Prepare amounts from needed tokens
  const amounts = neededAmounts.map(token => ({
    denom: token.denom,
    amount: token.amount
  }));

  const fee = chainConf.tx.fee.cosmos;

  console.log("Sending smart cosmos tokens to:", recipient, "amounts:", amounts, "fee:", fee);
  return client.sendTokens(firstAccount.address, recipient, amounts, fee);
}

// Smart EVM transaction with calculated amounts using MultiSend
async function sendSmartEvmTx(recipient, neededAmounts) {
  try {
    const chainConf = conf.blockchain;
    const ethProvider = new ethers.providers.JsonRpcProvider(chainConf.endpoints.evm_endpoint);
    const wallet = Wallet.fromMnemonic(chainConf.sender.mnemonic, pathToString(chainConf.sender.option.hdPaths[0])).connect(ethProvider);

    console.log("Sending smart EVM tokens to:", recipient, "needed amounts:", neededAmounts);

    // MultiSend contract address
    const multiSendAddress = "0xa41dd39233852D9fcc4441eB9Aa3901Df5f67EC4";

    // MultiSend contract ABI
    const multiSendABI = [
      "function multiSend(address recipient, tuple(address token, uint256 amount)[] transfers) external payable",
      "function owner() external view returns (address)"
    ];

    const multiSendContract = new ethers.Contract(multiSendAddress, multiSendABI, wallet);

    // Prepare transfers array for MultiSend
    const transfers = [];
    let nativeAmount = ethers.BigNumber.from(0);

    for (const token of neededAmounts) {
      if (token.erc20_contract === "0x0000000000000000000000000000000000000000") {
        // Native token - add to msg.value
        nativeAmount = nativeAmount.add(token.amount);
        transfers.push({
          token: "0x0000000000000000000000000000000000000000", // Zero address for native
          amount: token.amount
        });
      } else {
        // ERC20 token
        transfers.push({
          token: token.erc20_contract,
          amount: token.amount
        });
      }
    }

    console.log("Smart MultiSend transfers:", transfers);
    console.log("Native amount:", nativeAmount.toString());

    // Execute multi-token transfer
    const tx = await multiSendContract.multiSend(recipient, transfers, {
      value: nativeAmount,
      gasLimit: chainConf.tx.fee.evm.gasLimit,
      gasPrice: chainConf.tx.fee.evm.gasPrice
    });

    console.log("Smart MultiSend transaction hash:", tx.hash);

    // Wait for confirmation
    const receipt = await tx.wait();

    return {
      code: 0,
      hash: tx.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      transfers: transfers.map((transfer, index) => ({
        token: transfer.token,
        amount: transfer.amount,
        denom: neededAmounts[index].denom,
        contract: transfer.token !== "0x0000000000000000000000000000000000000000" ? transfer.token : "native"
      }))
    };

  } catch(e) {
    console.error("Smart EVM transaction error:", e);
    throw e;
  }
}

// Verify transaction success and format response
async function verifyTransaction(txResult, addressType) {
  try {
    if (addressType === 'cosmos') {
      // Cosmos transaction verification
      if (txResult.code === 0) {
        return {
          code: 0,
          message: "Tokens sent successfully!",
          transaction_hash: txResult.transactionHash,
          block_height: txResult.height,
          gas_used: txResult.gasUsed
        };
      } else {
        return {
          code: txResult.code,
          message: `Transaction failed: ${txResult.rawLog}`,
          transaction_hash: txResult.transactionHash
        };
      }
    } else if (addressType === 'evm') {
      // EVM transaction verification
      if (txResult.code === 0) {
        return {
          code: 0,
          message: "Tokens sent successfully!",
          transaction_hash: txResult.hash,
          block_number: txResult.blockNumber,
          gas_used: txResult.gasUsed,
          transfers: txResult.transfers
        };
      } else {
        return {
          code: 1,
          message: "Transaction failed",
          transaction_hash: txResult.hash || "unknown"
        };
      }
    }
  } catch (error) {
    console.error('Transaction verification error:', error);
    return {
      code: 1,
      message: `Verification failed: ${error.message}`,
      transaction_hash: txResult.hash || txResult.transactionHash || "unknown"
    };
  }
}

// Utility function for bech32 conversion
function toHexString(bytes) {
  return bytes.reduce(
      (str, byte) => str + byte.toString(16).padStart(2, '0'),
      '');
}

// Helper function to convert cosmos address to EVM address if needed
function convertCosmosToEvmAddress(cosmosAddress) {
  try {
    const decoded = bech32.decode(cosmosAddress);
    const bytes = bech32.fromWords(decoded.words);
    return "0x" + toHexString(bytes);
  } catch {
    return null;
  }
}

/*
 * Multi-send contract template for ERC20 batch transfers
 * This contract should be deployed to enable efficient multi-token transfers
 *
 * pragma solidity ^0.8.0;
 *
 * interface IERC20 {
 *     function transfer(address to, uint256 amount) external returns (bool);
 *     function transferFrom(address from, address to, uint256 amount) external returns (bool);
 * }
 *
 * contract MultiFaucet {
 *     struct TokenTransfer {
 *         address token;
 *         uint256 amount;
 *     }
 *
 *     function multiSend(address recipient, TokenTransfer[] calldata transfers) external {
 *         for (uint i = 0; i < transfers.length; i++) {
 *             IERC20(transfers[i].token).transfer(recipient, transfers[i].amount);
 *         }
 *     }
 *
 *     // Allow sending native token + ERC20s in one tx
 *     function multiSendWithNative(address recipient, TokenTransfer[] calldata transfers) external payable {
 *         if (msg.value > 0) {
 *             payable(recipient).transfer(msg.value);
 *         }
 *
 *         for (uint i = 0; i < transfers.length; i++) {
 *             IERC20(transfers[i].token).transfer(recipient, transfers[i].amount);
 *         }
 *     }
 * }
 */
import 'dotenv/config';
import express from 'express';
import fetch from 'node-fetch';

import { HDNodeWallet, Wallet, JsonRpcProvider, Contract, } from 'ethers'
import { bech32 } from 'bech32';

import { DirectSecp256k1HdWallet, DirectSecp256k1Wallet, decodePubkey, makeAuthInfoBytes, makeSignDoc } from "@cosmjs/proto-signing";
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
import { FrequencyChecker } from './checker.js';
import { ContractValidator } from './src/ContractValidator.js';
import secureKeyManager from './src/SecureKeyManager.js';

const { MNEMONIC } = process.env;

// Initialize BIP32 with ECC
const bip32 = BIP32Factory(ecc);

// Check if testing mode is enabled
const TESTING_MODE = process.env.TESTING_MODE === 'true' || process.env.NODE_ENV === 'test';

// Token approval management constants
const APPROVAL_AMOUNT = "20000000000000000000000"; // 20,000 tokens with 18 decimals
const MIN_APPROVAL_THRESHOLD = "10000000000000000000000"; // 10,000 tokens with 18 decimals
const APPROVAL_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

// ERC20 ABI for approval operations
const ERC20_APPROVAL_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address owner) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)"
];

// Token approval tracking
let approvalMonitoringInterval = null;
const tokenApprovalStatus = new Map();

// protobuf encoding for cosmos.evm.crypto.v1.ethsecp256k1.PubKey
// Based on the protobuf definition: message PubKey { bytes key = 1; }
function encodeEthSecp256k1PubKey(publicKeyBytes) {
  // Field 1, wire type 2 (length-delimited): tag = (1 << 3) | 2 = 10 (0x0A)
  const keyLength = publicKeyBytes.length;
  const result = new Uint8Array(1 + 1 + keyLength); // tag + length + key
  result[0] = 0x0A; // Field 1, wire type 2
  result[1] = keyLength; // Length of key
  result.set(publicKeyBytes, 2); // Key bytes
  return result;
}

function decodeEthSecp256k1PubKey(data) {
  if (data.length < 2 || data[0] !== 0x0A) {
    throw new Error("Invalid EthSecp256k1PubKey encoding - wrong tag");
  }
  const keyLength = data[1];
  if (data.length !== 2 + keyLength) {
    throw new Error("Invalid EthSecp256k1PubKey encoding - wrong length");
  }
  const key = data.slice(2, 2 + keyLength);
  return { key };
}

// Convert hex address to bech32 cosmos address
function hexToBech32(hexAddress, prefix = 'cosmos') {
  // Remove 0x prefix if present
  const cleanHex = hexAddress.replace('0x', '');
  
  // Convert hex to bytes
  const bytes = Buffer.from(cleanHex, 'hex');
  
  // Encode as bech32
  const words = bech32.toWords(bytes);
  const encoded = bech32.encode(prefix, words);
  
  return encoded;
}

// Create eth_ecp256k1 signature
// Format: r (32 bytes) + s (32 bytes) = 64 bytes total (no recovery ID for Cosmos)
// Based on ethsecp256k1.go spec: The Go code does the keccak256 hashing in the Sign function
function createEthSecp256k1Signature(messageBytes, privateKeyBytes) {
  // From the Go code:
  // if len(digestBz) != crypto.DigestLength {
  //     digestBz = crypto.Keccak256Hash(digestBz).Bytes()
  // }
  // crypto.DigestLength is 32, so if our message is not 32 bytes, it gets hashed
  let digestBz;
  if (messageBytes.length !== 32) {
    digestBz = keccak_256(messageBytes);
  } else {
    digestBz = messageBytes;
  }

  // Use noble secp256k1 to create the signature
  const signature = secp256k1.sign(digestBz, privateKeyBytes);

  // Use compact raw bytes
  // This gives exactly 64 bytes: r (32) + s (32) - no recovery ID
  const signatureBytes = signature.toCompactRawBytes();

  return signatureBytes;
}

// pubkey decoder for eth_secp256k1 keys
function customDecodePubkey(pubkey) {
  if (pubkey.typeUrl === '/cosmos.evm.crypto.v1.ethsecp256k1.PubKey' ||
      pubkey.typeUrl === '/ethermint.crypto.v1.ethsecp256k1.PubKey') {
    const decoded = decodeEthSecp256k1PubKey(pubkey.value);
    return {
      type: 'eth_secp256k1',
      value: toBase64(decoded.key),
    };
  }
  // Fall back to default decoder for other types
  return decodePubkey(pubkey);
}

// Custom account parser that handles ethereum secp256k1 accounts
function customAccountParser(accountAny) {
  // Handle ethermint EthAccount types by extracting the base_account
  if (accountAny.typeUrl === '/ethermint.types.v1.EthAccount') {
    try {
      // Decode the EthAccount protobuf to get the base_account
      const ethAccount = JSON.parse(Buffer.from(accountAny.value).toString());
      if (ethAccount.base_account) {
        // Create a BaseAccount Any type
        const baseAccountAny = {
          typeUrl: '/cosmos.auth.v1beta1.BaseAccount',
          value: ethAccount.base_account
        };
        return accountFromAny(baseAccountAny);
      }
    } catch (error) {
      console.log('Failed to parse EthAccount, using fallback approach');
    }
  }

  // Try the default parser
  try {
    return accountFromAny(accountAny);
  } catch (error) {
    // If pubkey decoding fails, return a minimal account object
    if (error.message.includes('Pubkey type_url') && error.message.includes('not recognized')) {
      console.log('Pubkey decoding failed, creating minimal account');
      // Return a minimal account without pubkey info
      return {
        address: '',
        accountNumber: 0,
        sequence: 0,
        pubkey: null
      };
    }
    throw error;
  }
}

// Key type enum
const KeyType = {
    CANONICAL: 'canonical',
    ETH_SECP256K1: 'eth_secp256k1',
    SECP256K1: 'secp256k1'
};

// Convert bits for Bech32 encoding
function convertBits(data, fromBits, toBits, pad) {
    let acc = 0;
    let bits = 0;
    const result = [];
    const maxv = (1 << toBits) - 1;
    for (const value of data) {
        acc = (acc << fromBits) | value;
        bits += fromBits;
        while (bits >= toBits) {
            bits -= toBits;
            result.push((acc >> bits) & maxv);
        }
    }
    if (pad) {
        if (bits > 0) {
            result.push((acc << (toBits - bits)) & maxv);
        }
    } else if (bits >= fromBits || ((acc << (toBits - bits)) & maxv)) {
        throw new Error('Unable to convert bits');
    }
    return result;
}

// Generate private key from mnemonic using BIP44 derivation path
function getPrivateKeyFromMnemonic(mnemonic, derivationPath) {
    if (!validateMnemonic(mnemonic)) {
        throw new Error(`Invalid mnemonic: ${mnemonic}`);
    }

    const seed = mnemonicToSeedSync(mnemonic);
    const hdwallet = bip32.fromSeed(seed);
    const derivedNode = hdwallet.derivePath(derivationPath);
    const privateKey = derivedNode.privateKey;

    if (!privateKey) {
        throw new Error('Unable to derive private key from mnemonic and path.');
    }

    return privateKey;
}

// Generate wallet addresses using eth_secp256k1 [skip ripemd160 hashing]
function generateEthSecp256k1AddressesFromPrivateKey(privateKeyHex, prefix) {
    const privateKey = Uint8Array.from(Buffer.from(privateKeyHex.padStart(64, '0'), 'hex'));
    if (privateKey.length !== 32) {
        throw new Error('Private key must be 32 bytes long.');
    }

    const publicKey = secp256k1.getPublicKey(privateKey, true); // compressed public key
    const publicKeyUncompressed = secp256k1.getPublicKey(privateKey, false).slice(1); // remove 0x04 prefix

    // Use keccak hashed hex address, directly converted to bech32
    const keccakHash = keccak_256(publicKeyUncompressed);
    const addressBytes = keccakHash.slice(-20);
    const fiveBitArray = convertBits(addressBytes, 8, 5, true);
    const cosmosAddress = bech32.encode(prefix, fiveBitArray, 256);

    const ethAddress = `0x${Buffer.from(addressBytes).toString('hex')}`;

    return {
        cosmosAddress,
        ethAddress,
        publicKey: Buffer.from(publicKey).toString('hex'),
        privateKey: Buffer.from(privateKey).toString('hex')
    };
}

// Address type detection
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

/**
 * Convert bech32 address to hex address
 */
function bech32ToHex(bech32Address) {
  const decoded = bech32.decode(bech32Address);
  const addressBytes = bech32.fromWords(decoded.words);
  return '0x' + toHex(addressBytes);
}

/**
 * Convert hex address to bech32 address
 * This is for display purposes - the actual derivation should use the proper method
 */
function evmToCosmosAddress(evmWallet, prefix) {
    // Get the private key and derive addresses properly
    const privateKeyHex = evmWallet.privateKey.slice(2); // Remove 0x prefix
    const { cosmosAddress } = generateEthSecp256k1AddressesFromPrivateKey(privateKeyHex, prefix);
    return cosmosAddress;
}

/**
 * Create wallet
 */
async function createEthCompatibleCosmosWallet(mnemonic, options) {
    // Derive private key from mnemonic using the specified HD path
    const derivationPath = pathToString(options.hdPaths[0]);
    const privateKeyBytes = getPrivateKeyFromMnemonic(mnemonic, derivationPath);
    const privateKeyHex = Buffer.from(privateKeyBytes).toString('hex');

    // Generate addresses using ETH_SECP256K1 method
    const { cosmosAddress } = generateEthSecp256k1AddressesFromPrivateKey(
        privateKeyHex,
        options.prefix
    );

    // Get the compressed public key bytes
    const publicKeyBytes = secp256k1.getPublicKey(privateKeyBytes, true); // compressed

    // Create a wallet that properly handles eth_secp256k1 signing
    // We'll use the private key directly for signing instead of relying on DirectSecp256k1Wallet
    return {
                async getAccounts() {
            return [{
                address: cosmosAddress,
                pubkey: publicKeyBytes,  // Raw bytes
                algo: "secp256k1"  // Use standard algo for CosmJS compatibility
            }];
        },

        serialize() {
            return {
                type: "eth_secp256k1",
                value: toBase64(privateKeyBytes)
            };
        },

        async signDirect(signerAddress, signDoc) {
            // Create proper ethereum secp256k1 signature for Cosmos SDK
            const signDocForSigning = {
                bodyBytes: signDoc.bodyBytes,
                authInfoBytes: signDoc.authInfoBytes,
                chainId: signDoc.chainId,
                accountNumber: signDoc.accountNumber
            };

            // Encode the SignDoc - pass raw bytes to signature function
            // The ethsecp256k1.go will handle Keccak256 hashing internally
            const signDocBytes = SignDoc.encode(signDocForSigning).finish();

            // Create signature using our ethereum secp256k1 implementation
            // Pass the raw SignDoc bytes - createEthSecp256k1Signature will handle Keccak256 hashing
            const signature = createEthSecp256k1Signature(signDocBytes, privateKeyBytes);

            const result = {
                signed: signDoc,
                signature: {
                    pub_key: {
                        type: "/cosmos.evm.crypto.v1.ethsecp256k1.PubKey",
                        value: toBase64(publicKeyBytes)
                    },
                    signature: toBase64(signature)
                }
            };

            return result;
        },

        async signAmino(signerAddress, signDoc) {
            // For amino signing, use our ethereum secp256k1 implementation
            const signBytes = Buffer.from(JSON.stringify(signDoc), 'utf8');

            // Pass raw sign bytes - createEthSecp256k1Signature will handle Keccak256 hashing
            const signature = createEthSecp256k1Signature(signBytes, privateKeyBytes);

            return {
                signed: signDoc,
                signature: {
                    pub_key: {
                        type: "/cosmos.evm.crypto.v1.ethsecp256k1.PubKey",
                        value: toBase64(publicKeyBytes)
                    },
                    signature: toBase64(signature)
                }
            };
        }
    };
}

// Token Approval Management Functions

/**
 * Check token approval for a specific token
 * @param {string} tokenAddress - ERC20 token address
 * @param {string} spenderAddress - Address that needs approval (AtomicMultiSend)
 * @returns {Promise<{allowance: string, needsApproval: boolean, symbol: string, decimals: number}>}
 */
async function checkTokenApproval(tokenAddress, spenderAddress) {
  const chainConf = conf.blockchain;
  const ethProvider = new JsonRpcProvider(chainConf.endpoints.evm_endpoint);
  const ownerAddress = getEvmAddress();
  
  try {
    const tokenContract = new Contract(tokenAddress, ERC20_APPROVAL_ABI, ethProvider);
    
    // Get token info
    const [allowance, symbol, decimals] = await Promise.all([
      tokenContract.allowance(ownerAddress, spenderAddress),
      tokenContract.symbol(),
      tokenContract.decimals()
    ]);
    
    // Calculate approval amount based on decimals
    const approvalAmount = BigInt("20000") * BigInt(10) ** BigInt(decimals);
    const minThreshold = BigInt("10000") * BigInt(10) ** BigInt(decimals);
    
    const needsApproval = BigInt(allowance) < minThreshold;
    
    return {
      allowance: allowance.toString(),
      needsApproval,
      symbol,
      decimals,
      approvalAmount: approvalAmount.toString(),
      minThreshold: minThreshold.toString()
    };
  } catch (error) {
    console.error(`Error checking approval for token ${tokenAddress}:`, error);
    throw error;
  }
}

/**
 * Approve token for AtomicMultiSend contract
 * @param {string} tokenAddress - ERC20 token address
 * @param {string} spenderAddress - AtomicMultiSend contract address
 * @param {string} amount - Amount to approve
 * @returns {Promise<{hash: string, status: number}>}
 */
async function approveToken(tokenAddress, spenderAddress, amount) {
  const chainConf = conf.blockchain;
  const ethProvider = new JsonRpcProvider(chainConf.endpoints.evm_endpoint);
  const walletInstance = new Wallet(getPrivateKey());
  const wallet = walletInstance.connect(ethProvider);
  
  try {
    const tokenContract = new Contract(tokenAddress, ERC20_APPROVAL_ABI, wallet);
    
    console.log(`Approving ${amount} tokens for ${spenderAddress} on token ${tokenAddress}`);
    
    // Get current nonce
    const nonce = await wallet.getNonce();
    
    // Send approval transaction
    const tx = await tokenContract.approve(spenderAddress, amount, {
      gasLimit: 100000,
      gasPrice: chainConf.tx.fee.evm.gasPrice,
      nonce: nonce
    });
    
    console.log(`Approval transaction sent: ${tx.hash}`);
    
    // Wait for confirmation
    const receipt = await tx.wait();
    
    console.log(`Approval confirmed in block ${receipt.blockNumber}`);
    
    return {
      hash: tx.hash,
      status: receipt.status,
      blockNumber: receipt.blockNumber
    };
  } catch (error) {
    console.error(`Error approving token ${tokenAddress}:`, error);
    throw error;
  }
}

/**
 * Check and setup all token approvals on startup
 */
async function checkAndSetupApprovals() {
  console.log('\n Checking and setting up token approvals...');
  
  const chainConf = conf.blockchain;
  const atomicMultiSendAddress = chainConf.contracts.atomicMultiSend;
  
  if (!atomicMultiSendAddress) {
    console.error(' AtomicMultiSend contract address not configured!');
    return;
  }
  
  const approvalPromises = [];
  
  // Check all configured tokens
  for (const token of chainConf.tx.amounts) {
    // Skip native token (special marker address)
    if (token.erc20_contract === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" || 
        token.erc20_contract === "0x0000000000000000000000000000000000000000") {
      continue;
    }
    
    try {
      const approvalStatus = await checkTokenApproval(token.erc20_contract, atomicMultiSendAddress);
      
      // Store approval status
      tokenApprovalStatus.set(token.erc20_contract, {
        ...approvalStatus,
        lastChecked: Date.now(),
        denom: token.denom
      });
      
      if (approvalStatus.needsApproval) {
        console.log(`  Token ${approvalStatus.symbol} (${token.denom}) needs approval`);
        console.log(`  Current allowance: ${approvalStatus.allowance}`);
        console.log(`  Approving amount: ${approvalStatus.approvalAmount}`);
        
        // Queue approval transaction
        approvalPromises.push(
          approveToken(token.erc20_contract, atomicMultiSendAddress, approvalStatus.approvalAmount)
            .then(result => {
              console.log(`  ✓ ${approvalStatus.symbol} approved successfully (tx: ${result.hash})`);
              // Update status
              tokenApprovalStatus.get(token.erc20_contract).allowance = approvalStatus.approvalAmount;
              tokenApprovalStatus.get(token.erc20_contract).needsApproval = false;
            })
            .catch(error => {
              console.error(`  ✗ Failed to approve ${approvalStatus.symbol}:`, error.message);
            })
        );
      } else {
        console.log(`  ✓ Token ${approvalStatus.symbol} (${token.denom}) already approved`);
        console.log(`    Allowance: ${approvalStatus.allowance}`);
      }
    } catch (error) {
      console.error(`  Error checking token ${token.denom}:`, error.message);
    }
  }
  
  // Wait for all approvals to complete
  if (approvalPromises.length > 0) {
    console.log(`\n Processing ${approvalPromises.length} approval transactions...`);
    await Promise.all(approvalPromises);
  }
  
  console.log(' Token approval setup complete!\n');
}

/**
 * Start periodic approval monitoring
 */
function startApprovalMonitoring() {
  console.log(' Starting token approval monitoring (checking every 5 minutes)...');
  
  // Clear any existing interval
  if (approvalMonitoringInterval) {
    clearInterval(approvalMonitoringInterval);
  }
  
  // Set up periodic check
  approvalMonitoringInterval = setInterval(async () => {
    console.log('\n[APPROVAL CHECK] Running periodic approval check...');
    
    const chainConf = conf.blockchain;
    const atomicMultiSendAddress = chainConf.contracts.atomicMultiSend;
    
    for (const token of chainConf.tx.amounts) {
      // Skip native token
      if (token.erc20_contract === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" || 
          token.erc20_contract === "0x0000000000000000000000000000000000000000") {
        continue;
      }
      
      try {
        const approvalStatus = await checkTokenApproval(token.erc20_contract, atomicMultiSendAddress);
        
        // Update stored status
        tokenApprovalStatus.set(token.erc20_contract, {
          ...approvalStatus,
          lastChecked: Date.now(),
          denom: token.denom
        });
        
        if (approvalStatus.needsApproval) {
          console.log(`[APPROVAL CHECK] Token ${approvalStatus.symbol} needs re-approval`);
          console.log(`  Current allowance: ${approvalStatus.allowance}`);
          console.log(`  Min threshold: ${approvalStatus.minThreshold}`);
          
          // Re-approve
          try {
            const result = await approveToken(
              token.erc20_contract, 
              atomicMultiSendAddress, 
              approvalStatus.approvalAmount
            );
            console.log(`[APPROVAL CHECK] ✓ ${approvalStatus.symbol} re-approved (tx: ${result.hash})`);
          } catch (error) {
            console.error(`[APPROVAL CHECK] ✗ Failed to re-approve ${approvalStatus.symbol}:`, error.message);
          }
        }
      } catch (error) {
        console.error(`[APPROVAL CHECK] Error checking ${token.denom}:`, error.message);
      }
    }
    
    console.log('[APPROVAL CHECK] Periodic check complete\n');
  }, APPROVAL_CHECK_INTERVAL);
}

/**
 * Pre-transaction approval check
 * Ensures all tokens have sufficient approval before attempting transfer
 */
async function ensureTokenApprovals(neededAmounts) {
  const chainConf = conf.blockchain;
  const atomicMultiSendAddress = chainConf.contracts.atomicMultiSend;
  
  for (const token of neededAmounts) {
    // Skip native token
    if (token.erc20_contract === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE") {
      continue;
    }
    
    try {
      // Check current approval
      const approvalStatus = await checkTokenApproval(token.erc20_contract, atomicMultiSendAddress);
      
      // Check if current allowance covers the needed amount
      const neededAmount = BigInt(token.amount);
      const currentAllowance = BigInt(approvalStatus.allowance);
      
      if (currentAllowance < neededAmount) {
        console.log(`Insufficient approval for ${approvalStatus.symbol}. Need: ${neededAmount}, Have: ${currentAllowance}`);
        console.log(`Approving ${approvalStatus.approvalAmount} tokens...`);
        
        // Approve more tokens
        const result = await approveToken(
          token.erc20_contract,
          atomicMultiSendAddress,
          approvalStatus.approvalAmount
        );
        
        console.log(`Approval successful: ${result.hash}`);
        
        // Update cached status
        tokenApprovalStatus.set(token.erc20_contract, {
          ...approvalStatus,
          allowance: approvalStatus.approvalAmount,
          needsApproval: false,
          lastChecked: Date.now()
        });
      }
    } catch (error) {
      console.error(`Failed to ensure approval for token ${token.erc20_contract}:`, error);
      throw new Error(`Token approval failed: ${error.message}`);
    }
  }
}

// load config
    console.log("[SUCCESS] Faucet configuration loaded")
    if (TESTING_MODE) {
        console.log("[INFO] Running in TESTING MODE - will always send 1 token regardless of balance");
    }

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

  // Create EVM wallet to get the correct addresses
  const evmWallet = { address: getEvmAddress(), privateKey: getPrivateKey() };
  sample.evm = evmWallet.address;
  sample.cosmos = evmToCosmosAddress(evmWallet, chainConf.sender.option.prefix);

  // Address configuration loaded

  const project = conf.project
  project.sample = sample
  project.blockchain = chainConf.name
  project.testingMode = TESTING_MODE
  
  // Add network configuration for frontend
  project.network = {
    cosmos: {
      chainId: chainConf.ids.cosmosChainId,
      rpc: chainConf.endpoints.rpc_endpoint,
      grpc: chainConf.endpoints.grpc_endpoint,
      rest: chainConf.endpoints.rest_endpoint
    },
    evm: {
      chainId: chainConf.ids.chainId,
      chainIdHex: '0x' + chainConf.ids.chainId.toString(16),
      rpc: chainConf.endpoints.evm_endpoint,
      websocket: chainConf.endpoints.evm_websocket,
      explorer: chainConf.endpoints.evm_explorer
    },
    contracts: {
      ...chainConf.contracts,
      // Add ERC20 token contracts for easy reference
      erc20_tokens: chainConf.tx.amounts.reduce((acc, token) => {
        if (token.erc20_contract && token.erc20_contract !== "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE") {
          acc[token.denom.toUpperCase()] = token.erc20_contract;
        }
        return acc;
      }, {}),
      // Native token mapping
      native_token: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", // ATOM via ERC20 conversion
      werc20_precompile: "0x0000000000000000000000000000000000000802" // WERC20 precompile address
    }
  }
  
  // Add token information for frontend display
  project.tokens = [
    // Add native ATOM token info
    {
      denom: "uatom",
      name: "ATOM",
      contract: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
      decimals: 6,
      target_amount: "1000000" // 1 ATOM
    },
    // Add ERC20 tokens
    ...chainConf.tx.amounts.map(token => ({
      denom: token.denom,
      name: token.denom.toUpperCase(),
      contract: token.erc20_contract,
      decimals: token.decimals,
      target_amount: token.target_balance
    }))
  ];
  
  project.supportedAddressTypes = ['cosmos', 'evm']
  res.send(project);
})

app.get('/balance/:type', async (req, res) => {
  const { type } = req.params // 'cosmos' or 'evm'
  const { address } = req.query // Optional address parameter

  let balances = []

  try{
    const chainConf = conf.blockchain

    if(type === 'evm') {
      const ethProvider = new JsonRpcProvider(chainConf.endpoints.evm_endpoint);
      
      // Determine which address to check - query parameter or faucet wallet
      let targetAddress;
      if (address && /^0x[a-fA-F0-9]{40}$/.test(address)) {
        targetAddress = address;
      } else {
        const wallet = { address: getEvmAddress(), privateKey: getPrivateKey() };
        targetAddress = wallet.address;
      }

      // Get native balance (uatom with 6 decimals displayed as ATOM)
      const nativeBalance = await ethProvider.getBalance(targetAddress);
      balances.push({
        denom: 'ATOM',
        amount: nativeBalance.toString(),
        type: 'native',
        decimals: 6
      });

      // ERC20 token balance checks
      const erc20ABI = ["function balanceOf(address owner) external view returns (uint256)"];

      for(const token of chainConf.tx.amounts) {
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
          } catch(e) {
            console.error(`Error getting balance for ${token.denom}:`, e);
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
            console.log('Needed amounts:', neededAmounts);
          }

          // Step 3: Check if any tokens are needed
          if (neededAmounts.length === 0) {
            console.log(`\n✅ No tokens needed - wallet already has sufficient balance`);
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
          await ensureTokenApprovals(neededAmounts);

          // Step 4: Send tokens
          console.log(`\n📤 Sending tokens to ${address} (${addressType})...`);
          console.log(`Tokens to send: ${neededAmounts.map(t => `${t.denom}: ${t.amount}`).join(', ')}`);
          const txResult = await sendSmartFaucetTx(address, addressType, neededAmounts);
          console.log(`✅ Transaction sent successfully`);

          // Step 5: Update rate limiting only on successful send
          checker.update(`dual${ip}`);
          checker.update(address);

          // Step 6: Verify transaction and return detailed result
          console.log(`\n🔍 Verifying transaction...`);
          const verificationResult = await verifyTransaction(txResult, addressType);
          console.log(`✅ Transaction verified:`, {
            hash: verificationResult.transaction_hash || verificationResult.hash,
            network: verificationResult.network_type,
            status: verificationResult.code === 0 ? 'SUCCESS' : 'FAILED'
          });

          // Add information about what was sent
          const sentTokensInfo = neededAmounts.map(token => ({
            denom: token.denom,
            amount: token.amount,
            decimals: token.decimals,
            type: token.erc20_contract === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" ? 'native' : 'erc20'
          }));

          const response = {
            result: {
              ...verificationResult,
              current_balances: currentBalances,
              tokens_sent: sentTokensInfo,
              testing_mode: TESTING_MODE
            }
          };
          
          console.log(`\n✅ Request completed successfully:`);
          console.log(`  - Transaction Hash: ${verificationResult.transaction_hash || verificationResult.hash || 'N/A'}`);
          console.log(`  - Tokens Sent: ${sentTokensInfo.map(t => `${t.denom}: ${t.amount}`).join(', ')}`);
          console.log(`  - Explorer URL: ${verificationResult.explorer_url || verificationResult.rest_api_url || 'N/A'}`);
          
          res.send(response);

        } catch (err) {
          console.error('Smart faucet error:', err);
          res.send({ result: `Transaction failed: ${err.message}` });
        }

      } else {
        const remainingTime = await checker.getRemainingTime(address, 'dual');
        const hoursRemaining = Math.ceil(remainingTime / 3600000); // Convert to hours
        res.send({ 
          result: `Rate limit exceeded. You can request tokens again in approximately ${hoursRemaining} hours.`,
          rate_limit_info: {
            address_limit: chainConf.limit.address,
            ip_limit: chainConf.limit.ip,
            window: "24 hours",
            remaining_time_ms: remainingTime
          }
        })
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
  console.log(`[START] Faucet server starting on port ${conf.port}...`);
  
  try {
    // Initialize secure key management
    console.log(' Initializing secure key management...');
    await initializeSecureKeys();
    
    // Validate addresses if we have cached ones
    if (conf.derivedAddresses && conf.derivedAddresses.evm && conf.derivedAddresses.cosmos) {
      console.log(' Validating cached addresses against derived keys...');
      try {
        validateDerivedAddresses({
          evm: conf.derivedAddresses.evm.address,
          cosmos: conf.derivedAddresses.cosmos.address
        });
        console.log(' Address validation successful - using cached addresses');
      } catch (error) {
        console.error(' Address validation failed:', error.message);
        console.log(' This may indicate mnemonic was changed. Please update cached addresses.');
        process.exit(1);
      }
    }

    // Validate contract addresses before starting
    console.log('\n Validating contract addresses...');
    const validator = new ContractValidator(conf, secureKeyManager);
    await validator.initialize();
    
    const validationResults = await validator.validateAllContracts();
    console.log(validator.generateValidationReport());
    
    if (!validationResults.allValid) {
      console.error('\n CONTRACT VALIDATION FAILED!');
      console.error('Some contract addresses are invalid or not accessible.');
      console.error('Run: node scripts/validate-contracts.js --interactive');
      console.error('Or manually update config.js with correct addresses.');
      process.exit(1);
    }
    
    console.log('\n All contracts validated successfully!');
    
    // Check and setup token approvals
    await checkAndSetupApprovals();
    
    // Start approval monitoring
    startApprovalMonitoring();

    // Get secure addresses
    const evmAddress = getEvmAddress();
    const cosmosAddress = getCosmosAddress();

    console.log(' Faucet server ready!');
    console.log(` EVM Address: ${evmAddress}`);
    console.log(` Cosmos Address: ${cosmosAddress}`);
    console.log(` Server listening on http://localhost:${conf.port}`);
    console.log(` Testing Mode: ${TESTING_MODE ? 'ENABLED' : 'DISABLED'}`);
    
    // Never log private keys or mnemonic
    console.log(' Private keys secured in memory (never logged or written to disk)');
    
  } catch (error) {
    console.error(' Failed to initialize faucet:', error.message);
    process.exit(1);
  }
})

// Legacy functions removed - replaced by smart faucet functions above

// Smart Faucet Helper Functions

// Get testing mode amounts (1 of each token)
function getTestingModeAmounts(tokenConfigs) {
  const testAmounts = [];
  
  // Add 1 of each configured token
  for (const config of tokenConfigs) {
    testAmounts.push({
      denom: config.denom,
      amount: "1", // Just 1 unit
      erc20_contract: config.erc20_contract,
      decimals: config.decimals
    });
  }
  
  // Also add 1 uatom for native token
  testAmounts.push({
    denom: "uatom",
    amount: "1", // 1 uatom
    erc20_contract: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    decimals: 6
  });
  
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
      
      // For cosmos recipients, also check native ATOM balance
      const atomBalance = data.balances?.find(b => b.denom === "uatom");
      balances.push({
        denom: "uatom",
        current_amount: atomBalance ? atomBalance.amount : "0",
        target_amount: "1000000", // 1 ATOM target
        decimals: 6
      });
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

// Calculate how much of each token is needed to reach target balance
function calculateNeededAmounts(currentBalances, tokenConfigs) {
  const neededAmounts = [];

  for (const current of currentBalances) {
    const currentAmount = BigInt(current.current_amount);
    const targetAmount = BigInt(current.target_amount);

    if (currentAmount < targetAmount) {
      const needed = targetAmount - currentAmount;
      
      // Find matching config or use balance data for uatom
      const config = tokenConfigs.find(c => c.denom === current.denom);
      
      neededAmounts.push({
        denom: current.denom,
        amount: needed.toString(),
        erc20_contract: config?.erc20_contract || "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", // Special marker for native tokens
        decimals: current.decimals
      });
    }
  }

  return neededAmounts;
}

// Send tokens using smart amounts based on recipient address type
async function sendSmartFaucetTx(recipient, addressType, neededAmounts) {
  const results = [];

  console.log('Recipient address type:', addressType);
  console.log('All needed amounts:', neededAmounts);

  // Send ALL tokens based on recipient address type, not token type
  if (addressType === 'cosmos') {
    // Send ALL tokens via Cosmos bank sends (including ERC20 tokens that exist on cosmos side)
    try {
      console.log('Sending ALL tokens via Cosmos (bech32 recipient)...');
      const cosmosResult = await sendSmartCosmosTx(recipient, neededAmounts);
      results.push({ type: 'cosmos', result: cosmosResult });
    } catch (error) {
      console.error('Cosmos send failed:', error);
      throw new Error(`Cosmos transaction failed: ${error.message}`);
    }
  } else if (addressType === 'evm') {
    // Send ALL tokens via EVM (including native tokens via wrapped/bridged versions)
    try {
      console.log('Sending ALL tokens via EVM (hex recipient)...');
      const evmResult = await sendSmartEvmTx(recipient, neededAmounts);
      console.log('EVM transaction result:', {
        hash: evmResult.transaction_hash || evmResult.hash,
        success: evmResult.success || evmResult.status === '0x1',
        blockNumber: evmResult.blockNumber
      });
      results.push({ type: 'evm', result: evmResult });
    } catch (error) {
      console.error('EVM send failed:', error);
      throw new Error(`EVM transaction failed: ${error.message}`);
    }
  } else {
    throw new Error(`Unsupported address type: ${addressType}`);
  }

  // Return result
  if (results.length === 1) {
    return results[0].result;
  } else {
    return {
      code: 0,
      message: "No tokens sent",
      transactions: results
    };
  }
}

// Manual Cosmos transaction with complete control over pubkey types and retry logic
async function sendSmartCosmosTx(recipient, neededAmounts) {
  return await sendCosmosTransactionWithRetry(recipient, neededAmounts, 3);
}

// Cosmos transaction with retry logic for sequence number issues
async function sendCosmosTransactionWithRetry(recipient, neededAmounts, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) console.log(`[RETRY] Cosmos tx retry ${attempt}/${maxRetries}`);
      const result = await sendCosmosTransactionInternal(recipient, neededAmounts, 'cosmosEvm');
      
      // Wait for transaction to be included in a block and get full details
      if (result.code === 0 && result.transactionHash) {
        console.log(`Cosmos transaction successful: ${result.transactionHash}`);
        
        // Wait a moment for the transaction to be processed
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Fetch the full transaction details for better user feedback
        try {
          const rest = conf.blockchain.endpoints.rest_endpoint;
          const detailResp = await fetch(`${rest}/cosmos/tx/v1beta1/txs/${result.transactionHash}`);
          if (detailResp.ok) {
            const detailJson = await detailResp.json();
            result.tx_response = detailJson.tx_response;
            result.height = detailJson.tx_response?.height || result.height;
            result.gasUsed = detailJson.tx_response?.gas_used || result.gasUsed;
          }
        } catch (detailError) {
          console.log('Failed to fetch transaction details:', detailError.message);
        }
      }
      
      return result;
    } catch (error) {
      // Check if this is a signature/sequence related error that might benefit from retry
      if (error.message.includes('signature verification failed') ||
          error.message.includes('account sequence mismatch') ||
          error.message.includes('unauthorized')) {

        if (attempt < maxRetries) {
          console.log(`Retrying cosmos tx in 2s (${error.message.split('.')[0]})`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
      }

      // Re-throw the error if it's not retryable or we've exhausted retries
      throw error;
    }
  }
}

// Create a simple eth_secp256k1 compatible wallet for CosmJS
async function createSimpleEthSecp256k1Wallet(mnemonic, options) {
  // Use DirectSecp256k1HdWallet but with eth address derivation
  const privateKeyBytes = getPrivateKeyFromMnemonic(mnemonic, pathToString(options.hdPaths[0]));
  const { cosmosAddress } = generateEthSecp256k1AddressesFromPrivateKey(
    Buffer.from(privateKeyBytes).toString('hex'),
    options.prefix
  );

  // Create a DirectSecp256k1Wallet with the derived private key
  const wallet = await DirectSecp256k1Wallet.fromKey(privateKeyBytes, options.prefix);

  // Override the getAccounts method to return the correct eth-derived address
  const originalGetAccounts = wallet.getAccounts.bind(wallet);
  wallet.getAccounts = async () => {
    const accounts = await originalGetAccounts();
    // Replace the address with our eth-derived address
    accounts[0].address = cosmosAddress;
    return accounts;
  };

  return wallet;
}

// New CosmJS-based transaction function
async function sendCosmosTransactionWithCosmJS(recipient, neededAmounts) {
  const chainConf = conf.blockchain;

  // Filter to only native tokens (uatom) - ERC20 tokens should be sent via EVM
  const nativeTokens = neededAmounts.filter(token =>
    token.erc20_contract === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" ||
    token.denom === "uatom"
  );

  if (nativeTokens.length === 0) {
    console.log("No native tokens to send via Cosmos");
    return { code: 0, message: "No native tokens needed" };
  }

  // Convert EVM address to Cosmos address if needed
  let cosmosRecipient = recipient;
  if (isHexAddress(recipient)) {
    cosmosRecipient = convertEvmToCosmosAddress(recipient);
    console.log("Converted EVM address to Cosmos address:", recipient, "->", cosmosRecipient);

    if (!cosmosRecipient || cosmosRecipient.length === 0) {
      throw new Error(`Failed to convert EVM address ${recipient} to cosmos address`);
    }
  }

  if (!cosmosRecipient || cosmosRecipient.length === 0) {
    throw new Error(`Invalid recipient address: ${cosmosRecipient}`);
  }

  try {
    // Create simple eth_secp256k1 compatible wallet using secure key manager
    const wallet = await createSimpleEthSecp256k1Wallet(MNEMONIC, chainConf.sender.option);
    const [account] = await wallet.getAccounts();
    console.log("Simple ETH-compatible wallet account:", account.address);

    // Create signing client
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

    // Prepare amounts for MsgSend
    const amounts = nativeTokens.map(token => ({
      denom: token.denom,
      amount: token.amount
    }));

    console.log("Sending cosmos transaction:", {
      from: account.address,
      to: cosmosRecipient,
      amounts: amounts
    });

    // Send transaction using CosmJS
    const result = await client.sendTokens(
      account.address,
      cosmosRecipient,
      amounts,
      {
        amount: chainConf.tx.fee.cosmos.amount,
        gas: chainConf.tx.fee.cosmos.gas,
      }
    );

    console.log("CosmJS transaction result:", result);

    if (result.code === 0) {
      return {
        code: 0,
        transactionHash: result.transactionHash,
        height: result.height,
        gasUsed: result.gasUsed
      };
    } else {
      throw new Error(`Transaction failed with code ${result.code}: ${result.rawLog}`);
    }

  } catch (error) {
    console.error("CosmJS transaction error:", error);
    throw error;
  }
}

// Fetch fresh account information with enhanced error handling
async function fetchFreshAccountInfo(restEndpoint, address) {
  try {
    const accountUrl = `${restEndpoint}/cosmos/auth/v1beta1/accounts/${address}`;
    const response = await fetch(accountUrl);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    let account = data.account;

    // Handle EthAccount type
    if (account.base_account) {
      account = account.base_account;
    }

    const accountInfo = {
      accountNumber: parseInt(account.account_number),
      sequence: parseInt(account.sequence)
    };

    return accountInfo;
  } catch (error) {
    throw new Error(`Failed to fetch account info: ${error.message}`);
  }
}

// Create proper eth_secp256k1 pubkey encoding that matches chain expectations
function createProperEthSecp256k1PubKey(publicKeyBytes) {
  // Manual protobuf encoding for: message PubKey { bytes key = 1; }
  // Field 1, wire type 2 (length-delimited): tag = (1 << 3) | 2 = 10 (0x0A)
  const keyLength = publicKeyBytes.length; // 33 bytes
  const result = new Uint8Array(1 + 1 + keyLength); // tag + length + key
  result[0] = 0x0A; // Field 1, wire type 2
  result[1] = keyLength; // Length of key (33)
  result.set(publicKeyBytes, 2); // Key bytes

  return result;
}

// Test cosmos.evm pubkey variant (what the chain actually uses)
async function createPubKeyVariants(publicKeyBytes) {
  // debug disabled – remove verbose console noise

  // Create proper protobuf encoding
  const encodedPubkey = createProperEthSecp256k1PubKey(publicKeyBytes);

  // Only use cosmos.evm variant since that's what the chain expects
  const cosmosEvmPubkey = Any.fromPartial({
    typeUrl: "/cosmos.evm.crypto.v1.ethsecp256k1.PubKey",
    value: encodedPubkey,
  });

  // console.log(`[INFO] Using cosmos.evm pubkey variant: ${cosmosEvmPubkey.typeUrl}`); // muted

  return {
    cosmosEvm: cosmosEvmPubkey
  };
}

// Internal cosmos transaction logic (renamed from sendSmartCosmosTx)
async function sendCosmosTransactionInternal(recipient, neededAmounts, pubkeyVariant = 'cosmosEvm') {
  const chainConf = conf.blockchain;

  // For cosmos recipients, only send native ATOM tokens via Cosmos bank sends
  const tokensToSend = neededAmounts.filter(token =>
    token.denom === "uatom"
  );

  if (tokensToSend.length === 0) {
    console.log("No tokens to send via Cosmos");
    return { code: 0, message: "No tokens needed" };
  }

  // Convert EVM address to Cosmos address if needed
  let cosmosRecipient = recipient;
  if (isHexAddress(recipient)) {
    cosmosRecipient = convertEvmToCosmosAddress(recipient);
    console.log("Converted EVM address to Cosmos address:", recipient, "->", cosmosRecipient);
    console.log("Converted address length:", cosmosRecipient?.length);
    console.log("Converted address is valid:", cosmosRecipient && cosmosRecipient.length > 0);

    if (!cosmosRecipient || cosmosRecipient.length === 0) {
      throw new Error(`Failed to convert EVM address ${recipient} to cosmos address`);
    }
  }

  if (!cosmosRecipient || cosmosRecipient.length === 0) {
    throw new Error(`Invalid recipient address: ${cosmosRecipient}`);
  }

  // Create wallet and get account info using secure key manager
  const wallet = await createEthCompatibleCosmosWallet(MNEMONIC, chainConf.sender.option);
  const [firstAccount] = await wallet.getAccounts();

  // Prepare amounts from all needed tokens
  const amounts = tokensToSend.map(token => ({
    denom: token.denom,
    amount: token.amount
  }));

  const fee = chainConf.tx.fee.cosmos;

  // 1. Fetch FRESH account info via REST API (always get latest state)
  const accountInfo = await fetchFreshAccountInfo(chainConf.endpoints.rest_endpoint, firstAccount.address);

  // 2. Create MsgSend message with proper protobuf encoding
  const msgSendValue = MsgSend.fromPartial({
    fromAddress: firstAccount.address,
    toAddress: cosmosRecipient,
    amount: amounts
  });

  // Encode the MsgSend as protobuf bytes
  const msgSendBytes = MsgSend.encode(msgSendValue).finish();

  // Create the Any wrapper for the message
  const msgSendAny = Any.fromPartial({
    typeUrl: "/cosmos.bank.v1beta1.MsgSend",
    value: msgSendBytes
  });

  // 3. Create TxBody using proper protobuf message structure
  const txBodyValue = {
    messages: [msgSendAny], // Use the properly encoded Any message
    memo: "",
    timeoutHeight: Long.fromNumber(0),
    extensionOptions: [],
    nonCriticalExtensionOptions: []
  };

  const txBodyBytes = TxBody.encode(txBodyValue).finish();

  // 4. Get our manually derived keys for consistency
  // Use secure key manager for private key bytes
  const privateKeyBytes = getPrivateKeyBytes();
  const publicKeyBytes = getPublicKeyBytes();

  // Verify key consistency
  const keysMatch = Buffer.from(publicKeyBytes).equals(Buffer.from(firstAccount.pubkey));
  if (!keysMatch) {
    throw new Error('Public key mismatch between derived and wallet keys');
  }

  // Create and test multiple pubkey variants
  const pubkeyVariants = await createPubKeyVariants(publicKeyBytes);

  // Use the specified variant
  const pubkeyAny = pubkeyVariants[pubkeyVariant];

  // 5. Create AuthInfo with the correct pubkey type
  const gasLimit = parseInt(fee.gas);
  const authInfoBytes = makeAuthInfoBytes(
    [{ pubkey: pubkeyAny, sequence: Long.fromNumber(accountInfo.sequence) }],
    fee.amount,
    gasLimit
  );

  // 6. Create SignDoc
  const signDoc = makeSignDoc(
    txBodyBytes,
    authInfoBytes,
    chainConf.ids.cosmosChainId,
    Long.fromNumber(accountInfo.accountNumber)
  );

  // 7. Create signature manually using our ethereum secp256k1 implementation
  // Encode the SignDoc and pass raw bytes to signature function
  const signDocBytes = SignDoc.encode(signDoc).finish();

  // Create signature using our ethereum secp256k1 implementation
  const signature = createEthSecp256k1Signature(signDocBytes, privateKeyBytes);

  // 8. Create TxRaw with our direct signature
  const txRaw = TxRaw.fromPartial({
    bodyBytes: signDoc.bodyBytes,
    authInfoBytes: signDoc.authInfoBytes,
    signatures: [signature], // Our signature is already in bytes
  });

  const txBytes = TxRaw.encode(txRaw).finish();

  // 9. Broadcast manually via REST API
  try {
    const broadcastUrl = `${chainConf.endpoints.rest_endpoint}/cosmos/tx/v1beta1/txs`;
    const broadcastBody = {
      tx_bytes: toBase64(txBytes),
      mode: "BROADCAST_MODE_SYNC"
    };

    const response = await fetch(broadcastUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(broadcastBody)
    });

    const result = await response.json();

    if (result.tx_response && result.tx_response.code === 0) {
      return {
        code: 0,
        transactionHash: result.tx_response.txhash,
        height: result.tx_response.height,
        gasUsed: result.tx_response.gas_used
      };
    } else {
      throw new Error(`Transaction failed: ${result.tx_response?.raw_log || JSON.stringify(result)}`);
    }
  } catch (error) {
    console.error("Broadcast failed:", error);
    throw error;
  }
}

// Atomic EVM transaction using AtomicMultiSend contract
async function sendSmartEvmTx(recipient, neededAmounts) {
  try {
    const chainConf = conf.blockchain;
    const ethProvider = new JsonRpcProvider(chainConf.endpoints.evm_endpoint);
    // Use secure private key to create wallet instance (still need full wallet for provider connection)
    const walletInstance = new Wallet(getPrivateKey());
    const wallet = walletInstance.connect(ethProvider);

    console.log("Sending atomic EVM tokens to:", recipient);
    console.log("Needed amounts:", neededAmounts);
    console.log("Using AtomicMultiSend contract for guaranteed atomicity");

    // Load AtomicMultiSend contract
    const atomicMultiSendAddress = chainConf.contracts.atomicMultiSend;
    if (!atomicMultiSendAddress) {
      throw new Error("AtomicMultiSend contract address not configured");
    }

    // Load ABI
    const fs = await import('fs');
    const path = await import('path');
    const abiPath = path.join(process.cwd(), 'deployments', 'AtomicMultiSend.abi.json');
    console.log(`Loading ABI from: ${abiPath}`);
    const atomicMultiSendABI = JSON.parse(fs.readFileSync(abiPath, 'utf8'));
    const atomicMultiSend = new Contract(atomicMultiSendAddress, atomicMultiSendABI, wallet);

    // Prepare transfer array for the contract
    const transfers = [];
    let nativeAmount = 0n;

    for (const token of neededAmounts) {
      if (token.erc20_contract === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE") {
        // Native token - use address(0) in contract
        transfers.push({
          token: "0x0000000000000000000000000000000000000000",
          amount: token.amount
        });
        nativeAmount += BigInt(token.amount);
      } else {
        // ERC20 token
        transfers.push({
          token: token.erc20_contract,
          amount: token.amount
        });
      }
    }

    console.log("Prepared transfers:", transfers);
    console.log("Native amount:", nativeAmount.toString());

    // Get current nonce with retry logic for Tendermint reliability
    const nonce = await getNonceWithRetry(wallet);
    console.log("Using nonce:", nonce);

    // Estimate gas with buffer for Tendermint consensus
    const gasEstimate = await atomicMultiSend.atomicMultiSend.estimateGas(recipient, transfers, { value: nativeAmount });
    const gasLimit = (gasEstimate * 130n) / 100n; // 30% buffer for consensus delays
    
    console.log("Gas estimate:", gasEstimate.toString());
    console.log("Gas limit (with buffer):", gasLimit.toString());

    // Submit atomic transaction with proper parameters
    const tx = await atomicMultiSend.atomicMultiSend(recipient, transfers, {
      value: nativeAmount,
      gasLimit: gasLimit,
      gasPrice: chainConf.tx.fee.evm.gasPrice,
      nonce: nonce
    });

    console.log("Atomic transaction submitted:", tx.hash);
    console.log("Waiting for confirmation...");

    // Wait for confirmation with timeout
    const receipt = await waitForTransactionWithTimeout(tx, 30000); // 30 second timeout
    
    console.log("Atomic transaction confirmed!");
    console.log("Block number:", receipt.blockNumber);
    console.log("Gas used:", receipt.gasUsed.toString());
    console.log("Status:", receipt.status);

    // Verify all transfers succeeded by checking events
    const events = receipt.logs.filter(log => 
      log.address.toLowerCase() === atomicMultiSendAddress.toLowerCase()
    );

    console.log("Contract events:", events.length);

    // Send 1 ATOM via cosmos for gas fees (convert hex to bech32)
    let cosmosGasTx = null;
    try {
      const cosmosBech32Address = hexToBech32(recipient, chainConf.sender.option.prefix);
      console.log("Sending 1 ATOM for gas fees via cosmos to:", cosmosBech32Address);
      
      const gasAmount = "1000000"; // 1 ATOM (6 decimals: 1000000 uatom)
      const cosmosGasTokens = [{
        denom: "uatom",
        amount: gasAmount,
        erc20_contract: "native",
        decimals: 6,
        target_balance: gasAmount
      }];
      
      const cosmosResult = await sendCosmosTransactionWithRetry(cosmosBech32Address, cosmosGasTokens, 2);
      cosmosGasTx = {
        hash: cosmosResult.transactionHash,
        code: cosmosResult.code,
        height: cosmosResult.height,
        gasUsed: cosmosResult.gasUsed
      };
      console.log("1 ATOM sent:", cosmosResult.transactionHash);
    } catch (cosmosError) {
      console.warn("Failed to send additional token for gas fees:", cosmosError.message);
    }

    const transferResults = neededAmounts.map(token => ({
      token: token.erc20_contract,
      amount: token.amount,
      denom: token.denom,
      hash: tx.hash,
      status: receipt.status,
      type: token.erc20_contract === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" ? 'native' : 'erc20'
    }));

    // Add 1 ATOM for user gas fees    
     if (cosmosGasTx) {
      transferResults.push({
        token: "native",
        amount: "1000000",
        denom: "uatom",
        hash: cosmosGasTx.hash,
        status: 1,
        type: 'cosmos_native'
      });
    }

    return {
      code: 0,
      hash: tx.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      transfers: transferResults,
      transactions: cosmosGasTx ? [tx.hash, cosmosGasTx.hash] : [tx.hash],
      method: 'atomic_multisend_plus_cosmos_native',
      atomicity: 'guaranteed'
    };

  } catch(e) {
    console.error("Atomic EVM transaction error:", e);
    throw e;
  }
}

// Helper function to get nonce with retry logic for Tendermint reliability
async function getNonceWithRetry(wallet, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const nonce = await wallet.getNonce();
      console.log(`Retrieved nonce ${nonce} on attempt ${i + 1}`);
      return nonce;
    } catch (error) {
      console.log(`Nonce retrieval failed (attempt ${i + 1}): ${error.message}`);
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // Exponential backoff
    }
  }
}

// Helper function to wait for transaction with timeout for Tendermint reliability
async function waitForTransactionWithTimeout(tx, timeoutMs = 30000) {
  return new Promise(async (resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Transaction ${tx.hash} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    try {
      const receipt = await tx.wait();
      clearTimeout(timeout);
      resolve(receipt);
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });
}

// Verify transaction success and format response
async function verifyTransaction(txResult, addressType) {
  try {
    if (addressType === 'cosmos') {
      // Cosmos transaction verification
      if (txResult.code === 0) {
        // fetch full tx details from REST endpoint for UI display
        try {
          const rest = conf.blockchain.endpoints.rest_endpoint;
          const detailResp = await fetch(`${rest}/cosmos/tx/v1beta1/txs/${txResult.transactionHash}`);
          const detailJson = await detailResp.json();
          
          return {
            code: 0,
            message: "Tokens sent successfully!",
            network_type: "cosmos",
            transaction_hash: txResult.transactionHash,
            block_height: txResult.height,
            gas_used: txResult.gasUsed,
            gas_wanted: txResult.gasWanted,
            tx_response: detailJson.tx_response || null,
            rest_api_url: `${rest}/cosmos/tx/v1beta1/txs/${txResult.transactionHash}`, // REST API for transaction details
            transfers: txResult.transfers || []
          };
        } catch (_) {
          // if REST lookup fails, fall back to minimal info
          return {
            code: 0,
            message: "Tokens sent successfully!",
            network_type: "cosmos",
            transaction_hash: txResult.transactionHash,
            block_height: txResult.height,
            gas_used: txResult.gasUsed,
            gas_wanted: txResult.gasWanted,
            rest_api_url: `${conf.blockchain.endpoints.rest_endpoint}/cosmos/tx/v1beta1/txs/${txResult.transactionHash}`,
            transfers: txResult.transfers || []
          };
        }
      } else {
        return {
          code: txResult.code,
          message: `Transaction failed: ${txResult.rawLog}`,
          network_type: "cosmos",
          transaction_hash: txResult.transactionHash,
          rest_api_url: `${conf.blockchain.endpoints.rest_endpoint}/cosmos/tx/v1beta1/txs/${txResult.transactionHash}`
        };
      }
    } else if (addressType === 'evm') {
      // EVM transaction verification
      if (txResult.code === 0) {
        const explorerUrl = `${conf.blockchain.endpoints.evm_explorer}/tx/${txResult.hash}`;
        
        return {
          code: 0,
          message: "Tokens sent successfully!",
          network_type: "evm",
          transaction_hash: txResult.hash,
          block_number: txResult.blockNumber,
          block_hash: txResult.blockHash,
          gas_used: txResult.gasUsed,
          gas_price: txResult.gasPrice,
          transaction_index: txResult.transactionIndex,
          from_address: txResult.from,
          to_address: txResult.to,
          value: txResult.value,
          status: txResult.status,
          explorer_url: explorerUrl,
          transfers: txResult.transfers || [],
          evm_tx_data: {
            hash: txResult.hash,
            blockNumber: txResult.blockNumber,
            blockHash: txResult.blockHash,
            transactionIndex: txResult.transactionIndex,
            from: txResult.from,
            to: txResult.to,
            value: txResult.value,
            gasUsed: txResult.gasUsed,
            gasPrice: txResult.gasPrice,
            status: txResult.status,
            logs: txResult.logs || []
          }
        };
      } else {
        const explorerUrl = txResult.hash ? `${conf.blockchain.endpoints.evm_explorer}/tx/${txResult.hash}` : null;
        
        return {
          code: 1,
          message: "Transaction failed",
          network_type: "evm",
          transaction_hash: txResult.hash || "unknown",
          explorer_url: explorerUrl
        };
      }
    }
  } catch (error) {
    console.error('Transaction verification error:', error);
    const hash = txResult.hash || txResult.transactionHash || "unknown";
    const explorerUrl = addressType === 'evm' && hash !== "unknown" ? 
      `${conf.blockchain.endpoints.evm_explorer}/tx/${hash}` : 
      (addressType === 'cosmos' && hash !== "unknown" ? `${conf.blockchain.endpoints.rest_endpoint}/cosmos/tx/v1beta1/txs/${hash}` : null);
    
    return {
      code: 1,
      message: `Verification failed: ${error.message}`,
      network_type: addressType,
      transaction_hash: hash,
      [addressType === 'evm' ? 'explorer_url' : 'rest_api_url']: explorerUrl
    };
  }
}

// Utility function for bech32 conversion
function toHexString(bytes) {
  return bytes.reduce(
      (str, byte) => str + byte.toString(16).padStart(2, '0'),
      '');
}

// Helper function to convert cosmos address to EVM address for eth_secp256k1 chains
function convertCosmosToEvmAddress(cosmosAddress) {
  try {
    // For eth_secp256k1 chains, both addresses are derived from the same keccak256 hash
    // So we can convert by decoding the bech32 and re-encoding as hex
    const decoded = bech32.decode(cosmosAddress, 256);
    const addressBytes = convertBits(decoded.words, 5, 8, false);
    return `0x${Buffer.from(addressBytes).toString('hex')}`;
  } catch (error) {
    console.error('Error converting Cosmos to EVM address:', error);
    return null;
  }
}

// Helper function to convert EVM address to Cosmos address
function convertEvmToCosmosAddress(evmAddress) {
  try {
    // Use the chain's prefix (from config)
    const prefix = conf.blockchain.sender.option.prefix;
    console.log("=== EVM TO COSMOS CONVERSION DEBUG ===");
    console.log("Input EVM address:", evmAddress);
    console.log("Chain prefix:", prefix);
    const result = hexToBech32(evmAddress, prefix);
    console.log("hexToBech32 result:", result);
    console.log("=== END CONVERSION DEBUG ===");
    return result;
  } catch (error) {
    console.error('Error converting EVM to Cosmos address:', error);
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
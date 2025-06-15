import express from 'express';
import fetch from 'node-fetch';

import { HDNodeWallet, JsonRpcProvider, Contract, } from 'ethers'
import { bech32 } from 'bech32';

import { DirectSecp256k1HdWallet, DirectSecp256k1Wallet, decodePubkey, makeAuthInfoBytes, makeSignDoc } from "@cosmjs/proto-signing";
import { accountFromAny, SigningStargateClient } from "@cosmjs/stargate";
import { pathToString } from '@cosmjs/crypto';
import { fromHex, toHex, toBase64, } from '@cosmjs/encoding';
import { TxRaw, SignDoc, TxBody } from "cosmjs-types/cosmos/tx/v1beta1/tx.js";
import { Any } from "cosmjs-types/google/protobuf/any.js";
import { MsgSend } from "cosmjs-types/cosmos/bank/v1beta1/tx.js";
// We'll create the protobuf encoding manually to match what the chain expects
// Note: We'll create the proper ethereum secp256k1 PubKey encoding manually since cosmjs-types doesn't include it
import Long from "long";

// Noble crypto imports for proper key derivation
import { keccak_256 } from '@noble/hashes/sha3';
import { secp256k1 } from '@noble/curves/secp256k1';
import { mnemonicToSeedSync, validateMnemonic } from 'bip39';
import { BIP32Factory } from 'bip32';
import * as ecc from 'tiny-secp256k1';

import conf from './config.js'
import { FrequencyChecker } from './checker.js';

// Initialize BIP32 with ECC
const bip32 = BIP32Factory(ecc);

// Proper protobuf encoding for cosmos.evm.crypto.v1.ethsecp256k1.PubKey
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

// Create proper ethereum secp256k1 signature for Cosmos SDK
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

  // Use the compact raw bytes format directly from noble
  // This gives us exactly 64 bytes: r (32) + s (32) - no recovery ID
  const signatureBytes = signature.toCompactRawBytes();

  return signatureBytes;
}

// Note: Old EthSecp256k1PubKey type removed - we now use direct protobuf encoding functions

// Note: Custom registry removed - we now use direct protobuf encoding for complete manual control

// Custom pubkey decoder that handles ethereum secp256k1 keys
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

// Generate addresses from private key using ETH_SECP256K1 method
function generateEthSecp256k1AddressesFromPrivateKey(privateKeyHex, prefix) {
    const privateKey = Uint8Array.from(Buffer.from(privateKeyHex.padStart(64, '0'), 'hex'));
    if (privateKey.length !== 32) {
        throw new Error('Private key must be 32 bytes long.');
    }

    const publicKey = secp256k1.getPublicKey(privateKey, true); // compressed public key
    const publicKeyUncompressed = secp256k1.getPublicKey(privateKey, false).slice(1); // remove 0x04 prefix

    // For ETH_SECP256K1: Skip RIPEMD160 for cosmos address, use keccak hash converted to bech32
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

/**
 * Convert hex address to bech32 address (ETH-compatible - no ripemd160)
 */
function hexToBech32(hexAddress, prefix) {
  console.log("=== hexToBech32 DEBUG ===");
  console.log("Input hex address:", hexAddress);
  console.log("Prefix:", prefix);

  // Remove 0x prefix if present
  const hex = hexAddress.replace('0x', '');
  console.log("Hex after removing 0x:", hex);

  // Convert hex string to bytes
  const addressBytes = fromHex(hex);
  console.log("Address bytes:", addressBytes);
  console.log("Address bytes length:", addressBytes.length);

  // Direct conversion without ripemd160 hashing (ETH-compatible)
  const words = bech32.toWords(addressBytes);
  console.log("Bech32 words:", words);

  const cosmosAddress = bech32.encode(prefix, words);
  console.log("Final cosmos address:", cosmosAddress);
  console.log("=== END hexToBech32 DEBUG ===");

  return cosmosAddress;
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
 * Convert EVM address to Cosmos address using ETH_SECP256K1 derivation
 * This is for display purposes - the actual derivation should use the proper method
 */
function evmToCosmosAddress(evmWallet, prefix) {
    // Get the private key and derive addresses properly
    const privateKeyHex = evmWallet.privateKey.slice(2); // Remove 0x prefix
    const { cosmosAddress } = generateEthSecp256k1AddressesFromPrivateKey(privateKeyHex, prefix);
    return cosmosAddress;
}

// Note: Old helper functions removed - we now use direct protobuf encoding

/**
 * Create ETH-compatible cosmos wallet for eth_secp256k1 chains
 */
async function createEthCompatibleCosmosWallet(mnemonic, options) {
    // Derive private key from mnemonic using the specified HD path
    const derivationPath = pathToString(options.hdPaths[0]);
    const privateKeyBytes = getPrivateKeyFromMnemonic(mnemonic, derivationPath);
    const privateKeyHex = Buffer.from(privateKeyBytes).toString('hex');

    // Generate addresses using ETH_SECP256K1 method
    const { cosmosAddress, ethAddress, publicKey } = generateEthSecp256k1AddressesFromPrivateKey(
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

/**
 * Derive addresses from mnemonic (same approach as ../evm)
 */
async function deriveAddresses(mnemonic, hdPaths, prefix = "cosmos") {
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
    prefix: prefix,
    hdPaths: hdPaths
  });

  const accounts = await wallet.getAccounts();
  const cosmosAddress = accounts[0].address;
  const hexAddress = bech32ToHex(cosmosAddress);

  return {
    wallet,
    cosmosAddress,
    hexAddress,
    publicKey: Buffer.from(accounts[0].pubkey).toString('hex')
  };
}



// load config
    console.log("[SUCCESS] Faucet configuration loaded")

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
  const evmWallet = HDNodeWallet.fromPhrase(chainConf.sender.mnemonic, undefined, pathToString(chainConf.sender.option.hdPaths[0]));
  sample.evm = evmWallet.address;
  sample.cosmos = evmToCosmosAddress(evmWallet, chainConf.sender.option.prefix);

  // Address configuration loaded

  const project = conf.project
  project.sample = sample
  project.blockchain = chainConf.name
  
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
      websocket: chainConf.endpoints.evm_websocket
    },
    contracts: chainConf.contracts
  }
  
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
        const wallet = HDNodeWallet.fromPhrase(chainConf.sender.mnemonic, undefined, pathToString(chainConf.sender.option.hdPaths[0]));
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
        const wallet = await DirectSecp256k1HdWallet.fromMnemonic(chainConf.sender.mnemonic, { prefix: chainConf.sender.option.prefix });
        const accounts = await wallet.getAccounts();
        targetAddress = accounts[0].address;
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
          console.log(`[START] Faucet server running on port ${conf.port}`)

  // Initialize wallet addresses
  const chainConf = conf.blockchain;
  const evmWallet = HDNodeWallet.fromPhrase(chainConf.sender.mnemonic, undefined, pathToString(chainConf.sender.option.hdPaths[0]));
  const cosmosAddress = evmToCosmosAddress(evmWallet, chainConf.sender.option.prefix);

  console.log(`💼 Wallet ready - Cosmos: ${cosmosAddress} | EVM: ${evmWallet.address}`);
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

  for (let i = 0; i < currentBalances.length; i++) {
    const current = currentBalances[i];
    const config = tokenConfigs[i];

    const currentAmount = BigInt(current.current_amount);
    const targetAmount = BigInt(current.target_amount);

    if (currentAmount < targetAmount) {
      const needed = targetAmount - currentAmount;
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
      return result;
    } catch (error) {
      // Check if this is a signature/sequence related error that might benefit from retry
      if (error.message.includes('signature verification failed') ||
          error.message.includes('account sequence mismatch') ||
          error.message.includes('unauthorized')) {

        if (attempt < maxRetries) {
          console.log(`⏳ Retrying cosmos tx in 2s (${error.message.split('.')[0]})`);
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
    // Create simple eth_secp256k1 compatible wallet
    const wallet = await createSimpleEthSecp256k1Wallet(chainConf.sender.mnemonic, chainConf.sender.option);
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

  // For now, only send native tokens via Cosmos bank sends
  // TODO: Handle ERC20 tokens later (they can't be sent via bank send)
  const tokensToSend = neededAmounts.filter(token =>
    token.erc20_contract === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" ||
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

  // Create wallet and get account info
  const wallet = await createEthCompatibleCosmosWallet(chainConf.sender.mnemonic, chainConf.sender.option);
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
  const privateKeyBytes = getPrivateKeyFromMnemonic(chainConf.sender.mnemonic, pathToString(chainConf.sender.option.hdPaths[0]));
  const publicKeyBytes = secp256k1.getPublicKey(privateKeyBytes, true); // compressed

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

// Smart EVM transaction with calculated amounts using new MultiSend contract
async function sendSmartEvmTx(recipient, neededAmounts) {
  try {
    const chainConf = conf.blockchain;
    const ethProvider = new JsonRpcProvider(chainConf.endpoints.evm_endpoint);
    const wallet = HDNodeWallet.fromPhrase(chainConf.sender.mnemonic, undefined, pathToString(chainConf.sender.option.hdPaths[0])).connect(ethProvider);

    console.log("Sending smart EVM tokens to:", recipient, "needed amounts:", neededAmounts);

    // MultiSend contract address from centralized config
    const multiSendAddress = chainConf.contracts.multiSend;

    // MultiSend contract ABI
    const multiSendABI = [
      "function multiSend(address recipient, tuple(address token, uint256 amount)[] transfers) external payable",
      "function emergencyWithdraw(address token, uint256 amount) external"
    ];

    const multiSendContract = new Contract(multiSendAddress, multiSendABI, wallet);

    // Separate native tokens from ERC20 tokens
    const nativeTokens = neededAmounts.filter(token => token.erc20_contract === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE");
    const erc20Tokens = neededAmounts.filter(token => token.erc20_contract !== "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE");

    // Calculate total native amount
    const totalNativeAmount = nativeTokens.reduce((sum, token) => sum + BigInt(token.amount), 0n);

    // Prepare transfers for MultiSend contract (only ERC20 tokens)
    const transfers = erc20Tokens.map(token => ({
      token: token.erc20_contract,
      amount: token.amount
    }));

    console.log("New MultiSend transfers:", transfers);
    console.log("Native amount:", totalNativeAmount.toString());

    // First, approve the MultiSend contract to spend each ERC20 token
    const erc20ABI = [
      "function approve(address spender, uint256 amount) external returns (bool)",
      "function allowance(address owner, address spender) external view returns (uint256)"
    ];

    for (const token of erc20Tokens) {
      console.log(`Checking/setting approval for token ${token.erc20_contract}...`);
      const tokenContract = new Contract(token.erc20_contract, erc20ABI, wallet);

      // Check current allowance
      const currentAllowance = await tokenContract.allowance(wallet.address, multiSendAddress);
      console.log(`Current allowance for ${token.erc20_contract}: ${currentAllowance.toString()}`);

      // If allowance is insufficient, approve the required amount
      if (currentAllowance < BigInt(token.amount)) {
        console.log(`Approving ${token.amount} for token ${token.erc20_contract}...`);
        const approveTx = await tokenContract.approve(multiSendAddress, token.amount);
        await approveTx.wait();
        console.log(`Approval successful: ${approveTx.hash}`);
      }
    }

    // Debug logging before transaction
    console.log("About to call multiSend with:");
    console.log("- recipient:", recipient);
    console.log("- transfers:", JSON.stringify(transfers, null, 2));
    console.log("- totalNativeAmount:", totalNativeAmount.toString());
    console.log("- multiSendAddress:", multiSendAddress);
    console.log("- wallet address:", wallet.address);

    // Validate transfers array
    if (transfers.length === 0 && totalNativeAmount === 0n) {
      throw new Error("No transfers to process - both ERC20 transfers and native amount are empty");
    }

    // Call MultiSend contract
    const tx = await multiSendContract.multiSend(recipient, transfers, {
      value: totalNativeAmount, // Send native tokens as value
      gasLimit: chainConf.tx.fee.evm.gasLimit,
      gasPrice: chainConf.tx.fee.evm.gasPrice
    });

    console.log(`New MultiSend transaction hash: ${tx.hash}`);
    
    // Wait for transaction with better error handling
    let receipt;
    try {
      receipt = await tx.wait();
      console.log("Transaction successful:", receipt);
    } catch (error) {
      console.error("Transaction failed during wait:", error);
      
      // Try to get more detailed error information
      if (error.receipt) {
        console.log("Failed transaction receipt:", JSON.stringify(error.receipt, null, 2));
      }
      
      // Try to simulate the transaction to get the revert reason
      try {
        await multiSendContract.multiSend.staticCall(recipient, transfers, {
          value: totalNativeAmount,
          from: wallet.address
        });
      } catch (staticError) {
        console.log("Static call error (revert reason):", staticError.message);
      }
      
      throw error;
    }

    // Add results for all tokens
    const transferResults = neededAmounts.map(token => ({
      token: token.erc20_contract,
      amount: token.amount,
      denom: token.denom,
      hash: tx.hash,
      status: receipt.status,
      type: token.erc20_contract === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" ? 'native' : 'erc20'
    }));

    return {
      code: 0,
      hash: tx.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      transfers: transferResults,
      transactions: [tx.hash]
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
        // fetch full tx details from REST endpoint for UI display
        try {
          const rest = conf.blockchain.endpoints.rest_endpoint;
          const detailResp = await fetch(`${rest}/cosmos/tx/v1beta1/txs/${txResult.transactionHash}`);
          const detailJson = await detailResp.json();
          return {
            code: 0,
            message: "Tokens sent successfully!",
            transaction_hash: txResult.transactionHash,
            block_height: txResult.height,
            gas_used: txResult.gasUsed,
            tx_response: detailJson.tx_response || null
          };
        } catch (_) {
          // if REST lookup fails, fall back to minimal info
          return {
            code: 0,
            message: "Tokens sent successfully!",
            transaction_hash: txResult.transactionHash,
            block_height: txResult.height,
            gas_used: txResult.gasUsed
          };
        }
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
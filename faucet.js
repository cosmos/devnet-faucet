import express from 'express';
import fetch from 'node-fetch';

import { ethers } from 'ethers'
import { Wallet, HDNodeWallet, JsonRpcProvider, Contract, parseUnits, keccak256, getBytes } from 'ethers'
import { bech32 } from 'bech32';

import { DirectSecp256k1HdWallet, DirectSecp256k1Wallet } from "@cosmjs/proto-signing";
import { SigningStargateClient } from "@cosmjs/stargate";
import { sha256, Secp256k1, Secp256k1Signature, pathToString } from '@cosmjs/crypto';
import { fromHex, toHex, toBase64, fromBase64 } from '@cosmjs/encoding';
import { signEthSecp256k1 } from "@hanchon/evmos-signer";
import { encodeSecp256k1Pubkey } from "@cosmjs/amino";

// Noble crypto imports for proper key derivation
import { sha256 as nobleSha256 } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';
import { keccak_256 } from '@noble/hashes/sha3';
import { secp256k1 } from '@noble/curves/secp256k1';
import { mnemonicToSeedSync, validateMnemonic } from 'bip39';
import { BIP32Factory } from 'bip32';
import * as ecc from 'tiny-secp256k1';

import conf from './config.js'
import { FrequencyChecker } from './checker.js';

// Initialize BIP32 with ECC
const bip32 = BIP32Factory(ecc);

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
  // Remove 0x prefix if present
  const hex = hexAddress.replace('0x', '');

  // Convert hex string to bytes
  const addressBytes = fromHex(hex);

  // Direct conversion without ripemd160 hashing (ETH-compatible)
  const cosmosAddress = bech32.encode(prefix, bech32.toWords(addressBytes));

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

// Helper function to encode eth_secp256k1 pubkey (similar to Archmage's encodeEthSecp256k1Pubkey)
function encodeEthSecp256k1Pubkey(pubkey) {
  return {
    type: "ethermint/PubKeyEthSecp256k1",
    value: toBase64(pubkey)
  };
}

// Helper function to create the correct pubkey Any for eth_secp256k1 chains
function makePubkeyAnyForEthSecp256k1(pubkey, chainId) {
  // For cosmos-evm chains, use the ethermint type
  const typeUrl = "/ethermint.crypto.v1.ethsecp256k1.PubKey";

  // Create the protobuf structure
  const pubkeyProto = {
    key: pubkey
  };

  return {
    typeUrl,
    value: pubkeyProto
  };
}

/**
 * Create ETH-compatible cosmos wallet for eth_secp256k1 chains
 */
async function createEthCompatibleCosmosWallet(mnemonic, options) {
    console.log('\n=== WALLET CREATION DEBUG ===');
    console.log('Mnemonic:', mnemonic);

    // Derive private key from mnemonic using the specified HD path
    const derivationPath = pathToString(options.hdPaths[0]);
    console.log('Derivation path:', derivationPath);

    const privateKeyBytes = getPrivateKeyFromMnemonic(mnemonic, derivationPath);
    const privateKeyHex = Buffer.from(privateKeyBytes).toString('hex');
    console.log('Private key (hex):', privateKeyHex);

    // Generate addresses using ETH_SECP256K1 method
    const { cosmosAddress, ethAddress, publicKey } = generateEthSecp256k1AddressesFromPrivateKey(
        privateKeyHex,
        options.prefix
    );

    console.log('\n--- ETH_SECP256K1 Derivation Results ---');
    console.log('Cosmos address:', cosmosAddress);
    console.log('EVM address:', ethAddress);
    console.log('Public key (compressed hex):', publicKey);

    // Get the compressed public key bytes
    const publicKeyBytes = Buffer.from(publicKey, 'hex');
    console.log('Public key length:', publicKeyBytes.length, 'bytes');

    console.log('\n--- Address Derivation Details ---');
    // Show step-by-step address derivation for ETH_SECP256K1
    const privateKey = Uint8Array.from(Buffer.from(privateKeyHex.padStart(64, '0'), 'hex'));
    const publicKeyCompressed = secp256k1.getPublicKey(privateKey, true);
    const publicKeyUncompressed = secp256k1.getPublicKey(privateKey, false);

    console.log('Uncompressed public key (with 0x04 prefix):', Buffer.from(publicKeyUncompressed).toString('hex'));
    console.log('Uncompressed public key (without prefix):', Buffer.from(publicKeyUncompressed.slice(1)).toString('hex'));

    const keccakHash = keccak_256(publicKeyUncompressed.slice(1));
    console.log('Keccak256 hash:', Buffer.from(keccakHash).toString('hex'));

    const addressBytes = keccakHash.slice(-20);
    console.log('Address bytes (last 20 bytes):', Buffer.from(addressBytes).toString('hex'));

    const fiveBitArray = convertBits(addressBytes, 8, 5, true);
    console.log('5-bit array for bech32:', fiveBitArray);

    const finalCosmosAddress = bech32.encode(options.prefix, fiveBitArray, 256);
    console.log('Final cosmos address:', finalCosmosAddress);
    console.log('Matches generated address:', finalCosmosAddress === cosmosAddress);

    console.log('=== END WALLET DEBUG ===\n');

    // Create a wallet that properly handles eth_secp256k1 signing
    // We'll use the private key directly for signing instead of relying on DirectSecp256k1Wallet
    return {
        async getAccounts() {
            return [{
                address: cosmosAddress,  // Use ETH-compatible cosmos address
                pubkey: publicKeyBytes,  // Use the compressed public key
                algo: "secp256k1"  // Use standard secp256k1 algorithm
            }];
        },

        async signDirect(signerAddress, signDoc) {
            console.log('\n--- SIGNING DEBUG ---');
            console.log('Signing for address:', signerAddress);
            console.log('Public key being used:', Buffer.from(publicKeyBytes).toString('hex'));

            // Create the signature manually using the private key
            const signBytes = signDoc.bodyBytes;
            const messageHash = sha256(signBytes);

            // Sign with secp256k1
            const signature = await Secp256k1.createSignature(messageHash, privateKeyBytes);

            const result = {
                signed: signDoc,
                signature: {
                    pub_key: {
                        type: "/cosmos.crypto.secp256k1.PubKey",
                        value: toBase64(publicKeyBytes)
                    },
                    signature: toBase64(signature.toFixedLength())
                }
            };

            console.log('Signature result:', result);
            console.log('--- END SIGNING DEBUG ---\n');
            return result;
        },

        async signAmino(signerAddress, signDoc) {
            // For amino signing, we also need to handle it manually
            const signBytes = Buffer.from(JSON.stringify(signDoc), 'utf8');
            const messageHash = sha256(signBytes);

            const signature = await Secp256k1.createSignature(messageHash, privateKeyBytes);

            return {
                signed: signDoc,
                signature: {
                    pub_key: encodeSecp256k1Pubkey(publicKeyBytes),
                    signature: toBase64(signature.toFixedLength())
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

  // Create EVM wallet to get the correct addresses
  const evmWallet = HDNodeWallet.fromPhrase(chainConf.sender.mnemonic, undefined, pathToString(chainConf.sender.option.hdPaths[0]));
  sample.evm = evmWallet.address;
  sample.cosmos = evmToCosmosAddress(evmWallet, chainConf.sender.option.prefix);

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
      const ethProvider = new JsonRpcProvider(chainConf.endpoints.evm_endpoint);
      const wallet = HDNodeWallet.fromPhrase(chainConf.sender.mnemonic, undefined, pathToString(chainConf.sender.option.hdPaths[0])).connect(ethProvider);

      // Get native balance and ERC20 balances
      const nativeBalance = await ethProvider.getBalance(wallet.address);
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
              const tokenContract = new Contract(token.erc20_contract, erc20ABI, ethProvider);
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
  const evmWallet = HDNodeWallet.fromPhrase(chainConf.sender.mnemonic, undefined, pathToString(chainConf.sender.option.hdPaths[0]));
  const cosmosAddress = evmToCosmosAddress(evmWallet, chainConf.sender.option.prefix);

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

// Send tokens using smart amounts (both cosmos and EVM as needed)
async function sendSmartFaucetTx(recipient, addressType, neededAmounts) {
  const results = [];

  // Separate native tokens from ERC20 tokens
  const nativeTokens = neededAmounts.filter(token =>
    token.erc20_contract === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" ||
    token.denom === "uatom"
  );

  const erc20Tokens = neededAmounts.filter(token =>
    token.erc20_contract !== "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" &&
    token.denom !== "uatom"
  );

  console.log('Native tokens to send via Cosmos:', nativeTokens);
  console.log('ERC20 tokens to send via EVM:', erc20Tokens);

  // Send native tokens via Cosmos (if any)
  if (nativeTokens.length > 0) {
    try {
      console.log('Sending native tokens via Cosmos...');
      const cosmosResult = await sendSmartCosmosTx(recipient, nativeTokens);
      results.push({ type: 'cosmos', result: cosmosResult });
    } catch (error) {
      console.error('Cosmos send failed:', error);
      throw new Error(`Cosmos transaction failed: ${error.message}`);
    }
  }

  // Send ERC20 tokens via EVM (if any)
  if (erc20Tokens.length > 0) {
    try {
      console.log('Sending ERC20 tokens via EVM...');

      // For ERC20 tokens, we need to send to the EVM address
      let evmRecipient;
      if (addressType === 'cosmos') {
        // Convert cosmos address to corresponding EVM address
        // For eth_secp256k1 chains, both addresses are derived from the same keccak256 hash
        evmRecipient = convertCosmosToEvmAddress(recipient);
        if (!evmRecipient) {
          throw new Error('Failed to convert cosmos address to EVM address');
        }
        console.log('Converted cosmos address to EVM address:', evmRecipient);
      } else {
        evmRecipient = recipient;
      }

      const evmResult = await sendSmartEvmTx(evmRecipient, erc20Tokens);
      results.push({ type: 'evm', result: evmResult });
    } catch (error) {
      console.error('EVM send failed:', error);
      throw new Error(`EVM transaction failed: ${error.message}`);
    }
  }

  // Combine results
  if (results.length === 0) {
    return { code: 0, message: "No tokens needed" };
  } else if (results.length === 1) {
    return results[0].result;
  } else {
    // Multiple transactions - combine results
    return {
      code: 0,
      message: "Tokens sent via multiple transactions",
      transactions: results
    };
  }
}

// Smart Cosmos transaction with calculated amounts (only for native tokens)
async function sendSmartCosmosTx(recipient, neededAmounts) {
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

  const wallet = await createEthCompatibleCosmosWallet(chainConf.sender.mnemonic, chainConf.sender.option);
  const [firstAccount] = await wallet.getAccounts();

  const rpcEndpoint = chainConf.endpoints.rpc_endpoint;
  const client = await SigningStargateClient.connectWithSigner(rpcEndpoint, wallet);

  // Prepare amounts from needed native tokens only
  const amounts = nativeTokens.map(token => ({
    denom: token.denom,
    amount: token.amount
  }));

  const fee = chainConf.tx.fee.cosmos;

  console.log("Sending smart cosmos tokens to:", recipient, "amounts:", amounts, "fee:", fee);
  return client.sendTokens(firstAccount.address, recipient, amounts, fee);
}

// Smart EVM transaction with calculated amounts using new MultiSend contract
async function sendSmartEvmTx(recipient, neededAmounts) {
  try {
    const chainConf = conf.blockchain;
    const ethProvider = new JsonRpcProvider(chainConf.endpoints.evm_endpoint);
    const wallet = HDNodeWallet.fromPhrase(chainConf.sender.mnemonic, undefined, pathToString(chainConf.sender.option.hdPaths[0])).connect(ethProvider);

    console.log("Sending smart EVM tokens to:", recipient, "needed amounts:", neededAmounts);

    // New MultiSend contract address (properly uses transferFrom)
    const multiSendAddress = "0x79495ae7976ff948DcC8a78D5e4460738dA50919";

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

    // Call MultiSend contract
    const tx = await multiSendContract.multiSend(recipient, transfers, {
      value: totalNativeAmount, // Send native tokens as value
      gasLimit: chainConf.tx.fee.evm.gasLimit,
      gasPrice: chainConf.tx.fee.evm.gasPrice
    });

    console.log(`New MultiSend transaction hash: ${tx.hash}`);
    const receipt = await tx.wait();

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
    return hexToBech32(evmAddress, prefix);
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
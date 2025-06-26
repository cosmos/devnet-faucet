#!/usr/bin/env node

import { ethers } from 'ethers';
import { createHash } from 'crypto';
import config from '../config.js';
import secureKeyManager from '../src/SecureKeyManager.js';
import fetch from 'node-fetch';

// Message types for Cosmos SDK
const MSG_TYPES = {
  REGISTER_COIN: '/cosmos.evm.erc20.v1.MsgRegisterCoin',
  TOGGLE_CONVERSION: '/cosmos.evm.erc20.v1.MsgToggleConversion'
};

// IBC tokens to register
const IBC_TOKENS = [
  {
    denom: 'ibc/13B2C536BB057AC79D5616B8EA1B9540EC1F2170718CAFF6F0083C966FFFED0B',
    name: 'Osmosis',
    symbol: 'OSMO'
  },
  {
    denom: 'ibc/65D0BEC6DAD96C7F5043D1E54E54B6BB5D5B3AEC3FF6CEBB75B9E059F3580EA3',
    name: 'USD Coin', 
    symbol: 'USDC'
  }
];

// Get signer info from eth_secp256k1 key
async function getSignerInfo() {
  await secureKeyManager.initialize();
  const mnemonic = await secureKeyManager.getMnemonic();
  
  // Derive Ethereum wallet
  const hdNode = ethers.HDNodeWallet.fromPhrase(mnemonic);
  const ethWallet = hdNode.derivePath("m/44'/60'/0'/0/0");
  
  // The Cosmos address should be in the config
  const cosmosAddress = config.blockchain.sender.mnemonic;
  
  return {
    ethWallet,
    cosmosAddress,
    publicKey: ethWallet.publicKey
  };
}

// Build transaction for registering native coins
async function buildRegisterCoinTx(signer, tokens) {
  console.log('Building RegisterCoin transaction...\n');
  
  // Get account info
  const accountResponse = await fetch(
    `${config.blockchain.endpoints.rest_endpoint}/cosmos/auth/v1beta1/accounts/${signer.cosmosAddress}`
  );
  const accountData = await accountResponse.json();
  
  let accountNumber, sequence;
  if (accountData.account) {
    const account = accountData.account;
    if (account['@type'].includes('EthAccount')) {
      accountNumber = account.base_account?.account_number || '0';
      sequence = account.base_account?.sequence || '0';
    } else {
      accountNumber = account.account_number || '0';
      sequence = account.sequence || '0';
    }
  } else {
    accountNumber = '0';
    sequence = '0';
  }
  
  console.log(`Account: ${signer.cosmosAddress}`);
  console.log(`Account Number: ${accountNumber}`);
  console.log(`Sequence: ${sequence}\n`);
  
  // For native denoms, we need to create metadata first
  const messages = [];
  
  for (const token of tokens) {
    // Create bank metadata message
    messages.push({
      '@type': '/cosmos.bank.v1beta1.MsgSetDenomMetadata',
      sender: signer.cosmosAddress,
      metadata: {
        description: `IBC ${token.symbol} token`,
        denom_units: [
          {
            denom: token.denom,
            exponent: 0,
            aliases: []
          },
          {
            denom: token.symbol.toLowerCase(),
            exponent: 6,
            aliases: []
          }
        ],
        base: token.denom,
        display: token.symbol.toLowerCase(),
        name: token.name,
        symbol: token.symbol
      }
    });
  }
  
  // Build transaction
  const tx = {
    body: {
      messages: messages,
      memo: 'Register IBC tokens metadata',
      timeout_height: '0',
      extension_options: [],
      non_critical_extension_options: []
    },
    auth_info: {
      signer_infos: [
        {
          public_key: {
            '@type': '/ethermint.crypto.v1.ethsecp256k1.PubKey',
            key: Buffer.from(signer.publicKey.slice(2), 'hex').toString('base64')
          },
          mode_info: {
            single: {
              mode: 'SIGN_MODE_DIRECT'
            }
          },
          sequence: sequence
        }
      ],
      fee: {
        amount: [
          {
            denom: 'uatom',
            amount: '5000'
          }
        ],
        gas_limit: '200000',
        payer: '',
        granter: ''
      }
    },
    signatures: []
  };
  
  return { tx, accountNumber, sequence };
}

// Sign transaction with eth_secp256k1
async function signTransaction(tx, accountNumber, sequence, chainId, signer) {
  console.log('Signing transaction...\n');
  
  // Create sign doc
  const signDoc = {
    body_bytes: Buffer.from(JSON.stringify(tx.body)).toString('base64'),
    auth_info_bytes: Buffer.from(JSON.stringify(tx.auth_info)).toString('base64'),
    chain_id: chainId,
    account_number: accountNumber
  };
  
  // Create sign bytes (simplified - in production use proper protobuf encoding)
  const signBytes = Buffer.from(JSON.stringify(signDoc));
  
  // Sign with Ethereum wallet
  const signature = await signer.ethWallet.signMessage(signBytes);
  
  // Add signature to transaction
  tx.signatures = [signature];
  
  return tx;
}

// Broadcast transaction
async function broadcastTx(signedTx) {
  console.log('Broadcasting transaction...\n');
  
  try {
    const response = await fetch(
      `${config.blockchain.endpoints.rest_endpoint}/cosmos/tx/v1beta1/txs`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tx_bytes: Buffer.from(JSON.stringify(signedTx)).toString('base64'),
          mode: 'BROADCAST_MODE_SYNC'
        })
      }
    );
    
    const result = await response.json();
    console.log('Broadcast result:', JSON.stringify(result, null, 2));
    
    if (result.tx_response) {
      if (result.tx_response.code === 0) {
        console.log(`✓ Transaction successful: ${result.tx_response.txhash}`);
      } else {
        console.log(`✗ Transaction failed: ${result.tx_response.raw_log}`);
      }
    }
    
    return result;
  } catch (error) {
    console.error('Broadcast error:', error);
    throw error;
  }
}

// Alternative: Direct module call approach
async function registerViaModuleCall() {
  console.log('\nAlternative: Direct Module Registration');
  console.log('======================================\n');
  
  // Get current params
  const paramsResponse = await fetch(
    `${config.blockchain.endpoints.rest_endpoint}/cosmos/evm/erc20/v1/params`
  );
  const paramsData = await paramsResponse.json();
  console.log('ERC20 Module Params:', JSON.stringify(paramsData, null, 2));
  
  // For native denoms with metadata, they might auto-register
  // Let's check if there's a specific endpoint for registration
  console.log('\nChecking for registration endpoints...');
  
  // Try to find available endpoints
  const endpoints = [
    '/cosmos/evm/erc20/v1/register_coin',
    '/cosmos/evm/erc20/v1/register_native_coin',
    '/cosmos/evm/erc20/v1/token_pairs/register'
  ];
  
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${config.blockchain.endpoints.rest_endpoint}${endpoint}`);
      console.log(`${endpoint}: ${response.status}`);
    } catch (error) {
      console.log(`${endpoint}: Not available`);
    }
  }
}

async function main() {
  console.log('IBC Token Registration (Direct Transaction)');
  console.log('==========================================\n');
  
  try {
    // Get signer info
    const signer = await getSignerInfo();
    console.log(`Using account: ${signer.cosmosAddress}`);
    console.log(`ETH address: ${signer.ethWallet.address}\n`);
    
    // Check current registration status
    console.log('Current token pairs:');
    const pairsResponse = await fetch(
      `${config.blockchain.endpoints.rest_endpoint}/cosmos/evm/erc20/v1/token_pairs`
    );
    const pairsData = await pairsResponse.json();
    pairsData.token_pairs.forEach(pair => {
      console.log(`- ${pair.denom} -> ${pair.erc20_address}`);
    });
    console.log('');
    
    // Build and sign transaction
    const { tx, accountNumber, sequence } = await buildRegisterCoinTx(signer, IBC_TOKENS);
    const signedTx = await signTransaction(
      tx, 
      accountNumber, 
      sequence, 
      config.blockchain.ids.cosmosChainId,
      signer
    );
    
    // Broadcast
    const result = await broadcastTx(signedTx);
    
    // Also try alternative approaches
    await registerViaModuleCall();
    
    console.log('\nNote: If direct registration fails, the tokens might need:');
    console.log('1. Governance proposal for registration');
    console.log('2. Special permissions for the signer');
    console.log('3. Different message type or approach');
    console.log('\nThe tokens are already configured in the faucet and can be');
    console.log('distributed as native tokens to both Cosmos and EVM addresses.');
    
  } catch (error) {
    console.error('Registration failed:', error);
  }
}

main().catch(console.error);
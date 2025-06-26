#!/usr/bin/env node

import { Registry, encodePubkey } from '@cosmjs/proto-signing';
import { TxBody, AuthInfo, SignDoc, TxRaw, SignerInfo, ModeInfo, Fee } from 'cosmjs-types/cosmos/tx/v1beta1/tx.js';
import { MsgSend } from 'cosmjs-types/cosmos/bank/v1beta1/tx.js';
import { Any } from 'cosmjs-types/google/protobuf/any.js';
import { PubKey } from 'cosmjs-types/ethermint/crypto/v1/ethsecp256k1/keys.js';
import { toBase64 } from '@cosmjs/encoding';
import secp256k1 from 'secp256k1';
import { Buffer } from 'buffer';
import { keccak_256 } from '@noble/hashes/sha3';
import fetch from 'node-fetch';
import config from '../config.js';
import { getPrivateKeyBytes, getCosmosAddress, getEthPublicKey } from '../faucet.js';

// Message type URLs
const MSG_REGISTER_COIN = '/cosmos.evm.erc20.v1.MsgRegisterCoin';
const MSG_TOGGLE_CONVERSION = '/cosmos.evm.erc20.v1.MsgToggleConversion';

// Get account info
async function getAccountInfo(address) {
  console.log(`Getting account info for ${address}...`);
  
  try {
    const url = `${config.blockchain.endpoints.rest_endpoint}/cosmos/auth/v1beta1/accounts/${address}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to get account info: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Handle different account types
    if (data.account && data.account['@type']) {
      let accountInfo;
      
      if (data.account['@type'].includes('EthAccount')) {
        accountInfo = {
          accountNumber: parseInt(data.account.base_account?.account_number || '0'),
          sequence: parseInt(data.account.base_account?.sequence || '0')
        };
      } else {
        accountInfo = {
          accountNumber: parseInt(data.account.account_number || '0'),
          sequence: parseInt(data.account.sequence || '0')
        };
      }
      
      console.log('Account info:', accountInfo);
      return accountInfo;
    }
    
    return { accountNumber: 0, sequence: 0 };
  } catch (error) {
    console.error('Error getting account info:', error);
    return { accountNumber: 0, sequence: 0 };
  }
}

// Create registration message
function createRegisterCoinMessage(senderAddress, metadata) {
  return {
    typeUrl: MSG_REGISTER_COIN,
    value: {
      authority: senderAddress, // In permissionless mode, sender can be authority
      metadata: metadata
    }
  };
}

// Create toggle conversion message
function createToggleConversionMessage(authority, token) {
  return {
    typeUrl: MSG_TOGGLE_CONVERSION,
    value: {
      authority: authority,
      token: token
    }
  };
}

// Build transaction
async function buildTransaction(fromAddress, messages, sequence, accountNumber, chainId) {
  console.log('Building transaction...');
  
  // Create transaction body
  const txBody = TxBody.fromPartial({
    messages: messages.map(msg => {
      const msgAny = Any.fromPartial({
        typeUrl: msg.typeUrl,
        value: encodeMessage(msg)
      });
      return msgAny;
    }),
    memo: 'Register IBC tokens for ERC20',
  });
  
  // Get public key
  const publicKey = getEthPublicKey();
  console.log('Public key:', publicKey.toString('hex'));
  
  // Create the Ethermint public key
  const pubkey = PubKey.fromPartial({
    key: publicKey
  });
  
  const pubkeyAny = Any.fromPartial({
    typeUrl: '/ethermint.crypto.v1.ethsecp256k1.PubKey',
    value: PubKey.encode(pubkey).finish()
  });
  
  // Create signer info
  const signerInfo = SignerInfo.fromPartial({
    publicKey: pubkeyAny,
    modeInfo: ModeInfo.fromPartial({
      single: {
        mode: 1 // SIGN_MODE_DIRECT
      }
    }),
    sequence: BigInt(sequence)
  });
  
  // Create fee
  const fee = Fee.fromPartial({
    amount: [{ denom: 'uatom', amount: '5000' }],
    gasLimit: BigInt(200000)
  });
  
  // Create auth info
  const authInfo = AuthInfo.fromPartial({
    signerInfos: [signerInfo],
    fee: fee
  });
  
  const authInfoBytes = AuthInfo.encode(authInfo).finish();
  
  // Create sign doc
  const signDoc = SignDoc.fromPartial({
    bodyBytes: TxBody.encode(txBody).finish(),
    authInfoBytes: authInfoBytes,
    chainId: chainId,
    accountNumber: BigInt(accountNumber)
  });
  
  return { txBody, authInfo: authInfoBytes, signDoc };
}

// Encode message based on type
function encodeMessage(msg) {
  // For now, return empty bytes - in production, properly encode the message
  // This would require the proper protobuf definitions for ERC20 module messages
  console.log(`Encoding message of type: ${msg.typeUrl}`);
  return new Uint8Array();
}

// Sign and broadcast transaction
async function signAndBroadcast(txBody, authInfoBytes, signDoc) {
  console.log('Signing transaction...');
  
  // Get private key
  const privateKeyBytes = getPrivateKeyBytes();
  
  // Sign using Keccak256 (eth_secp256k1 style)
  const signBytes = SignDoc.encode(signDoc).finish();
  const hashedMessage = Buffer.from(keccak_256(signBytes));
  
  console.log('Sign bytes length:', signBytes.length);
  console.log('Hash (Keccak256):', hashedMessage.toString('hex'));
  
  // Sign with secp256k1
  const signatureResult = secp256k1.sign(hashedMessage, privateKeyBytes);
  
  // Create 64-byte signature (R || S)
  const signatureBytes = Buffer.concat([
    Buffer.from(signatureResult.r.toString(16).padStart(64, '0'), 'hex'),
    Buffer.from(signatureResult.s.toString(16).padStart(64, '0'), 'hex')
  ]);
  
  console.log('Signature length:', signatureBytes.length);
  
  // Construct the transaction
  const txRaw = TxRaw.fromPartial({
    bodyBytes: TxBody.encode(txBody).finish(),
    authInfoBytes: authInfoBytes,
    signatures: [signatureBytes],
  });
  
  // Encode transaction
  const txBytes = TxRaw.encode(txRaw).finish();
  const txBase64 = toBase64(txBytes);
  
  // Broadcast transaction
  console.log('Broadcasting transaction...');
  const broadcastUrl = `${config.blockchain.endpoints.rest_endpoint}/cosmos/tx/v1beta1/txs`;
  const broadcastResponse = await fetch(broadcastUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tx_bytes: txBase64,
      mode: 'BROADCAST_MODE_SYNC'
    })
  });
  
  const broadcastResult = await broadcastResponse.json();
  console.log('Broadcast result:', JSON.stringify(broadcastResult, null, 2));
  
  if (broadcastResult.tx_response && broadcastResult.tx_response.code !== 0) {
    throw new Error(`Transaction failed: ${broadcastResult.tx_response.raw_log}`);
  }
  
  return broadcastResult;
}

// Main function
async function main() {
  console.log('IBC Token ERC20 Registration');
  console.log('============================\n');
  
  try {
    const fromAddress = getCosmosAddress();
    console.log(`Using address: ${fromAddress}\n`);
    
    // Get account info
    const accountInfo = await getAccountInfo(fromAddress);
    
    // Check current token pairs
    console.log('Checking current token pairs...');
    const pairsResponse = await fetch(
      `${config.blockchain.endpoints.rest_endpoint}/cosmos/evm/erc20/v1/token_pairs`
    );
    const pairsData = await pairsResponse.json();
    console.log('Current pairs:', pairsData.token_pairs.map(p => p.denom));
    
    // For native IBC denoms, we typically don't register them directly
    // They should be accessible through the precompile if the chain supports it
    console.log('\nNote: Native IBC denoms typically don\'t need explicit registration.');
    console.log('They may be automatically available through the ERC20 precompile.');
    console.log('\nThe faucet is already configured to distribute these tokens:');
    console.log('- OSMO: ibc/13B2C536BB057AC79D5616B8EA1B9540EC1F2170718CAFF6F0083C966FFFED0B');
    console.log('- USDC: ibc/65D0BEC6DAD96C7F5043D1E54E54B6BB5D5B3AEC3FF6CEBB75B9E059F3580EA3');
    
    // If we need to register, here's how it would work:
    /*
    const messages = [];
    
    // Add registration messages for IBC tokens
    const ibcTokens = [
      {
        denom: 'ibc/13B2C536BB057AC79D5616B8EA1B9540EC1F2170718CAFF6F0083C966FFFED0B',
        metadata: {
          description: 'IBC OSMO from Osmosis',
          denom_units: [{denom: 'uosmo', exponent: 0}],
          base: 'ibc/13B2C536BB057AC79D5616B8EA1B9540EC1F2170718CAFF6F0083C966FFFED0B',
          display: 'osmo',
          name: 'Osmosis',
          symbol: 'OSMO'
        }
      },
      // ... more tokens
    ];
    
    for (const token of ibcTokens) {
      messages.push(createRegisterCoinMessage(fromAddress, token.metadata));
    }
    
    // Build and sign transaction
    const { txBody, authInfo, signDoc } = await buildTransaction(
      fromAddress,
      messages,
      accountInfo.sequence,
      accountInfo.accountNumber,
      config.blockchain.ids.cosmosChainId
    );
    
    // Sign and broadcast
    const result = await signAndBroadcast(txBody, authInfo, signDoc);
    console.log('Transaction hash:', result.tx_response?.txhash);
    */
    
    console.log('\nTo use IBC tokens with EVM:');
    console.log('1. Native transfers work through the faucet');
    console.log('2. ERC20 precompile access may be available at 0x0000000000000000000000000000000000000802');
    console.log('3. Or deploy wrapped token contracts if needed');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
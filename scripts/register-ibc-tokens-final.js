#!/usr/bin/env node

import { TxBody, AuthInfo, SignDoc, TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx.js';
import { Any } from 'cosmjs-types/google/protobuf/any.js';
import { toBase64 } from '@cosmjs/encoding';
import { makeAuthInfoBytes, makeSignDoc } from '@cosmjs/proto-signing';
import { secp256k1 } from '@noble/curves/secp256k1';
import { Buffer } from 'buffer';
import { keccak_256 } from '@noble/hashes/sha3';
import fetch from 'node-fetch';
import Long from 'long';
import config from '../config.js';
import { getPrivateKeyBytes, getCosmosAddress, getPublicKeyBytes } from '../faucet.js';

// Protobuf encoding for MsgRegisterERC20
function encodeMsgRegisterERC20(signer, erc20addresses) {
  // Manual protobuf encoding
  const parts = [];
  
  // Field 1: signer (string)
  if (signer) {
    const signerBytes = Buffer.from(signer, 'utf8');
    parts.push(Buffer.from([0x0a])); // field 1, wire type 2
    parts.push(Buffer.from([signerBytes.length]));
    parts.push(signerBytes);
  }
  
  // Field 2: erc20addresses (repeated string)
  // For native coins, this should be empty
  erc20addresses.forEach(addr => {
    const addrBytes = Buffer.from(addr, 'utf8');
    parts.push(Buffer.from([0x12])); // field 2, wire type 2
    parts.push(Buffer.from([addrBytes.length]));
    parts.push(addrBytes);
  });
  
  return Buffer.concat(parts);
}

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

// Create and send transaction
async function createAndSendTransaction(fromAddress, sequence, accountNumber, chainId) {
  console.log('Creating transaction to register IBC tokens...\n');
  
  try {
    // Create the message
    const msgValue = encodeMsgRegisterERC20(fromAddress, []); // Empty array for native coins
    
    const msg = {
      typeUrl: '/cosmos.evm.erc20.v1.MsgRegisterERC20',
      value: msgValue
    };
    
    // Create transaction body
    const txBody = TxBody.fromPartial({
      messages: [Any.fromPartial({
        typeUrl: msg.typeUrl,
        value: msg.value
      })],
      memo: 'Register IBC tokens for ERC20'
    });
    
    // Get fee configuration
    const feeAmount = [{
      denom: 'uatom',
      amount: '50000'
    }];
    const gasLimit = Long.fromString('500000');
    
    // Create pubkey (same as faucet)
    const pubkeyBytes = getPublicKeyBytes();
    console.log('Public key (hex):', pubkeyBytes.toString('hex'));
    
    // Create protobuf encoding for PubKey { key: bytes }
    const fieldTag = (1 << 3) | 2; // field 1, wire type 2
    const pubkeyProto = Buffer.concat([
      Buffer.from([fieldTag]),
      Buffer.from([pubkeyBytes.length]),
      pubkeyBytes
    ]);
    
    const pubkey = Any.fromPartial({
      typeUrl: '/cosmos.evm.crypto.v1.ethsecp256k1.PubKey',
      value: pubkeyProto
    });
    
    // Create auth info
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
      Long.fromNumber(accountNumber)
    );
    
    // Sign using Keccak256 (for eth_secp256k1)
    const privateKeyBytes = getPrivateKeyBytes();
    const signBytes = SignDoc.encode(signDoc).finish();
    const hashedMessage = Buffer.from(keccak_256(signBytes));
    
    console.log('Sign bytes length:', signBytes.length);
    console.log('Hash (Keccak256):', hashedMessage.toString('hex'));
    
    // Sign with secp256k1 using Noble
    const signature = secp256k1.sign(hashedMessage, privateKeyBytes);
    
    // Create 64-byte signature (R || S)
    const signatureBytes = signature.toCompactRawBytes();
    
    console.log('Signature length:', signatureBytes.length);
    
    // Construct the transaction
    const txRaw = TxRaw.fromPartial({
      bodyBytes: TxBody.encode(txBody).finish(),
      authInfoBytes: authInfo,
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
    
    if (!broadcastResponse.ok) {
      const errorData = await broadcastResponse.json();
      console.error('Broadcast error:', errorData);
      throw new Error(`Broadcast failed: ${JSON.stringify(errorData)}`);
    }
    
    const broadcastResult = await broadcastResponse.json();
    console.log('Broadcast result:', JSON.stringify(broadcastResult, null, 2));
    
    if (broadcastResult.tx_response && broadcastResult.tx_response.code !== 0) {
      throw new Error(`Transaction failed: ${broadcastResult.tx_response.raw_log || broadcastResult.tx_response.log}`);
    }
    
    return broadcastResult;
    
  } catch (error) {
    console.error('Transaction error:', error);
    throw error;
  }
}

async function main() {
  console.log('IBC Token ERC20 Registration (Final)');
  console.log('====================================\n');
  
  try {
    // Check module params
    console.log('Checking ERC20 module parameters...');
    const paramsResponse = await fetch(
      `${config.blockchain.endpoints.rest_endpoint}/cosmos/evm/erc20/v1/params`
    );
    const paramsData = await paramsResponse.json();
    console.log('Permissionless registration:', paramsData.params.permissionless_registration);
    console.log('ERC20 enabled:', paramsData.params.enable_erc20);
    console.log('');
    
    // Get faucet address
    const fromAddress = getCosmosAddress();
    console.log(`Using faucet address: ${fromAddress}\n`);
    
    // Check current token pairs
    console.log('Current token pairs:');
    const pairsResponse = await fetch(
      `${config.blockchain.endpoints.rest_endpoint}/cosmos/evm/erc20/v1/token_pairs`
    );
    const pairsData = await pairsResponse.json();
    
    const existingDenoms = new Set(pairsData.token_pairs.map(p => p.denom));
    pairsData.token_pairs.forEach(pair => {
      console.log(`- ${pair.denom} -> ${pair.erc20_address}`);
    });
    
    // Check if IBC tokens are already registered
    const ibcTokens = [
      { denom: 'ibc/13B2C536BB057AC79D5616B8EA1B9540EC1F2170718CAFF6F0083C966FFFED0B', name: 'OSMO' },
      { denom: 'ibc/65D0BEC6DAD96C7F5043D1E54E54B6BB5D5B3AEC3FF6CEBB75B9E059F3580EA3', name: 'USDC' }
    ];
    
    const unregistered = ibcTokens.filter(t => !existingDenoms.has(t.denom));
    
    if (unregistered.length === 0) {
      console.log('\n✓ All IBC tokens are already registered!');
      return;
    }
    
    console.log(`\nFound ${unregistered.length} unregistered IBC tokens:`);
    unregistered.forEach(t => console.log(`- ${t.name}: ${t.denom}`));
    
    // Get account info
    const accountInfo = await getAccountInfo(fromAddress);
    
    // Create and send registration transaction
    console.log('\nSending registration transaction...');
    const result = await createAndSendTransaction(
      fromAddress,
      accountInfo.sequence,
      accountInfo.accountNumber,
      config.blockchain.ids.cosmosChainId
    );
    
    if (result.tx_response && result.tx_response.txhash) {
      console.log(`\n✓ Transaction submitted: ${result.tx_response.txhash}`);
      console.log(`View: ${config.blockchain.endpoints.rest_endpoint}/cosmos/tx/v1beta1/txs/${result.tx_response.txhash}`);
      
      // Wait and check result
      console.log('\nWaiting 5 seconds to check registration...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Check token pairs again
      const newPairsResponse = await fetch(
        `${config.blockchain.endpoints.rest_endpoint}/cosmos/evm/erc20/v1/token_pairs`
      );
      const newPairsData = await newPairsResponse.json();
      
      console.log('\nUpdated token pairs:');
      newPairsData.token_pairs.forEach(pair => {
        console.log(`- ${pair.denom} -> ${pair.erc20_address}`);
        const token = ibcTokens.find(t => t.denom === pair.denom);
        if (token) {
          console.log(`  ✓ ${token.name} is now registered!`);
        }
      });
    }
    
  } catch (error) {
    console.error('\nRegistration failed:', error.message);
    
    if (error.message.includes('invalid')) {
      console.log('\nTroubleshooting:');
      console.log('1. Check if the module requires specific permissions');
      console.log('2. Verify the IBC tokens have bank metadata set');
      console.log('3. Try using the Cosmos CLI if available');
      console.log('\nThe faucet can still distribute these tokens as native coins!');
    }
  }
}

main().catch(console.error);
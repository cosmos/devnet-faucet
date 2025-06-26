#!/usr/bin/env node

import { TxBody, AuthInfo, SignDoc, TxRaw, SignerInfo, ModeInfo, Fee } from 'cosmjs-types/cosmos/tx/v1beta1/tx.js';
import { Any } from 'cosmjs-types/google/protobuf/any.js';
import { PubKey } from 'cosmjs-types/ethermint/crypto/v1/ethsecp256k1/keys.js';
import { toBase64 } from '@cosmjs/encoding';
import secp256k1 from 'secp256k1';
import { Buffer } from 'buffer';
import { keccak_256 } from '@noble/hashes/sha3';
import fetch from 'node-fetch';
import Long from 'long';
import config from '../config.js';
import { getPrivateKeyBytes, getCosmosAddress, getEthPublicKey } from '../faucet.js';

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

// Create and send transaction using faucet's signing method
async function createAndSendTransaction(fromAddress, sequence, accountNumber, chainId) {
  console.log('Creating transaction to register IBC tokens...\n');
  
  // For permissionless registration of native coins, we send MsgRegisterERC20 with empty addresses
  // This tells the module to register all native coins that have bank metadata
  const msgAny = Any.fromPartial({
    typeUrl: '/cosmos.evm.erc20.v1.MsgRegisterERC20',
    value: Buffer.from(JSON.stringify({
      signer: fromAddress,
      erc20addresses: [] // Empty array for native coins
    }))
  });
  
  // Create transaction body
  const txBody = TxBody.fromPartial({
    messages: [msgAny],
    memo: 'Register IBC tokens for ERC20 (permissionless)',
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
    sequence: Long.fromNumber(sequence)
  });
  
  // Create fee
  const fee = Fee.fromPartial({
    amount: [{ denom: 'uatom', amount: '50000' }],
    gasLimit: Long.fromNumber(500000),
    payer: '',
    granter: ''
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
    accountNumber: Long.fromNumber(accountNumber)
  });
  
  // Sign using the faucet's method (Keccak256 for eth_secp256k1)
  const privateKeyBytes = getPrivateKeyBytes();
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
}

async function main() {
  console.log('IBC Token Permissionless Registration');
  console.log('=====================================\n');
  
  try {
    // Check module params
    console.log('Checking ERC20 module parameters...');
    const paramsResponse = await fetch(
      `${config.blockchain.endpoints.rest_endpoint}/cosmos/evm/erc20/v1/params`
    );
    const paramsData = await paramsResponse.json();
    console.log('Module params:', JSON.stringify(paramsData.params, null, 2));
    
    if (!paramsData.params.permissionless_registration) {
      throw new Error('Permissionless registration is not enabled!');
    }
    
    console.log('\n✓ Permissionless registration is enabled!\n');
    
    // Get faucet address
    const fromAddress = getCosmosAddress();
    console.log(`Using faucet address: ${fromAddress}\n`);
    
    // Check current token pairs
    console.log('Current token pairs:');
    const pairsResponse = await fetch(
      `${config.blockchain.endpoints.rest_endpoint}/cosmos/evm/erc20/v1/token_pairs`
    );
    const pairsData = await pairsResponse.json();
    
    const existingDenoms = pairsData.token_pairs.map(p => p.denom);
    pairsData.token_pairs.forEach(pair => {
      console.log(`- ${pair.denom} -> ${pair.erc20_address}`);
    });
    
    // Check if IBC tokens are already registered
    const ibcDenoms = [
      'ibc/13B2C536BB057AC79D5616B8EA1B9540EC1F2170718CAFF6F0083C966FFFED0B',
      'ibc/65D0BEC6DAD96C7F5043D1E54E54B6BB5D5B3AEC3FF6CEBB75B9E059F3580EA3'
    ];
    
    const unregistered = ibcDenoms.filter(d => !existingDenoms.includes(d));
    
    if (unregistered.length === 0) {
      console.log('\n✓ All IBC tokens are already registered!');
      return;
    }
    
    console.log(`\nFound ${unregistered.length} unregistered IBC tokens`);
    
    // Get account info
    const accountInfo = await getAccountInfo(fromAddress);
    
    // Create and send registration transaction
    const result = await createAndSendTransaction(
      fromAddress,
      accountInfo.sequence,
      accountInfo.accountNumber,
      config.blockchain.ids.cosmosChainId
    );
    
    if (result.tx_response && result.tx_response.txhash) {
      console.log(`\n✓ Transaction submitted: ${result.tx_response.txhash}`);
      console.log(`Check status: ${config.blockchain.endpoints.rest_endpoint}/cosmos/tx/v1beta1/txs/${result.tx_response.txhash}`);
      
      // Wait a bit and check if tokens were registered
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
        if (ibcDenoms.includes(pair.denom)) {
          console.log('  ✓ This is one of our IBC tokens!');
        }
      });
    }
    
  } catch (error) {
    console.error('\nError:', error.message);
    
    if (error.message.includes('invalid empty addresses')) {
      console.log('\nNote: The module might expect specific contract addresses.');
      console.log('For native coins, they might need to be auto-detected.');
      console.log('The faucet can still distribute these tokens as native coins.');
    }
  }
}

main().catch(console.error);
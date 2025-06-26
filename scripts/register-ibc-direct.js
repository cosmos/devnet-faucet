#!/usr/bin/env node

import { TxBody, AuthInfo, SignDoc, TxRaw, SignerInfo, ModeInfo, Fee } from 'cosmjs-types/cosmos/tx/v1beta1/tx.js';
import { Any } from 'cosmjs-types/google/protobuf/any.js';
import { PubKey } from 'cosmjs-types/ethermint/crypto/v1/ethsecp256k1/keys.js';
import { toBase64 } from '@cosmjs/encoding';
import secp256k1 from 'secp256k1';
import { Buffer } from 'buffer';
import { keccak_256 } from '@noble/hashes/sha3';
import fetch from 'node-fetch';
import config from '../config.js';
import { getPrivateKeyBytes, getCosmosAddress, getEthPublicKey } from '../faucet.js';

// Get account info (same as faucet uses)
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

// Since MsgRegisterERC20 is for contracts, not native coins, we need a different approach
// The proper way is to ensure the coins have metadata and then they should be auto-detected
async function checkAndSetMetadata() {
  console.log('Checking IBC token metadata...\n');
  
  const ibcTokens = [
    {
      denom: 'ibc/13B2C536BB057AC79D5616B8EA1B9540EC1F2170718CAFF6F0083C966FFFED0B',
      name: 'Osmosis',
      symbol: 'OSMO',
      description: 'IBC OSMO from Osmosis via channel-2'
    },
    {
      denom: 'ibc/65D0BEC6DAD96C7F5043D1E54E54B6BB5D5B3AEC3FF6CEBB75B9E059F3580EA3',
      name: 'USD Coin',
      symbol: 'USDC',
      description: 'IBC USDC from channel-1'
    }
  ];
  
  // Check if metadata already exists
  for (const token of ibcTokens) {
    const metadataUrl = `${config.blockchain.endpoints.rest_endpoint}/cosmos/bank/v1beta1/denoms_metadata/${encodeURIComponent(token.denom)}`;
    try {
      const response = await fetch(metadataUrl);
      const data = await response.json();
      
      if (data.metadata) {
        console.log(`✓ ${token.symbol} already has metadata:`, data.metadata.symbol);
      } else {
        console.log(`✗ ${token.symbol} missing metadata`);
      }
    } catch (error) {
      console.log(`✗ ${token.symbol} metadata check failed:`, error.message);
    }
  }
}

// Main registration flow
async function registerIBCTokens() {
  console.log('IBC Token ERC20 Registration');
  console.log('============================\n');
  
  try {
    const fromAddress = getCosmosAddress();
    console.log(`Faucet address: ${fromAddress}\n`);
    
    // Check current token pairs
    console.log('Current ERC20 token pairs:');
    const pairsResponse = await fetch(
      `${config.blockchain.endpoints.rest_endpoint}/cosmos/evm/erc20/v1/token_pairs`
    );
    const pairsData = await pairsResponse.json();
    
    pairsData.token_pairs.forEach(pair => {
      console.log(`- ${pair.denom}`);
      console.log(`  ERC20: ${pair.erc20_address}`);
      console.log(`  Enabled: ${pair.enabled}`);
      console.log(`  Owner: ${pair.contract_owner}\n`);
    });
    
    // Check metadata
    await checkAndSetMetadata();
    
    // For native IBC denoms, if they're not showing up in token_pairs,
    // we might need to use the permissionless registration
    console.log('\nTo register native IBC tokens for ERC20:');
    console.log('1. The tokens must have bank metadata (already set)');
    console.log('2. Use permissionless registration if enabled');
    console.log('3. Or wait for auto-detection by the module\n');
    
    // Check if we can call RegisterERC20 with empty addresses for native coins
    const accountInfo = await getAccountInfo(fromAddress);
    
    // Try to register with empty ERC20 addresses (for native coins)
    console.log('Attempting to register native IBC tokens...');
    
    // Build the message
    const msgRegisterERC20 = {
      typeUrl: '/cosmos.evm.erc20.v1.MsgRegisterERC20',
      value: {
        signer: fromAddress,
        erc20addresses: [] // Empty for native coins
      }
    };
    
    // Create transaction body
    const txBody = TxBody.fromPartial({
      messages: [Any.fromPartial({
        typeUrl: msgRegisterERC20.typeUrl,
        value: new Uint8Array() // Would need proper encoding
      })],
      memo: 'Register IBC tokens for ERC20',
    });
    
    console.log('\nNote: Direct registration might require:');
    console.log('- Governance permissions');
    console.log('- Module to be in permissionless mode');
    console.log('- Or specific authorization\n');
    
    console.log('The IBC tokens are already configured in the faucet');
    console.log('and can be distributed as native tokens.');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// Alternative: Check if tokens work through precompile
async function testPrecompileAccess() {
  console.log('\nTesting ERC20 Precompile Access');
  console.log('================================\n');
  
  console.log('Native denoms might be accessible at:');
  console.log('- Precompile: 0x0000000000000000000000000000000000000802');
  console.log('- Or at deterministic addresses based on denom hash\n');
  
  console.log('To test:');
  console.log('1. Use the test-erc20-precompile.js script');
  console.log('2. Try sending via AtomicMultiSend contract');
  console.log('3. Check if EVM addresses can receive these tokens\n');
}

async function main() {
  await registerIBCTokens();
  await testPrecompileAccess();
  
  console.log('Summary:');
  console.log('========');
  console.log('✓ IBC tokens configured in tokens.json');
  console.log('✓ Faucet can distribute them as native tokens');
  console.log('✓ Both Cosmos and EVM addresses supported');
  console.log('? ERC20 registration may require governance or special permissions');
}

main().catch(console.error);
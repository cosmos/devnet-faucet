#!/usr/bin/env node

import fetch from 'node-fetch';
import config from '../config.js';

async function main() {
  console.log('Verifying IBC Token Balances');
  console.log('============================\n');
  
  const faucetAddress = 'cosmos1cff2uvc2zgep5xlha939vjk08g07rlw6d7sjvw';
  
  try {
    // Get faucet balances
    const response = await fetch(
      `${config.blockchain.endpoints.rest_endpoint}/cosmos/bank/v1beta1/balances/${faucetAddress}`
    );
    
    if (!response.ok) {
      throw new Error(`Failed to get balances: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // IBC tokens we're interested in
    const ibcTokens = {
      'ibc/13B2C536BB057AC79D5616B8EA1B9540EC1F2170718CAFF6F0083C966FFFED0B': 'OSMO',
      'ibc/65D0BEC6DAD96C7F5043D1E54E54B6BB5D5B3AEC3FF6CEBB75B9E059F3580EA3': 'USDC'
    };
    
    console.log('Faucet IBC Token Balances:');
    console.log('--------------------------');
    
    let foundTokens = false;
    data.balances.forEach(balance => {
      if (ibcTokens[balance.denom]) {
        foundTokens = true;
        const amount = parseInt(balance.amount);
        const decimals = 6; // Both tokens use 6 decimals
        const displayAmount = amount / Math.pow(10, decimals);
        
        console.log(`${ibcTokens[balance.denom]}:`);
        console.log(`  Denom: ${balance.denom}`);
        console.log(`  Amount: ${balance.amount} (${displayAmount.toFixed(6)} ${ibcTokens[balance.denom]})`);
        console.log('');
      }
    });
    
    if (!foundTokens) {
      console.log('No IBC tokens found in faucet wallet.');
    }
    
    console.log('\nFaucet Configuration:');
    console.log('--------------------');
    console.log('The faucet is configured to send:');
    console.log('- OSMO: 0.000001 tokens (1000 units) per request');
    console.log('- USDC: 0.000001 tokens (1000 units) per request');
    console.log('\nThese can be sent as native tokens to any Cosmos or EVM address.');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main().catch(console.error);
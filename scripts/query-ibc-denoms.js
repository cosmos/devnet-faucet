#!/usr/bin/env node

import fetch from 'node-fetch';
import { parseArgs } from 'util';

// Parse command line arguments
const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: {
    'lcd-url': { type: 'string', default: 'https://devnet-1-lcd.ib.skip.build' },
    'help': { type: 'boolean', default: false }
  }
});

if (args.help) {
  console.log(`
Usage: node query-ibc-denoms.js [options]

Options:
  --lcd-url     LCD endpoint URL (default: https://devnet-1-lcd.ib.skip.build)
  --help        Show this help message

This script queries the IBC transfer module to get token metadata.
`);
  process.exit(0);
}

const LCD_URL = args['lcd-url'];

// IBC denoms from the faucet wallet
const IBC_DENOMS = [
  'ibc/13B2C536BB057AC79D5616B8EA1B9540EC1F2170718CAFF6F0083C966FFFED0B',
  'ibc/65D0BEC6DAD96C7F5043D1E54E54B6BB5D5B3AEC3FF6CEBB75B9E059F3580EA3'
];

async function queryDenomTrace(hash) {
  try {
    const url = `${LCD_URL}/ibc/apps/transfer/v1/denom_traces/${hash}`;
    console.log(`Querying: ${url}`);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data.denom_trace;
  } catch (error) {
    console.error(`Failed to query denom trace for ${hash}:`, error.message);
    return null;
  }
}

async function queryDenomMetadata(denom) {
  try {
    const url = `${LCD_URL}/cosmos/bank/v1beta1/denoms_metadata/${encodeURIComponent(denom)}`;
    console.log(`Querying metadata: ${url}`);
    
    const response = await fetch(url);
    if (!response.ok) {
      // Metadata might not exist for all denoms
      return null;
    }
    
    const data = await response.json();
    return data.metadata;
  } catch (error) {
    return null;
  }
}

async function main() {
  console.log('Querying IBC Token Information');
  console.log('===============================\n');
  
  const tokenInfo = [];
  
  for (const denom of IBC_DENOMS) {
    console.log(`\nProcessing: ${denom}`);
    
    // Extract hash from IBC denom
    const hash = denom.replace('ibc/', '');
    
    // Query denom trace
    const trace = await queryDenomTrace(hash);
    if (trace) {
      console.log('Denom Trace:', JSON.stringify(trace, null, 2));
      
      // Query metadata for base denom
      const metadata = await queryDenomMetadata(denom);
      if (metadata) {
        console.log('Metadata:', JSON.stringify(metadata, null, 2));
      }
      
      // Determine token name and symbol
      let name, symbol, decimals;
      
      if (metadata) {
        name = metadata.name || metadata.display || trace.base_denom;
        symbol = metadata.symbol || metadata.display || trace.base_denom.replace(/^u/, '').toUpperCase();
        decimals = metadata.denom_units?.find(u => u.denom === metadata.display)?.exponent || 6;
      } else {
        // Fallback: derive from base denom
        const baseDenom = trace.base_denom;
        if (baseDenom.startsWith('u')) {
          symbol = baseDenom.substring(1).toUpperCase();
          name = symbol;
        } else {
          symbol = baseDenom.toUpperCase();
          name = baseDenom;
        }
        decimals = 6; // Standard cosmos decimals
      }
      
      tokenInfo.push({
        denom,
        hash,
        name,
        symbol,
        decimals,
        base_denom: trace.base_denom,
        path: trace.path,
        channels: trace.path ? trace.path.split('/').filter((_, i) => i % 2 === 1) : []
      });
    }
  }
  
  console.log('\n\nToken Configuration Summary:');
  console.log('============================\n');
  
  tokenInfo.forEach((token, index) => {
    console.log(`${index + 1}. ${token.name} (${token.symbol})`);
    console.log(`   IBC Denom: ${token.denom}`);
    console.log(`   Base Denom: ${token.base_denom}`);
    console.log(`   Decimals: ${token.decimals}`);
    console.log(`   IBC Path: ${token.path || 'N/A'}`);
    console.log(`   Channels: ${token.channels.join(' -> ') || 'N/A'}\n`);
  });
  
  // Generate configuration update
  console.log('\nGenerated Token Configuration:');
  console.log('==============================\n');
  console.log(JSON.stringify(tokenInfo, null, 2));
}

main().catch(console.error);
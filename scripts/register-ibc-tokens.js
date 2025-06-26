#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { parseArgs } from 'util';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// IBC Token Configurations based on actual chain metadata
const IBC_TOKENS = [
  {
    denom: 'ibc/13B2C536BB057AC79D5616B8EA1B9540EC1F2170718CAFF6F0083C966FFFED0B',
    name: 'Osmosis',
    symbol: 'OSMO',
    decimals: 6,
    description: 'IBC OSMO from Osmosis via channel-2',
    faucetAmount: '1000', // 0.001 OSMO (very small test amount)
    category: 'ibc',
    source: {
      base_denom: 'uosmo',
      channel: 'channel-2',
      chain: 'Osmosis'
    }
  },
  {
    denom: 'ibc/65D0BEC6DAD96C7F5043D1E54E54B6BB5D5B3AEC3FF6CEBB75B9E059F3580EA3',
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 6,
    description: 'IBC USDC from channel-1',
    faucetAmount: '1000', // 0.001 USDC (very small test amount)
    category: 'ibc',
    source: {
      base_denom: 'uusdc',
      channel: 'channel-1',
      chain: 'Unknown' // Could be Noble or another USDC-issuing chain
    }
  }
];

// Parse command line arguments
const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: {
    'update-config': { type: 'boolean', default: false },
    'generate-commands': { type: 'boolean', default: false },
    'help': { type: 'boolean', default: false }
  }
});

if (args.help) {
  console.log(`
Usage: node register-ibc-tokens.js [options]

Options:
  --update-config     Update tokens.json with IBC token configurations
  --generate-commands Generate CLI commands for registering IBC tokens
  --help              Show this help message

Examples:
  # Update configuration
  node register-ibc-tokens.js --update-config

  # Generate registration commands
  node register-ibc-tokens.js --generate-commands
`);
  process.exit(0);
}

// Load config
const configPath = path.join(__dirname, '..', 'config.js');
const config = await import(configPath).then(m => m.default);

function generateRegistrationCommands() {
  console.log('IBC Token Registration Commands\n');
  console.log('================================\n');
  
  console.log('IMPORTANT: IBC tokens need to be registered with the ERC20 module to enable EVM support.\n');
  
  console.log('Current Status:');
  console.log('- Only uatom is registered in the ERC20 module');
  console.log('- IBC tokens exist as native Cosmos SDK tokens but lack EVM support\n');
  
  console.log('To register IBC tokens for ERC20 representation:\n');
  
  console.log('1. Submit a governance proposal to register the IBC denoms:');
  console.log('```bash');
  console.log('# Create proposal JSON file');
  console.log('cat > register-ibc-tokens.json << EOF');
  console.log('{');
  console.log('  "messages": [');
  console.log('    {');
  console.log('      "@type": "/cosmos.evm.erc20.v1.MsgRegisterERC20",');
  console.log('      "signer": "cosmos1...", // governance module address');
  console.log('      "erc20addresses": []');
  console.log('    }');
  console.log('  ],');
  console.log('  "metadata": "Register IBC tokens for ERC20 support",');
  console.log('  "deposit": "10000000uatom",');
  console.log('  "title": "Register IBC OSMO and USDC tokens",');
  console.log('  "summary": "Enable ERC20 representation for IBC OSMO and USDC tokens"');
  console.log('}');
  console.log('EOF\n');
  
  console.log('# Submit the proposal');
  console.log('cosmosd tx gov submit-proposal register-ibc-tokens.json \\');
  console.log('  --from wallet \\');
  console.log('  --chain-id cosmos-devnet-1 \\');
  console.log('  --gas auto \\');
  console.log('  --gas-adjustment 1.5\n');
  console.log('```\n');
  
  console.log('2. For native denoms (like IBC tokens), they should be automatically');
  console.log('   available through the ERC20 precompile once registered.\n');
  
  console.log('3. After registration, verify token pairs:');
  console.log('```bash');
  console.log('# Query all registered token pairs');
  console.log('curl https://devnet-1-lcd.ib.skip.build/cosmos/evm/erc20/v1/token_pairs');
  console.log('```\n');
  
  IBC_TOKENS.forEach((token, index) => {
    console.log(`\n${index + 1}. ${token.name} (${token.symbol}):`);
    console.log(`   Denom: ${token.denom}`);
    console.log(`   Base: ${token.source.base_denom} from ${token.source.channel}`);
  });
}

async function updateTokensConfig() {
  console.log('Updating tokens.json configuration...\n');
  
  const tokensPath = path.join(__dirname, '..', 'tokens.json');
  const tokensConfig = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
  
  // Add IBC category if not exists
  if (!tokensConfig.categories.ibc) {
    tokensConfig.categories.ibc = {
      name: 'IBC Token',
      description: 'Inter-Blockchain Communication bridged tokens',
      icon: '',
      color: '#e67e22'
    };
  }
  
  // Add IBC tokens as native tokens
  IBC_TOKENS.forEach(ibcToken => {
    const tokenConfig = {
      id: `${ibcToken.symbol.toLowerCase()}-cosmos-native`,
      name: ibcToken.name,
      symbol: ibcToken.symbol,
      denom: ibcToken.denom,
      decimals: ibcToken.decimals,
      type: 'native',
      category: 'ibc',
      tags: ['ibc', 'bridged', 'cross-chain', 'native'],
      description: ibcToken.description,
      logoUri: '',
      website: '',
      coingeckoId: '',
      faucet: {
        enabled: true,
        configuration: {
          amountPerRequest: ibcToken.faucetAmount,
          targetBalance: ibcToken.faucetAmount,
          maxRequestsPerDay: 1,
          cooldownPeriod: '24h',
          eligibility: {
            addressTypes: ['cosmos', 'evm'],
            minimumBalance: null,
            maximumBalance: null,
            blacklist: [],
            whitelist: null
          }
        },
        analytics: {
          totalDistributed: '0',
          uniqueRecipients: 0,
          averageRequest: ibcToken.faucetAmount,
          lastDistribution: null
        }
      },
      integration: {
        evmWrapped: {
          enabled: true,
          precompileAddress: '0x0000000000000000000000000000000000000802',
          wrapperContract: null,
          note: 'Uses ERC20 precompile for EVM compatibility'
        }
      },
      metadata: {
        status: 'active',
        deprecated: false,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      }
    };
    
    // Check if token already exists in native tokens
    const existingIndex = tokensConfig.nativeTokens.findIndex(t => t.denom === tokenConfig.denom);
    if (existingIndex >= 0) {
      tokensConfig.nativeTokens[existingIndex] = tokenConfig;
      console.log(`  ✓ Updated ${tokenConfig.symbol}`);
    } else {
      tokensConfig.nativeTokens.push(tokenConfig);
      console.log(`  ✓ Added ${tokenConfig.symbol}`);
    }
  });
  
  // Update metadata
  tokensConfig.meta.updatedAt = new Date().toISOString();
  
  // Save updated configuration
  fs.writeFileSync(tokensPath, JSON.stringify(tokensConfig, null, 2));
  console.log('\n✓ tokens.json updated successfully');
}

async function main() {
  try {
    if (!args['update-config'] && !args['generate-commands']) {
      console.error('Please specify at least one action: --update-config or --generate-commands');
      process.exit(1);
    }
    
    if (args['generate-commands']) {
      generateRegistrationCommands();
    }
    
    if (args['update-config']) {
      await updateTokensConfig();
    }
    
    console.log('\nDone!');
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run main
main();
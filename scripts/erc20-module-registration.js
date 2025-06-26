#!/usr/bin/env node

import { parseArgs } from 'util';

// Parse command line arguments
const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: {
    'generate-proposal': { type: 'boolean', default: false },
    'check-status': { type: 'boolean', default: false },
    'help': { type: 'boolean', default: false }
  }
});

if (args.help) {
  console.log(`
Usage: node erc20-module-registration.js [options]

Options:
  --generate-proposal  Generate governance proposal for IBC token registration
  --check-status       Check current ERC20 module registration status
  --help               Show this help message

This script helps with registering IBC tokens in the ERC20 module.
`);
  process.exit(0);
}

const IBC_TOKENS = [
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

function generateProposal() {
  console.log('ERC20 Module Registration - Governance Proposal');
  console.log('==============================================\n');
  
  console.log('IMPORTANT: Native denoms (like IBC tokens) require governance proposal');
  console.log('to enable ERC20 representation through the precompile.\n');
  
  console.log('Step 1: Create proposal file');
  console.log('-----------------------------');
  console.log('cat > register-ibc-tokens-proposal.json << EOF');
  console.log(JSON.stringify({
    messages: [
      {
        "@type": "/cosmos.gov.v1.MsgSubmitProposal",
        messages: [
          {
            "@type": "/cosmos.evm.erc20.v1.MsgRegisterCoin",
            authority: "cosmos10d07y265gmmuvt4z0w9aw880jnsr700j6zn9kn", // gov module address
            metadata: [
              {
                description: "IBC token from transfer/channel-2/uosmo",
                denom_units: [
                  {
                    denom: "uosmo",
                    exponent: 0,
                    aliases: []
                  }
                ],
                base: "ibc/13B2C536BB057AC79D5616B8EA1B9540EC1F2170718CAFF6F0083C966FFFED0B",
                display: "osmo",
                name: "Osmosis",
                symbol: "OSMO"
              },
              {
                description: "IBC token from transfer/channel-1/uusdc",
                denom_units: [
                  {
                    denom: "uusdc",
                    exponent: 0,
                    aliases: []
                  }
                ],
                base: "ibc/65D0BEC6DAD96C7F5043D1E54E54B6BB5D5B3AEC3FF6CEBB75B9E059F3580EA3",
                display: "usdc",
                name: "USD Coin",
                symbol: "USDC"
              }
            ]
          }
        ],
        initial_deposit: [
          {
            denom: "uatom",
            amount: "10000000"
          }
        ],
        proposer: "YOUR_COSMOS_ADDRESS",
        metadata: "Register IBC OSMO and USDC tokens for ERC20 precompile support",
        title: "Enable ERC20 Support for IBC Tokens",
        summary: "This proposal registers IBC OSMO and USDC tokens to enable ERC20 representation through the precompile, allowing these tokens to be used in EVM contracts."
      }
    ]
  }, null, 2));
  console.log('EOF\n');
  
  console.log('Step 2: Submit the proposal');
  console.log('---------------------------');
  console.log('cosmosd tx gov submit-proposal register-ibc-tokens-proposal.json \\');
  console.log('  --from YOUR_WALLET \\');
  console.log('  --chain-id cosmos-devnet-1 \\');
  console.log('  --gas auto \\');
  console.log('  --gas-adjustment 1.5 \\');
  console.log('  --fees 5000uatom\n');
  
  console.log('Step 3: Vote on the proposal');
  console.log('----------------------------');
  console.log('# Replace PROPOSAL_ID with the actual proposal ID');
  console.log('cosmosd tx gov vote PROPOSAL_ID yes \\');
  console.log('  --from YOUR_WALLET \\');
  console.log('  --chain-id cosmos-devnet-1 \\');
  console.log('  --gas auto\n');
  
  console.log('Step 4: After proposal passes, enable conversion');
  console.log('------------------------------------------------');
  IBC_TOKENS.forEach(token => {
    console.log(`# Enable conversion for ${token.symbol}`);
    console.log(`cosmosd tx erc20 toggle-conversion ${token.denom} \\`);
    console.log('  --from YOUR_WALLET \\');
    console.log('  --chain-id cosmos-devnet-1 \\');
    console.log('  --gas auto\n');
  });
}

function checkStatus() {
  console.log('ERC20 Module Registration Status');
  console.log('================================\n');
  
  console.log('Check registered token pairs:');
  console.log('curl https://devnet-1-lcd.ib.skip.build/cosmos/evm/erc20/v1/token_pairs\n');
  
  console.log('Check if specific IBC tokens are registered:');
  IBC_TOKENS.forEach(token => {
    console.log(`\n${token.symbol} (${token.name}):`);
    console.log(`Denom: ${token.denom}`);
    console.log(`curl "https://devnet-1-lcd.ib.skip.build/cosmos/evm/erc20/v1/token_pairs?pagination.key=${encodeURIComponent(token.denom)}"`);
  });
  
  console.log('\n\nExpected result after registration:');
  console.log('- Each IBC token should have a token_pair entry');
  console.log('- contract_owner should be "OWNER_MODULE"');
  console.log('- enabled should be true');
  console.log('- erc20_address will be the precompile address or a deployed contract\n');
  
  console.log('Test token functionality:');
  console.log('1. Request tokens from faucet (native Cosmos)');
  console.log('2. Use EVM to interact with tokens through precompile');
  console.log('3. Convert between native and ERC20 representations\n');
}

// Main execution
if (args['generate-proposal']) {
  generateProposal();
} else if (args['check-status']) {
  checkStatus();
} else {
  console.log('IBC Token ERC20 Registration Information');
  console.log('========================================\n');
  
  console.log('Current Configuration:');
  console.log('---------------------');
  IBC_TOKENS.forEach((token, index) => {
    console.log(`${index + 1}. ${token.name} (${token.symbol})`);
    console.log(`   Denom: ${token.denom}`);
    console.log(`   Faucet Amount: 0.000001 ${token.symbol} (1000 units)`);
    console.log(`   Description: ${token.description}\n`);
  });
  
  console.log('Next Steps:');
  console.log('-----------');
  console.log('1. Generate governance proposal: node erc20-module-registration.js --generate-proposal');
  console.log('2. Submit and vote on the proposal');
  console.log('3. Check registration status: node erc20-module-registration.js --check-status');
  console.log('4. Test with small amounts from the faucet\n');
  
  console.log('Safety Notes:');
  console.log('-------------');
  console.log('- Faucet amounts are set to very small values (0.000001 tokens)');
  console.log('- Test thoroughly before increasing amounts');
  console.log('- Monitor the ERC20 module behavior with IBC tokens');
  console.log('- Ensure precompile correctly handles the token conversions\n');
}
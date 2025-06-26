#!/usr/bin/env node

import { parseArgs } from 'util';
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { SigningStargateClient } from '@cosmjs/stargate';
import { MsgRegisterERC20 } from '@evmos/proto';
import config from '../config.js';

// Parse command line arguments
const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: {
    'register': { type: 'boolean', default: false },
    'check-status': { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    'help': { type: 'boolean', default: false }
  }
});

if (args.help) {
  console.log(`
Usage: node register-ibc-tokens-direct.js [options]

Options:
  --register      Register IBC tokens with ERC20 module
  --check-status  Check current registration status
  --dry-run       Show what would be done without executing
  --help          Show this help message

This script directly registers IBC tokens with the ERC20 module using the faucet wallet.
`);
  process.exit(0);
}

const IBC_DENOMS = [
  'ibc/13B2C536BB057AC79D5616B8EA1B9540EC1F2170718CAFF6F0083C966FFFED0B', // OSMO
  'ibc/65D0BEC6DAD96C7F5043D1E54E54B6BB5D5B3AEC3FF6CEBB75B9E059F3580EA3'  // USDC
];

async function checkRegistrationStatus() {
  console.log('Checking ERC20 Module Registration Status...\n');
  
  try {
    const response = await fetch(`${config.blockchain.endpoints.rest_endpoint}/cosmos/evm/erc20/v1/token_pairs`);
    const data = await response.json();
    
    console.log('Currently registered token pairs:');
    console.log('--------------------------------');
    data.token_pairs.forEach(pair => {
      console.log(`Denom: ${pair.denom}`);
      console.log(`ERC20: ${pair.erc20_address}`);
      console.log(`Enabled: ${pair.enabled}`);
      console.log(`Owner: ${pair.contract_owner}\n`);
    });
    
    // Check if our IBC tokens are registered
    const registeredDenoms = data.token_pairs.map(p => p.denom);
    IBC_DENOMS.forEach(denom => {
      const isRegistered = registeredDenoms.includes(denom);
      console.log(`${denom}: ${isRegistered ? '✓ Registered' : '✗ Not registered'}`);
    });
    
  } catch (error) {
    console.error('Failed to check status:', error.message);
  }
}

async function registerTokens(dryRun = false) {
  console.log(`${dryRun ? '[DRY RUN] ' : ''}Registering IBC tokens with ERC20 module...\n`);
  
  if (dryRun) {
    console.log('Would register the following denoms:');
    IBC_DENOMS.forEach(denom => console.log(`- ${denom}`));
    console.log('\nTo actually register, run without --dry-run flag');
    return;
  }
  
  try {
    // Initialize wallet from mnemonic
    const mnemonic = process.env.FAUCET_MNEMONIC;
    if (!mnemonic) {
      throw new Error('FAUCET_MNEMONIC environment variable not set');
    }
    
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
      prefix: config.blockchain.sender.option.prefix
    });
    
    const [account] = await wallet.getAccounts();
    console.log(`Using account: ${account.address}\n`);
    
    // Connect to the chain
    const client = await SigningStargateClient.connectWithSigner(
      config.blockchain.endpoints.rpc_endpoint,
      wallet,
      {
        gasPrice: {
          amount: '250',
          denom: 'uatom'
        }
      }
    );
    
    // Create the registration message
    const msg = {
      typeUrl: '/cosmos.evm.erc20.v1.MsgRegisterERC20',
      value: {
        signer: account.address,
        erc20addresses: [] // Empty for native denoms
      }
    };
    
    console.log('Sending registration transaction...');
    const result = await client.signAndBroadcast(
      account.address,
      [msg],
      'auto',
      'Register IBC tokens for ERC20 support'
    );
    
    if (result.code === 0) {
      console.log('✓ Transaction successful!');
      console.log(`Transaction hash: ${result.transactionHash}`);
      console.log(`Gas used: ${result.gasUsed}`);
    } else {
      console.error('✗ Transaction failed:', result.rawLog);
    }
    
  } catch (error) {
    console.error('Registration failed:', error.message);
  }
}

// For native denoms, we need a different approach
async function showManualCommands() {
  console.log('Manual Registration Commands');
  console.log('============================\n');
  
  console.log('Since these are native IBC denoms (not ERC20 contracts),');
  console.log('they should already be available through the ERC20 precompile.\n');
  
  console.log('To verify precompile access, you can:');
  console.log('1. Call the precompile at 0x0000000000000000000000000000000000000802');
  console.log('2. Use the denom as the token identifier\n');
  
  console.log('If manual registration is needed, use these commands:\n');
  
  IBC_DENOMS.forEach((denom, index) => {
    const tokenName = index === 0 ? 'OSMO' : 'USDC';
    console.log(`# Register ${tokenName}`);
    console.log(`cosmosd tx erc20 register-coin ${denom} \\`);
    console.log(`  --from faucet \\`);
    console.log(`  --chain-id ${config.blockchain.ids.cosmosChainId} \\`);
    console.log(`  --gas auto \\`);
    console.log(`  --gas-adjustment 1.5 \\`);
    console.log(`  --fees 5000uatom\n`);
  });
  
  console.log('After registration, enable conversion:');
  IBC_DENOMS.forEach((denom, index) => {
    const tokenName = index === 0 ? 'OSMO' : 'USDC';
    console.log(`# Enable ${tokenName} conversion`);
    console.log(`cosmosd tx erc20 toggle-conversion ${denom} --from faucet`);
  });
}

// Main execution
async function main() {
  if (args['check-status']) {
    await checkRegistrationStatus();
  } else if (args.register) {
    await registerTokens(args['dry-run']);
  } else {
    console.log('IBC Token Direct Registration');
    console.log('=============================\n');
    
    console.log('This tool registers IBC tokens directly with the ERC20 module.\n');
    
    console.log('Tokens to register:');
    console.log('- OSMO: ibc/13B2C536BB057AC79D5616B8EA1B9540EC1F2170718CAFF6F0083C966FFFED0B');
    console.log('- USDC: ibc/65D0BEC6DAD96C7F5043D1E54E54B6BB5D5B3AEC3FF6CEBB75B9E059F3580EA3\n');
    
    console.log('Options:');
    console.log('- Check status: node register-ibc-tokens-direct.js --check-status');
    console.log('- Register tokens: node register-ibc-tokens-direct.js --register');
    console.log('- Dry run: node register-ibc-tokens-direct.js --register --dry-run\n');
    
    await showManualCommands();
  }
}

main().catch(console.error);
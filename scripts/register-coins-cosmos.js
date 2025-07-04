#!/usr/bin/env node

import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { SigningStargateClient } from '@cosmjs/stargate';
import { stringToPath } from '@cosmjs/crypto';
import config from '../config.js';
import secureKeyManager from '../src/SecureKeyManager.js';

async function main() {
  console.log('Registering IBC Tokens for ERC20 Support');
  console.log('========================================\n');
  
  try {
    // Initialize secure key manager
    await secureKeyManager.initialize();
    const mnemonic = await secureKeyManager.getMnemonic();
    
    // Create wallet
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
      hdPaths: [stringToPath("m/44'/60'/0'/0/0")],
      prefix: config.blockchain.sender.option.prefix
    });
    
    const [account] = await wallet.getAccounts();
    console.log(`Using account: ${account.address}\n`);
    
    // Connect to chain
    const client = await SigningStargateClient.connectWithSigner(
      config.blockchain.endpoints.rpc_endpoint,
      wallet,
      {
        gasPrice: { amount: '250', denom: 'uatom' }
      }
    );
    
    // The IBC tokens should already have metadata from the IBC module
    // Let's check if we can query them
    console.log('Checking IBC token metadata...\n');
    
    const denoms = [
      'ibc/13B2C536BB057AC79D5616B8EA1B9540EC1F2170718CAFF6F0083C966FFFED0B',
      'ibc/65D0BEC6DAD96C7F5043D1E54E54B6BB5D5B3AEC3FF6CEBB75B9E059F3580EA3'
    ];
    
    for (const denom of denoms) {
      try {
        const response = await fetch(
          `${config.blockchain.endpoints.rest_endpoint}/cosmos/bank/v1beta1/denoms_metadata/${encodeURIComponent(denom)}`
        );
        const data = await response.json();
        
        if (data.metadata) {
          console.log(`Found metadata for ${data.metadata.symbol || denom}:`);
          console.log(`- Name: ${data.metadata.name}`);
          console.log(`- Symbol: ${data.metadata.symbol}`);
          console.log(`- Description: ${data.metadata.description}\n`);
        }
      } catch (error) {
        console.log(`No metadata found for ${denom}\n`);
      }
    }
    
    // For native denoms with existing metadata, they should be automatically
    // available through the ERC20 module/precompile
    console.log('Native denoms with bank metadata should be accessible via:');
    console.log('1. ERC20 precompile at 0x0000000000000000000000000000000000000802');
    console.log('2. Or at deterministic addresses based on the denom\n');
    
    // The actual registration might need to be done differently
    // depending on the specific chain implementation
    console.log('To manually register (if needed), you would typically:');
    console.log('1. Use MsgRegisterCoin for native denoms');
    console.log('2. Use MsgRegisterERC20 for ERC20 contracts');
    console.log('3. Use MsgToggleConversion to enable/disable conversions\n');
    
    console.log('Since these are native IBC denoms, they might already be supported.');
    console.log('The faucet should be able to distribute them as native tokens.\n');
    
    // Check balances
    console.log('Checking faucet balances...');
    const balance = await client.getAllBalances(account.address);
    balance.forEach(coin => {
      console.log(`- ${coin.amount} ${coin.denom}`);
      
      // Check if it's one of our IBC tokens
      if (coin.denom === 'ibc/13B2C536BB057AC79D5616B8EA1B9540EC1F2170718CAFF6F0083C966FFFED0B') {
        console.log('  ^ This is OSMO');
      } else if (coin.denom === 'ibc/65D0BEC6DAD96C7F5043D1E54E54B6BB5D5B3AEC3FF6CEBB75B9E059F3580EA3') {
        console.log('  ^ This is USDC');
      }
    });
    
    await client.disconnect();
    
  } catch (error) {
    console.error('Error:', error);
  }
}

main().catch(console.error);
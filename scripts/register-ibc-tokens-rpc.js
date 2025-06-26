#!/usr/bin/env node

import { DirectSecp256k1HdWallet, Registry } from '@cosmjs/proto-signing';
import { SigningStargateClient, defaultRegistryTypes } from '@cosmjs/stargate';
import { Tendermint34Client } from '@cosmjs/tendermint-rpc';
import { stringToPath } from '@cosmjs/crypto';
import config from '../config.js';
import secureKeyManager from '../src/SecureKeyManager.js';

// Custom message types for ERC20 module
const erc20Types = {
  "/cosmos.evm.erc20.v1.MsgRegisterCoin": {
    aminoType: "cosmos-sdk/MsgRegisterCoin",
    toAmino: ({ metadata }) => ({
      metadata
    }),
    fromAmino: ({ metadata }) => ({
      metadata
    }),
  },
  "/cosmos.evm.erc20.v1.MsgToggleConversion": {
    aminoType: "cosmos-sdk/MsgToggleConversion",
    toAmino: ({ authority, token }) => ({
      authority,
      token
    }),
    fromAmino: ({ authority, token }) => ({
      authority,
      token
    }),
  }
};

// IBC tokens to register
const IBC_TOKENS = [
  {
    denom: 'ibc/13B2C536BB057AC79D5616B8EA1B9540EC1F2170718CAFF6F0083C966FFFED0B',
    name: 'Osmosis',
    symbol: 'OSMO',
    display: 'osmo',
    base_denom: 'uosmo',
    description: 'IBC OSMO from Osmosis via channel-2'
  },
  {
    denom: 'ibc/65D0BEC6DAD96C7F5043D1E54E54B6BB5D5B3AEC3FF6CEBB75B9E059F3580EA3',
    name: 'USD Coin',
    symbol: 'USDC',
    display: 'usdc',
    base_denom: 'uusdc',
    description: 'IBC USDC from channel-1'
  }
];

async function getWallet() {
  // Initialize secure key manager
  await secureKeyManager.initialize();
  const mnemonic = await secureKeyManager.getMnemonic();
  
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
    hdPaths: [stringToPath("m/44'/60'/0'/0/0")],
    prefix: config.blockchain.sender.option.prefix
  });
  
  return wallet;
}

async function checkTokenPairs() {
  console.log('Checking current token pairs...\n');
  
  try {
    const response = await fetch(`${config.blockchain.endpoints.rest_endpoint}/cosmos/evm/erc20/v1/token_pairs`);
    const data = await response.json();
    
    console.log('Registered token pairs:');
    data.token_pairs.forEach(pair => {
      console.log(`- ${pair.denom}`);
      console.log(`  ERC20: ${pair.erc20_address}`);
      console.log(`  Enabled: ${pair.enabled}`);
      console.log(`  Owner: ${pair.contract_owner}\n`);
    });
    
    return data.token_pairs;
  } catch (error) {
    console.error('Failed to check token pairs:', error.message);
    return [];
  }
}

async function registerIBCTokens() {
  console.log('Registering IBC tokens via RPC...\n');
  
  try {
    // Get wallet
    const wallet = await getWallet();
    const [account] = await wallet.getAccounts();
    console.log(`Using faucet account: ${account.address}\n`);
    
    // Create custom registry with ERC20 types
    const registry = new Registry([
      ...defaultRegistryTypes,
    ]);
    
    // Connect to chain
    const tmClient = await Tendermint34Client.connect(config.blockchain.endpoints.rpc_endpoint);
    const client = await SigningStargateClient.createWithSigner(
      tmClient,
      wallet,
      {
        registry,
        gasPrice: {
          amount: '250',
          denom: 'uatom'
        }
      }
    );
    
    // For native denoms, we need to create metadata and register them
    for (const token of IBC_TOKENS) {
      console.log(`Processing ${token.symbol}...`);
      
      // Create metadata for the IBC token
      const metadata = {
        description: token.description,
        denom_units: [
          {
            denom: token.denom,
            exponent: 0,
            aliases: []
          },
          {
            denom: token.display,
            exponent: 6,
            aliases: []
          }
        ],
        base: token.denom,
        display: token.display,
        name: token.name,
        symbol: token.symbol
      };
      
      // First, we need to set the denom metadata via bank module
      const setBankMetadataMsg = {
        typeUrl: '/cosmos.bank.v1beta1.MsgSetDenomMetadata',
        value: {
          sender: account.address,
          metadata
        }
      };
      
      try {
        console.log(`Setting bank metadata for ${token.symbol}...`);
        const metadataResult = await client.signAndBroadcast(
          account.address,
          [setBankMetadataMsg],
          'auto',
          `Set metadata for ${token.symbol}`
        );
        
        if (metadataResult.code === 0) {
          console.log(`✓ Metadata set successfully`);
          console.log(`  Tx: ${metadataResult.transactionHash}`);
        } else {
          console.log(`⚠ Metadata might already exist or failed: ${metadataResult.rawLog}`);
        }
      } catch (error) {
        console.log(`⚠ Metadata setting error (might already exist): ${error.message}`);
      }
      
      // Now register for ERC20
      // For native denoms, we typically don't use MsgRegisterERC20
      // Instead, the ERC20 module should auto-detect native denoms with metadata
      console.log(`Native denom ${token.denom} should now be accessible via ERC20 precompile\n`);
    }
    
    // Enable conversion for each token
    console.log('\nEnabling conversions...');
    for (const token of IBC_TOKENS) {
      const toggleMsg = {
        typeUrl: '/cosmos.evm.erc20.v1.MsgToggleConversion',
        value: {
          authority: account.address, // Must be gov module or authorized address
          token: token.denom
        }
      };
      
      try {
        console.log(`Enabling conversion for ${token.symbol}...`);
        const toggleResult = await client.signAndBroadcast(
          account.address,
          [toggleMsg],
          'auto',
          `Enable conversion for ${token.symbol}`
        );
        
        if (toggleResult.code === 0) {
          console.log(`✓ Conversion enabled`);
          console.log(`  Tx: ${toggleResult.transactionHash}`);
        } else {
          console.log(`✗ Failed: ${toggleResult.rawLog}`);
        }
      } catch (error) {
        console.log(`✗ Error: ${error.message}`);
        console.log('  Note: Toggle conversion might require governance permission');
      }
    }
    
    await client.disconnect();
    
  } catch (error) {
    console.error('Registration failed:', error);
    console.error('Stack:', error.stack);
  }
}

async function testPrecompileAccess() {
  console.log('\nTesting ERC20 precompile access...\n');
  
  console.log('The ERC20 precompile should automatically handle native denoms.');
  console.log('Precompile address: 0x0000000000000000000000000000000000000802\n');
  
  console.log('To test via EVM RPC:');
  console.log('1. Call balanceOf(address) with the denom as token identifier');
  console.log('2. Use standard ERC20 methods on the precompile\n');
  
  // We could add actual EVM RPC calls here to test
  const evmEndpoint = config.blockchain.endpoints.evm_endpoint;
  console.log(`EVM RPC endpoint: ${evmEndpoint}`);
}

async function main() {
  console.log('IBC Token ERC20 Registration (via RPC)');
  console.log('======================================\n');
  
  // Check current status
  const currentPairs = await checkTokenPairs();
  const registeredDenoms = currentPairs.map(p => p.denom);
  
  const needsRegistration = IBC_TOKENS.filter(t => !registeredDenoms.includes(t.denom));
  
  if (needsRegistration.length === 0) {
    console.log('All IBC tokens are already registered!');
    await testPrecompileAccess();
    return;
  }
  
  console.log(`Found ${needsRegistration.length} tokens that need registration:\n`);
  needsRegistration.forEach(t => console.log(`- ${t.symbol} (${t.denom})`));
  console.log('');
  
  // Register tokens
  await registerIBCTokens();
  
  // Check status again
  console.log('\nFinal status:');
  await checkTokenPairs();
  
  // Test precompile
  await testPrecompileAccess();
}

main().catch(console.error);
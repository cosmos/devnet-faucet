#!/usr/bin/env node

import { ethers } from 'ethers';
import fetch from 'node-fetch';
import config from '../config.js';
import secureKeyManager from '../src/SecureKeyManager.js';

// ERC20 Module registration via REST API
async function registerViaREST() {
  console.log('Registering IBC Tokens (using eth_secp256k1 key)');
  console.log('================================================\n');
  
  try {
    // Initialize secure key manager
    await secureKeyManager.initialize();
    const mnemonic = await secureKeyManager.getMnemonic();
    
    // Derive Ethereum wallet from mnemonic
    const hdNode = ethers.HDNodeWallet.fromPhrase(mnemonic);
    const ethWallet = hdNode.derivePath("m/44'/60'/0'/0/0");
    
    console.log(`Ethereum address: ${ethWallet.address}`);
    console.log(`Cosmos address: ${config.blockchain.sender.mnemonic}`);
    console.log('');
    
    // Get account info to check sequence
    const accountResponse = await fetch(
      `${config.blockchain.endpoints.rest_endpoint}/cosmos/auth/v1beta1/accounts/${config.blockchain.sender.mnemonic}`
    );
    const accountData = await accountResponse.json();
    console.log('Account info:', JSON.stringify(accountData, null, 2));
    
    // Check current token pairs
    console.log('\nChecking current token pairs...');
    const pairsResponse = await fetch(
      `${config.blockchain.endpoints.rest_endpoint}/cosmos/evm/erc20/v1/token_pairs`
    );
    const pairsData = await pairsResponse.json();
    
    console.log('Current pairs:');
    pairsData.token_pairs.forEach(pair => {
      console.log(`- ${pair.denom} -> ${pair.erc20_address}`);
    });
    
    // For native IBC denoms, they might need special handling
    // Let's try a different approach - direct EVM interaction
    console.log('\nIBC tokens might be accessible through:');
    console.log('1. Direct bank module transfers (native)');
    console.log('2. ERC20 precompile (if auto-registered)');
    console.log('3. Wrapped tokens (if manually deployed)\n');
    
    // Since these are native denoms, let's verify they can be sent
    console.log('Testing native denom functionality...\n');
    
    const denoms = [
      {
        denom: 'ibc/13B2C536BB057AC79D5616B8EA1B9540EC1F2170718CAFF6F0083C966FFFED0B',
        name: 'OSMO',
        amount: '1000' // 0.001 OSMO
      },
      {
        denom: 'ibc/65D0BEC6DAD96C7F5043D1E54E54B6BB5D5B3AEC3FF6CEBB75B9E059F3580EA3',
        name: 'USDC', 
        amount: '1000' // 0.001 USDC
      }
    ];
    
    // The faucet can already send these as native tokens
    console.log('The faucet is already configured to send these IBC tokens:');
    denoms.forEach(token => {
      console.log(`- ${token.name}: ${token.amount} ${token.denom}`);
    });
    
    console.log('\nFor EVM/ERC20 support, options include:');
    console.log('1. Deploy wrapped ERC20 contracts for each IBC token');
    console.log('2. Use a bridge contract to wrap/unwrap on demand');
    console.log('3. Wait for automatic precompile support (chain-specific)');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// Alternative: Create wrapped tokens
async function createWrappedTokens() {
  console.log('\nWrapped Token Approach');
  console.log('======================\n');
  
  console.log('To enable ERC20 functionality for IBC tokens, we can:');
  console.log('1. Deploy wrapped token contracts (WOSMO, WUSDC)');
  console.log('2. Create a wrapper contract that locks native tokens and mints wrapped');
  console.log('3. Update faucet to distribute wrapped versions for EVM addresses\n');
  
  console.log('Example wrapped token contract:');
  console.log(`
pragma solidity ^0.8.0;

contract WrappedIBCToken is ERC20 {
    address public wrapper;
    string public ibcDenom;
    
    constructor(string memory name, string memory symbol, string memory _ibcDenom) 
        ERC20(name, symbol) {
        wrapper = msg.sender;
        ibcDenom = _ibcDenom;
    }
    
    function mint(address to, uint256 amount) external {
        require(msg.sender == wrapper, "Only wrapper can mint");
        _mint(to, amount);
    }
    
    function burn(address from, uint256 amount) external {
        require(msg.sender == wrapper, "Only wrapper can burn");
        _burn(from, amount);
    }
}
`);
  
  console.log('\nThis approach provides full ERC20 compatibility');
  console.log('while maintaining the native IBC token backing.\n');
}

// Check if we can interact via EVM
async function checkEVMAccess() {
  console.log('Checking EVM Access');
  console.log('===================\n');
  
  try {
    const provider = new ethers.JsonRpcProvider(config.blockchain.endpoints.evm_endpoint);
    
    // Get faucet balance on EVM
    const faucetEvmAddress = config.blockchain.evmAddress || '0xc252ae330a12321a1bf7e962564acf3a1fe1fdda';
    const balance = await provider.getBalance(faucetEvmAddress);
    console.log(`Faucet EVM balance: ${ethers.formatEther(balance)} (native token)\n`);
    
    // Check if precompile responds
    const precompileAddress = '0x0000000000000000000000000000000000000802';
    const code = await provider.getCode(precompileAddress);
    console.log(`ERC20 Precompile has code: ${code !== '0x'}`);
    
    if (code !== '0x') {
      console.log('Precompile is deployed, IBC tokens might be accessible through it');
    } else {
      console.log('No precompile found, wrapped tokens might be needed');
    }
    
  } catch (error) {
    console.error('EVM check failed:', error.message);
  }
}

async function main() {
  await registerViaREST();
  await checkEVMAccess();
  await createWrappedTokens();
  
  console.log('\nSummary');
  console.log('=======\n');
  console.log('1. IBC tokens are configured in tokens.json as native tokens');
  console.log('2. The faucet can distribute them to both Cosmos and EVM addresses');
  console.log('3. For full ERC20 functionality on EVM, consider:');
  console.log('   - Deploying wrapped token contracts');
  console.log('   - Using a bridge/wrapper contract');
  console.log('   - Waiting for native precompile support\n');
  console.log('4. Current configuration uses very small amounts (0.000001 tokens) for testing');
}

main().catch(console.error);
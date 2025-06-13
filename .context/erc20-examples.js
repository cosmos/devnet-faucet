const { ERC20Client } = require('./erc20-client');

/**
 * Example usage of ERC20Client for token registration and conversion
 */

async function examples() {
  // Initialize client with custom configuration
  const client = new ERC20Client({
    chainId: 4221,
    cosmosChainId: 'evm-chain',
    bech32Prefix: 'cosmos',
    rpcEndpoint: 'http://127.0.0.1:26657',
    evmRpcEndpoint: 'http://127.0.0.1:8545'
  });

  // Example mnemonic (DO NOT use in production)
  const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  const privateKey = '0x' + '0'.repeat(64); // DO NOT use in production

  console.log('=== ERC20 Client Examples ===\n');

  try {
    // 1. Generate new mnemonic and derive addresses
    console.log('1. Generating new wallet...');
    const newMnemonic = await ERC20Client.generateMnemonic();
    const addresses = await client.deriveAddresses(newMnemonic);
    
    console.log('Generated mnemonic:', newMnemonic);
    console.log('Cosmos address:', addresses.cosmosAddress);
    console.log('Hex address:', addresses.hexAddress);
    console.log('Public key:', addresses.publicKey);
    console.log();

    // 2. Register ERC20 token using Cosmos signer
    console.log('2. Registering ERC20 token with Cosmos signer...');
    const contractAddress = '0x1234567890abcdef1234567890abcdef12345678';
    
    const registerResult = await client.registerERC20WithCosmos(
      mnemonic,
      [contractAddress],
      { memo: 'Register MyToken' }
    );
    
    if (registerResult.success) {
      console.log('Registration successful!');
      console.log('TX Hash:', registerResult.txHash);
      console.log('Gas used:', registerResult.gasUsed);
    } else {
      console.log('Registration failed:', registerResult.error);
    }
    console.log();

    // 3. Query token pairs
    console.log('3. Querying token pairs...');
    const pairsResult = await client.queryTokenPairs();
    
    if (pairsResult.success) {
      console.log('Token pairs found:', pairsResult.tokenPairs.length);
      pairsResult.tokenPairs.forEach((pair, index) => {
        console.log(`  ${index + 1}. ${pair.denom} <-> ${pair.erc20_address}`);
      });
    } else {
      console.log('Query failed:', pairsResult.error);
    }
    console.log();

    // 4. Convert ERC20 to Cosmos coin
    console.log('4. Converting ERC20 to Cosmos coin...');
    const convertToCosmosResult = await client.convertERC20ToCoin(
      mnemonic,
      contractAddress,
      '1000000000000000000', // 1 token (18 decimals)
      addresses.cosmosAddress,
      { memo: 'Convert ERC20 to coin' }
    );
    
    if (convertToCosmosResult.success) {
      console.log('Conversion to Cosmos coin successful!');
      console.log('TX Hash:', convertToCosmosResult.txHash);
    } else {
      console.log('Conversion failed:', convertToCosmosResult.error);
    }
    console.log();

    // 5. Convert Cosmos coin to ERC20
    console.log('5. Converting Cosmos coin to ERC20...');
    const convertToERC20Result = await client.convertCoinToERC20(
      mnemonic,
      'xmpl', // Assuming 'xmpl' is the registered denomination
      '1000000000000000000', // 1 token (18 decimals)
      addresses.hexAddress,
      { memo: 'Convert coin to ERC20' }
    );
    
    if (convertToERC20Result.success) {
      console.log('Conversion to ERC20 successful!');
      console.log('TX Hash:', convertToERC20Result.txHash);
    } else {
      console.log('Conversion failed:', convertToERC20Result.error);
    }
    console.log();

    // 6. Interact with ERC20 precompile
    console.log('6. Interacting with ERC20 precompile...');
    const precompileAddress = '0x0000000000000000000000000000000000000900'; // Example precompile address
    
    // Query balance
    const balanceResult = await client.callERC20Precompile(
      privateKey,
      precompileAddress,
      'balanceOf',
      [addresses.hexAddress]
    );
    
    if (balanceResult.success) {
      console.log('Balance:', balanceResult.result);
    } else {
      console.log('Balance query failed:', balanceResult.error);
    }

    // Transfer tokens
    const transferResult = await client.callERC20Precompile(
      privateKey,
      precompileAddress,
      'transfer',
      ['0x9876543210fedcba9876543210fedcba98765432', '1000000000000000000'],
      { gasLimit: 50000 }
    );
    
    if (transferResult.success) {
      console.log('Transfer successful!');
      console.log('TX Hash:', transferResult.txHash);
    } else {
      console.log('Transfer failed:', transferResult.error);
    }
    console.log();

    // 7. Query specific token pair
    console.log('7. Querying specific token pair...');
    const pairResult = await client.queryTokenPair(contractAddress);
    
    if (pairResult.success && pairResult.tokenPair) {
      console.log('Token Pair Details:');
      console.log('  ERC20 Address:', pairResult.tokenPair.erc20_address);
      console.log('  Cosmos Denom:', pairResult.tokenPair.denom);
      console.log('  Enabled:', pairResult.tokenPair.enabled);
      console.log('  Owner:', pairResult.tokenPair.contract_owner);
    } else {
      console.log('Token pair not found or query failed');
    }

  } catch (error) {
    console.error('Example failed:', error);
  }
}

/**
 * Advanced usage examples
 */
async function advancedExamples() {
  console.log('\n=== Advanced Examples ===\n');

  const client = new ERC20Client();

  // Example: Batch operations
  console.log('Batch Token Registration Example:');
  
  const contractAddresses = [
    '0x1111111111111111111111111111111111111111',
    '0x2222222222222222222222222222222222222222',
    '0x3333333333333333333333333333333333333333'
  ];

  const mnemonic = await ERC20Client.generateMnemonic();
  
  try {
    const batchRegisterResult = await client.registerERC20WithCosmos(
      mnemonic,
      contractAddresses,
      { memo: 'Batch register tokens' }
    );
    
    if (batchRegisterResult.success) {
      console.log('Batch registration successful!');
      console.log('TX Hash:', batchRegisterResult.txHash);
      
      // Query all registered pairs
      const allPairs = await client.queryTokenPairs();
      console.log('Total registered pairs:', allPairs.tokenPairs?.length || 0);
    }
  } catch (error) {
    console.error('Batch registration failed:', error);
  }

  // Example: Address conversion utilities
  console.log('\nAddress Conversion Examples:');
  
  const addresses = await client.deriveAddresses(mnemonic);
  console.log('Original Cosmos address:', addresses.cosmosAddress);
  console.log('Converted to hex:', client.bech32ToHex(addresses.cosmosAddress));
  console.log('Converted back to bech32:', client.hexToBech32(addresses.hexAddress));

  // Example: Error handling
  console.log('\nError Handling Example:');
  
  const invalidResult = await client.convertERC20ToCoin(
    'invalid mnemonic words here',
    '0xinvalid',
    '0',
    'invalid-address'
  );
  
  console.log('Expected error result:', {
    success: invalidResult.success,
    error: invalidResult.error ? 'Error caught successfully' : 'No error'
  });
}

// Main execution
async function main() {
  console.log('Starting ERC20 Client Examples...\n');
  
  await examples();
  await advancedExamples();
  
  console.log('\nExamples completed!');
}

// Export for use in other files
module.exports = {
  examples,
  advancedExamples,
  main
};

// Run examples if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}
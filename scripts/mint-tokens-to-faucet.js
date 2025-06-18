#!/usr/bin/env node
import { ethers } from 'ethers';
import { config as dotenvConfig } from 'dotenv';
import { getPrivateKey, getEvmAddress, initializeSecureKeys } from '../config.js';
import TokenConfigLoader from '../src/TokenConfigLoader.js';
import conf from '../config.js';

dotenvConfig();

// Minimal ERC20 ABI with mint function
const MINTABLE_ERC20_ABI = [
    "function mint(address to, uint256 amount) public",
    "function balanceOf(address owner) external view returns (uint256)",
    "function decimals() external view returns (uint8)",
    "function symbol() external view returns (string)",
    "function hasRole(bytes32 role, address account) external view returns (bool)",
    "function MINTER_ROLE() external view returns (bytes32)"
];

async function mintTokensToFaucet() {
    console.log('🚀 Starting token minting process...\n');
    
    try {
        // Initialize secure keys
        await initializeSecureKeys();
        
        const privateKey = getPrivateKey();
        const faucetAddress = getEvmAddress();
        
        // Connect to network
        const provider = new ethers.JsonRpcProvider(conf.blockchain.endpoints.evm_endpoint);
        const wallet = new ethers.Wallet(privateKey, provider);
        
        console.log(`📍 Faucet Address: ${faucetAddress}`);
        console.log(`💼 Minter Address: ${wallet.address}`);
        console.log(`🌐 Network: ${conf.blockchain.name}\n`);
        
        // Load token configuration
        const networkConfig = {
            name: conf.blockchain.name,
            chainId: conf.blockchain.ids.chainId,
            cosmosChainId: conf.blockchain.ids.cosmosChainId,
            type: conf.blockchain.type
        };
        const tokenLoader = new TokenConfigLoader(networkConfig);
        const tokenConfig = tokenLoader.loadConfig();
        
        // Process each ERC20 token
        for (const token of tokenConfig.tokens.filter(t => t.type === 'erc20')) {
            console.log(`\n🪙 Processing ${token.symbol}...`);
            console.log(`  Address: ${token.address}`);
            
            try {
                const tokenContract = new ethers.Contract(token.address, MINTABLE_ERC20_ABI, wallet);
                
                // Check current balance
                const currentBalance = await tokenContract.balanceOf(faucetAddress);
                const decimals = await tokenContract.decimals();
                const formattedBalance = ethers.formatUnits(currentBalance, decimals);
                
                console.log(`  Current Balance: ${formattedBalance} ${token.symbol}`);
                
                // Check if we have minter role
                const minterRole = await tokenContract.MINTER_ROLE();
                const hasMinterRole = await tokenContract.hasRole(minterRole, wallet.address);
                
                if (!hasMinterRole) {
                    console.log(`  ❌ ${wallet.address} does not have MINTER_ROLE for ${token.symbol}`);
                    console.log(`     The token contract may need to grant this role first.`);
                    continue;
                }
                
                // Calculate amount to mint (1 million tokens or 10x the faucet amount)
                const faucetAmount = BigInt(token.target_balance || "1000000");
                const mintAmount = faucetAmount * BigInt(1000); // 1000x faucet amount
                
                console.log(`  Minting: ${ethers.formatUnits(mintAmount, decimals)} ${token.symbol}`);
                
                // Mint tokens
                const tx = await tokenContract.mint(faucetAddress, mintAmount);
                console.log(`  Transaction sent: ${tx.hash}`);
                
                const receipt = await tx.wait();
                console.log(`  ✅ Minted successfully in block ${receipt.blockNumber}`);
                
                // Verify new balance
                const newBalance = await tokenContract.balanceOf(faucetAddress);
                const formattedNewBalance = ethers.formatUnits(newBalance, decimals);
                console.log(`  New Balance: ${formattedNewBalance} ${token.symbol}`);
                
            } catch (error) {
                console.error(`  ❌ Error minting ${token.symbol}:`, error.message);
            }
        }
        
        console.log('\n✅ Token minting process complete!');
        
    } catch (error) {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    }
}

// Run the script
mintTokensToFaucet().catch(console.error);
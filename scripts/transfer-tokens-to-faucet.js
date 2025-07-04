#!/usr/bin/env node
import { ethers } from 'ethers';
import { config as dotenvConfig } from 'dotenv';
import { getEvmAddress, initializeSecureKeys } from '../config.js';
import TokenConfigLoader from '../src/TokenConfigLoader.js';
import conf from '../config.js';

dotenvConfig();

// ERC20 ABI for transfers
const ERC20_ABI = [
    "function transfer(address to, uint256 amount) external returns (bool)",
    "function balanceOf(address owner) external view returns (uint256)",
    "function decimals() external view returns (uint8)",
    "function symbol() external view returns (string)"
];

async function transferTokensToFaucet() {
    console.log(' Checking token balances and preparing transfers...\n');
    
    try {
        // Initialize secure keys
        await initializeSecureKeys();
        
        const faucetAddress = getEvmAddress();
        const minterAddress = '0x42e6047c5780B103E52265F6483C2d0113aA6B87';
        
        // Connect to network
        const provider = new ethers.JsonRpcProvider(conf.blockchain.endpoints.evm_endpoint);
        
        console.log(` Faucet Address: ${faucetAddress}`);
        console.log(` Token Holder Address: ${minterAddress}`);
        console.log(` Network: ${conf.blockchain.name}\n`);
        
        // Use token amounts from config
        const tokenAmounts = conf.blockchain.tx.amounts;
        
        // Check balances for each ERC20 token
        console.log(' Current Token Balances:\n');
        
        for (const tokenAmount of tokenAmounts.filter(t => t.erc20_contract && t.erc20_contract !== "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" && t.erc20_contract !== "0x0000000000000000000000000000000000000000")) {
            try {
                const tokenContract = new ethers.Contract(tokenAmount.erc20_contract, ERC20_ABI, provider);
                const decimals = await tokenContract.decimals();
                const symbol = await tokenContract.symbol();
                
                // Check minter balance
                const minterBalance = await tokenContract.balanceOf(minterAddress);
                const formattedMinterBalance = ethers.formatUnits(minterBalance, decimals);
                
                // Check faucet balance
                const faucetBalance = await tokenContract.balanceOf(faucetAddress);
                const formattedFaucetBalance = ethers.formatUnits(faucetBalance, decimals);
                
                console.log(` ${symbol}:`);
                console.log(`   Token Holder Balance: ${formattedMinterBalance}`);
                console.log(`   Faucet Balance: ${formattedFaucetBalance}`);
                console.log(`   Contract: ${tokenAmount.erc20_contract}\n`);
                
                if (minterBalance > 0n) {
                    console.log(`     The minter address has ${formattedMinterBalance} ${symbol}`);
                    console.log(`     To transfer these tokens, you need the private key for ${minterAddress}`);
                }
                
            } catch (error) {
                console.error(` Error checking ${tokenAmount.denom}:`, error.message);
            }
        }
        
        console.log('\n Summary:');
        console.log('The tokens were minted to a hardcoded address during deployment.');
        console.log('To fund the faucet, you need to:');
        console.log('1. Either use the private key for the minter address to transfer tokens');
        console.log('2. Or redeploy the contracts with the correct faucet address');
        console.log('3. Or grant MINTER_ROLE to the faucet and mint new tokens');
        
    } catch (error) {
        console.error(' Fatal error:', error);
        process.exit(1);
    }
}

// Run the script
transferTokensToFaucet().catch(console.error);
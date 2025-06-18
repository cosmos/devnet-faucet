#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { initializeSecureKeys, getEvmAddress } from '../config.js';

async function fixTokenRegistry() {
    console.log('Fixing token configuration to use dynamic faucet address...\n');
    
    try {
        // Initialize secure keys to get faucet address
        await initializeSecureKeys();
        const faucetAddress = getEvmAddress();
        console.log(`Faucet Address: ${faucetAddress}\n`);
        
        // Load tokens config
        const tokensPath = path.join(process.cwd(), 'tokens.json');
        const tokensConfig = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
        
        // Update each ERC20 token
        for (const token of tokensConfig.tokens.filter(t => t.type === 'erc20')) {
            console.log(`Updating ${token.symbol}...`);
            
            // Update governance roles to use faucet address
            if (token.governance && token.governance.roles) {
                token.governance.roles.owner.address = faucetAddress;
                token.governance.roles.minter.address = faucetAddress;
                token.governance.roles.pauser.address = faucetAddress;
            }
            
            // Update distribution to mint to faucet address
            if (token.distribution && token.distribution.initialDistribution) {
                token.distribution.initialDistribution[0].recipient = faucetAddress;
            }
            
            // Update contract deployer
            if (token.contract) {
                token.contract.deployer = faucetAddress;
            }
            
            // Update metadata
            token.metadata.lastUpdated = new Date().toISOString();
            
            console.log(`  Updated roles and distribution to ${faucetAddress}`);
        }
        
        // Update faucet operator address
        if (tokensConfig.meta && tokensConfig.meta.faucet) {
            tokensConfig.meta.faucet.operator = faucetAddress;
        }
        
        // Update metadata
        tokensConfig.meta.updatedAt = new Date().toISOString();
        
        // Save updated config
        fs.writeFileSync(tokensPath, JSON.stringify(tokensConfig, null, 2));
        console.log('\nToken configuration updated successfully!');
        
    } catch (error) {
        console.error('Error fixing token configuration:', error);
        process.exit(1);
    }
}

// Run the script
fixTokenRegistry().catch(console.error);
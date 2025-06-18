#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { initializeSecureKeys, getEvmAddress } from '../config.js';

async function fixTokenRegistry() {
    console.log('🔧 Fixing token registry to use dynamic faucet address...\n');
    
    try {
        // Initialize secure keys to get faucet address
        await initializeSecureKeys();
        const faucetAddress = getEvmAddress();
        console.log(`📍 Faucet Address: ${faucetAddress}\n`);
        
        // Load token registry
        const registryPath = path.join(process.cwd(), 'token-registry.json');
        const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
        
        // Update each token
        for (const token of registry.tokens) {
            console.log(`Updating ${token.symbol}...`);
            
            // Update roles to use faucet address
            token.roles = {
                owner: faucetAddress,
                minter: faucetAddress,
                pauser: faucetAddress
            };
            
            // Update distribution to mint to faucet address
            token.distribution = [{
                wallet: faucetAddress,
                amount: token.distribution[0].amount // Keep the same amount
            }];
            
            // Update deployer
            token.deployer = faucetAddress;
            
            console.log(`  ✅ Updated roles and distribution to ${faucetAddress}`);
        }
        
        // Update metadata
        registry.meta.updatedAt = new Date().toISOString();
        
        // Save updated registry
        fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
        console.log('\n✅ Token registry updated successfully!');
        
    } catch (error) {
        console.error('❌ Error fixing token registry:', error);
        process.exit(1);
    }
}

// Run the script
fixTokenRegistry().catch(console.error);
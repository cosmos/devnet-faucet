#!/usr/bin/env node

/**
 * Derive wallet addresses from mnemonic and cache them in config
 * 
 * UPDATED: Now uses SecureKeyManager for secure key handling
 * This script is mainly for backward compatibility and initial setup
 */

import secureKeyManager from '../src/SecureKeyManager.js';
import fs from 'fs';
import path from 'path';

/**
 * Derive addresses and cache them in config.js
 * @param {string} mnemonic - The mnemonic phrase (optional, will use env var if not provided)
 */
export async function deriveAndCacheAddresses(mnemonic = null) {
    console.log(' Starting secure address derivation...');
    
    try {
        // If mnemonic is provided, temporarily set it in process.env
        if (mnemonic) {
            process.env.MNEMONIC = mnemonic;
        }
        
        // Initialize secure key manager
        await secureKeyManager.initialize();
        
        // Get derived addresses
        const addresses = secureKeyManager.getAddresses();
        
        console.log(' Addresses derived successfully:');
        console.log(` EVM Address: ${addresses.evm.address}`);
        console.log(` Cosmos Address: ${addresses.cosmos.address}`);
        
        // Update config.js file
        const configPath = path.join(process.cwd(), 'config.js');
        
        if (!fs.existsSync(configPath)) {
            throw new Error(`Config file not found at: ${configPath}`);
        }
        
        let configContent = fs.readFileSync(configPath, 'utf8');
        
        // Replace the derivedAddresses section
        const addressesJson = JSON.stringify(addresses, null, 2);
        
        // Find and replace the derivedAddresses section (handles nested objects)
        const derivedAddressesRegex = /derivedAddresses:\s*{[\s\S]*?}\s*,/;
        const updatedContent = configContent.replace(
            derivedAddressesRegex,
            `derivedAddresses: ${addressesJson.replace(/\n/g, '\n    ')},`
        );
        
        // Write updated config
        fs.writeFileSync(configPath, updatedContent, 'utf8');
        
        console.log(' Addresses cached in config.js');
        console.log(' Secure key derivation completed');
        
        return addresses;
        
    } catch (error) {
        console.error(' Failed to derive and cache addresses:', error.message);
        throw error;
    }
}

// If run directly from command line
if (process.argv[1] === import.meta.url.replace('file://', '')) {
    const mnemonic = process.argv[2] || process.env.MNEMONIC;
    
    if (!mnemonic) {
        console.error(' MNEMONIC required as environment variable or command line argument');
        console.error('Usage: node derive-and-cache-addresses.js [mnemonic]');
        console.error('   or: MNEMONIC="..." node derive-and-cache-addresses.js');
        process.exit(1);
    }
    
    deriveAndCacheAddresses(mnemonic)
        .then(() => {
            console.log(' Address derivation completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error(' Address derivation failed:', error.message);
            process.exit(1);
        });
}
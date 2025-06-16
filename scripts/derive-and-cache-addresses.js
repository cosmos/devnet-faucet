#!/usr/bin/env node

/**
 * Derive wallet addresses from mnemonic and cache them in config
 * This should be run once during deployment or on faucet startup
 */

import { HDNodeWallet } from 'ethers';
import { stringToPath } from '@cosmjs/crypto';
import { pubkeyToAddress } from '@cosmjs/amino';
import { fromHex } from '@cosmjs/encoding';
import fs from 'fs';
import path from 'path';

class AddressDerivation {
    constructor(mnemonic) {
        if (!mnemonic) {
            throw new Error('MNEMONIC is required');
        }
        this.mnemonic = mnemonic;
        this.derivationPath = "m/44'/60'/0'/0/0"; // Ethereum derivation path
        this.cosmosPrefix = "cosmos";
    }

    async deriveAddresses() {
        console.log('🔑 Deriving wallet addresses from mnemonic...');
        
        // Derive EVM wallet
        const evmWallet = HDNodeWallet.fromPhrase(this.mnemonic, undefined, this.derivationPath);
        
        // Extract public key for Cosmos address derivation
        const publicKeyHex = evmWallet.publicKey.slice(2); // Remove 0x prefix
        const publicKeyBytes = fromHex(publicKeyHex);
        
        // Derive Cosmos address using the same public key
        const cosmosAddress = pubkeyToAddress(
            {
                type: 'tendermint/PubKeySecp256k1',
                value: Buffer.from(publicKeyBytes).toString('base64')
            },
            this.cosmosPrefix
        );

        const addresses = {
            evm: {
                address: evmWallet.address,
                privateKey: evmWallet.privateKey,
                publicKey: evmWallet.publicKey
            },
            cosmos: {
                address: cosmosAddress,
                publicKey: Buffer.from(publicKeyBytes).toString('base64'),
                publicKeyHex: publicKeyHex
            },
            derivation: {
                path: this.derivationPath,
                prefix: this.cosmosPrefix,
                derivedAt: new Date().toISOString()
            }
        };

        console.log('✅ Addresses derived:');
        console.log(`  EVM:    ${addresses.evm.address}`);
        console.log(`  Cosmos: ${addresses.cosmos.address}`);
        
        return addresses;
    }

    async updateConfig(addresses) {
        console.log('📝 Updating config.js with derived addresses...');
        
        const configPath = path.join(process.cwd(), 'config.js');
        let configContent = fs.readFileSync(configPath, 'utf8');
        
        // Find the config object and add derivedAddresses
        const configMatch = configContent.match(/const config = \{/);
        if (!configMatch) {
            throw new Error('Could not find config object in config.js');
        }
        
        // Check if derivedAddresses already exists
        if (configContent.includes('derivedAddresses:')) {
            // Replace existing derivedAddresses
            const regex = /derivedAddresses:\s*\{[^}]*\}(?:\s*,)?/s;
            const replacement = `derivedAddresses: ${JSON.stringify(addresses, null, 8).replace(/\n/g, '\n    ')},`;
            configContent = configContent.replace(regex, replacement);
        } else {
            // Add derivedAddresses after the port definition
            const portMatch = configContent.match(/(port:\s*\d+,?\s*)/);
            if (portMatch) {
                const insertion = `    derivedAddresses: ${JSON.stringify(addresses, null, 8).replace(/\n/g, '\n    ')},\n    `;
                configContent = configContent.replace(portMatch[0], portMatch[0] + '\n' + insertion);
            } else {
                throw new Error('Could not find insertion point in config.js');
            }
        }
        
        fs.writeFileSync(configPath, configContent);
        console.log('✅ Config updated with derived addresses');
    }

    async cacheAddresses() {
        try {
            const addresses = await this.deriveAddresses();
            await this.updateConfig(addresses);
            
            console.log('\n🎯 Address caching completed successfully!');
            console.log('📋 Summary:');
            console.log(`  • EVM Address: ${addresses.evm.address}`);
            console.log(`  • Cosmos Address: ${addresses.cosmos.address}`);
            console.log(`  • Derivation Path: ${addresses.derivation.path}`);
            console.log(`  • Cached At: ${addresses.derivation.derivedAt}`);
            
            return addresses;
        } catch (error) {
            console.error('❌ Address caching failed:', error.message);
            throw error;
        }
    }
}

// Function to be called by other scripts
export async function deriveAndCacheAddresses(mnemonic) {
    const deriver = new AddressDerivation(mnemonic);
    return await deriver.cacheAddresses();
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const mnemonic = process.env.MNEMONIC;
    if (!mnemonic) {
        console.error('❌ MNEMONIC environment variable is required');
        process.exit(1);
    }
    
    try {
        await deriveAndCacheAddresses(mnemonic);
    } catch (error) {
        console.error('❌ Failed to derive and cache addresses:', error.message);
        process.exit(1);
    }
}
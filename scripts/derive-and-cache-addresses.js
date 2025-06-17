#!/usr/bin/env node

/**
 * Derive wallet addresses from mnemonic and cache them in config
 * This should be run once during deployment or on faucet startup
 */

import { HDNodeWallet } from 'ethers';
import { stringToPath } from '@cosmjs/crypto';
import { bech32 } from 'bech32';
import { keccak_256 } from '@noble/hashes/sha3';
import { secp256k1 } from '@noble/curves/secp256k1';
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

    // Convert bits for bech32 encoding (from faucet.js)
    convertBits(data, fromBits, toBits, pad) {
        let acc = 0;
        let bits = 0;
        const ret = [];
        const maxv = (1 << toBits) - 1;
        for (let p = 0; p < data.length; ++p) {
            const value = data[p];
            if (value < 0 || (value >> fromBits) !== 0) {
                return null;
            }
            acc = (acc << fromBits) | value;
            bits += fromBits;
            while (bits >= toBits) {
                bits -= toBits;
                ret.push((acc >> bits) & maxv);
            }
        }
        if (pad) {
            if (bits > 0) {
                ret.push((acc << (toBits - bits)) & maxv);
            }
        } else if (bits >= fromBits || ((acc << (toBits - bits)) & maxv)) {
            return null;
        }
        return ret;
    }

    // Generate eth_secp256k1 addresses from private key (from faucet.js)
    generateEthSecp256k1AddressesFromPrivateKey(privateKeyHex, prefix) {
        const privateKey = Buffer.from(privateKeyHex, 'hex');
        const publicKey = secp256k1.getPublicKey(privateKey, true); // compressed public key
        const publicKeyUncompressed = secp256k1.getPublicKey(privateKey, false).slice(1); // remove 0x04 prefix

        // Use keccak hashed hex address, directly converted to bech32
        const keccakHash = keccak_256(publicKeyUncompressed);
        const addressBytes = keccakHash.slice(-20);
        const fiveBitArray = this.convertBits(addressBytes, 8, 5, true);
        const cosmosAddress = bech32.encode(prefix, fiveBitArray, 256);

        const ethAddress = `0x${Buffer.from(addressBytes).toString('hex')}`;

        return {
            cosmosAddress,
            ethAddress,
            publicKey: Buffer.from(publicKey).toString('hex'),
            publicKeyUncompressed: Buffer.from(publicKeyUncompressed).toString('hex'),
            privateKey: Buffer.from(privateKey).toString('hex')
        };
    }

    async deriveAddresses() {
        console.log('🔑 Deriving wallet addresses from mnemonic...');
        
        // Derive EVM wallet using ethers
        const evmWallet = HDNodeWallet.fromPhrase(this.mnemonic, undefined, this.derivationPath);
        
        // Use the correct eth_secp256k1 derivation method
        const privateKeyHex = evmWallet.privateKey.slice(2); // Remove 0x prefix
        const derivedAddresses = this.generateEthSecp256k1AddressesFromPrivateKey(privateKeyHex, this.cosmosPrefix);

        const addresses = {
            evm: {
                address: derivedAddresses.ethAddress,
                publicKey: `0x${derivedAddresses.publicKey}`
            },
            cosmos: {
                address: derivedAddresses.cosmosAddress,
                publicKey: Buffer.from(derivedAddresses.publicKey, 'hex').toString('base64'),
                publicKeyHex: derivedAddresses.publicKey
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

    findMatchingBrace(content, startIndex) {
        let braceCount = 0;
        let inString = false;
        let escaped = false;
        let stringChar = null;

        for (let i = startIndex; i < content.length; i++) {
            const char = content[i];
            
            if (escaped) {
                escaped = false;
                continue;
            }
            
            if (char === '\\') {
                escaped = true;
                continue;
            }
            
            if (!inString) {
                if (char === '"' || char === "'" || char === '`') {
                    inString = true;
                    stringChar = char;
                } else if (char === '{') {
                    braceCount++;
                } else if (char === '}') {
                    braceCount--;
                    if (braceCount === 0) {
                        return i;
                    }
                }
            } else {
                if (char === stringChar) {
                    inString = false;
                    stringChar = null;
                }
            }
        }
        
        return -1;
    }

    async updateConfig(addresses) {
        console.log('📝 Updating config.js with derived addresses...');
        
        const configPath = path.join(process.cwd(), 'config.js');
        let configContent = fs.readFileSync(configPath, 'utf8');
        
        // Find the config object
        const configMatch = configContent.match(/const config = \{/);
        if (!configMatch) {
            throw new Error('Could not find config object in config.js');
        }
        
        // Check if derivedAddresses already exists
        const derivedAddressesMatch = configContent.match(/(\s+)derivedAddresses:\s*\{/);
        
        if (derivedAddressesMatch) {
            // Find the complete derivedAddresses object
            const startIndex = derivedAddressesMatch.index + derivedAddressesMatch[0].length - 1; // Position of opening brace
            const endIndex = this.findMatchingBrace(configContent, startIndex);
            
            if (endIndex === -1) {
                throw new Error('Could not find matching brace for derivedAddresses object');
            }
            
            // Find the end of the complete derivedAddresses property (including trailing comma)
            let propertyEndIndex = endIndex + 1;
            while (propertyEndIndex < configContent.length && 
                   /\s/.test(configContent[propertyEndIndex])) {
                propertyEndIndex++;
            }
            if (configContent[propertyEndIndex] === ',') {
                propertyEndIndex++;
            }
            
            // Replace the entire derivedAddresses property
            const indent = derivedAddressesMatch[1];
            const formattedAddresses = JSON.stringify(addresses, null, 4)
                .split('\n')
                .map((line, index) => index === 0 ? line : indent + line)
                .join('\n');
            
            const replacement = `${indent}derivedAddresses: ${formattedAddresses},`;
            
            configContent = configContent.substring(0, derivedAddressesMatch.index) + 
                          replacement + 
                          configContent.substring(propertyEndIndex);
        } else {
            // Add derivedAddresses after the port definition
            const portMatch = configContent.match(/(\s+)(port:\s*\d+,?)(\s*)/);
            if (portMatch) {
                const indent = portMatch[1];
                const formattedAddresses = JSON.stringify(addresses, null, 4)
                    .split('\n')
                    .map((line, index) => index === 0 ? line : indent + line)
                    .join('\n');
                
                const insertion = `${portMatch[1]}${portMatch[2]}\n${indent}derivedAddresses: ${formattedAddresses},${portMatch[3]}`;
                configContent = configContent.replace(portMatch[0], insertion);
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
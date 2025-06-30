#!/usr/bin/env node

/**
 * Contract verification via Blockscout API
 * Uses the v2 API endpoints to verify contracts
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import FormData from 'form-data';
import config, { getEvmAddress, initializeSecureKeys } from '../config.js';
import TokenConfigLoader from '../src/TokenConfigLoader.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class BlockscoutAPIVerifier {
    constructor() {
        this.explorerApiUrl = 'https://evm-devnet-1.cloud.blockscout.com/api/v2';
        this.explorerUrl = 'https://evm-devnet-1.cloud.blockscout.com';
        this.networkConfig = {
            name: config.blockchain.name,
            chainId: config.blockchain.ids.chainId,
            cosmosChainId: config.blockchain.ids.cosmosChainId,
            type: config.blockchain.type
        };
        this.tokenLoader = new TokenConfigLoader(this.networkConfig);
        this.faucetAddress = null;
    }

    async initialize() {
        await initializeSecureKeys();
        this.faucetAddress = getEvmAddress();
        console.log('🔍 Blockscout API Contract Verification');
        console.log(`📍 Faucet Address: ${this.faucetAddress}`);
        console.log(`🌐 Explorer: ${this.explorerUrl}`);
    }

    async checkVerificationStatus(address) {
        try {
            const response = await fetch(`${this.explorerApiUrl}/smart-contracts/${address}`);
            const data = await response.json();
            return data.is_verified === true;
        } catch (error) {
            console.error(`Error checking verification status: ${error.message}`);
            return false;
        }
    }

    async verifyContract(contractData) {
        const { address, name, flattenedPath, constructorArgs = '' } = contractData;
        
        console.log(`\n🔍 Verifying ${name} at ${address}`);
        
        // Check if already verified
        const isVerified = await this.checkVerificationStatus(address);
        if (isVerified) {
            console.log(`✅ ${name} is already verified on Blockscout`);
            return true;
        }
        
        console.log(`📝 Submitting ${name} for verification...`);
        
        // Read flattened source code
        const sourceCode = await fs.readFile(flattenedPath, 'utf8');
        
        // Prepare form data
        const form = new FormData();
        form.append('addressHash', address.toLowerCase());
        form.append('name', name);
        form.append('compilerVersion', 'v0.8.28+commit.7893614a');
        form.append('optimization', 'true');
        form.append('optimizationRuns', '200');
        form.append('contractSourceCode', sourceCode);
        form.append('evmVersion', 'istanbul');
        form.append('autodetectConstructorArguments', 'false');
        form.append('constructorArguments', constructorArgs);
        form.append('licenseType', '3'); // MIT
        form.append('viaIR', 'true');

        try {
            const response = await fetch(
                `${this.explorerApiUrl}/smart-contracts/${address}/verification/via/flattened-code`,
                {
                    method: 'POST',
                    headers: form.getHeaders(),
                    body: form
                }
            );
            
            const responseText = await response.text();
            console.log(`   Raw response: ${responseText}`);
            let result;
            try {
                result = JSON.parse(responseText);
            } catch {
                result = responseText;
            }
            
            if (response.ok || response.status === 200) {
                console.log(`✅ ${name} verification submitted successfully!`);
                console.log(`   View at: ${this.explorerUrl}/address/${address}`);
                
                // Wait a bit and check if verification succeeded
                console.log(`   Waiting for verification to process...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                const verified = await this.checkVerificationStatus(address);
                if (verified) {
                    console.log(`   ✅ Verification confirmed!`);
                } else {
                    console.log(`   ⏳ Verification pending, check back later`);
                }
                
                return true;
            } else {
                console.log(`❌ ${name} verification failed:`, result);
                console.log(`   Status: ${response.status}`);
                if (typeof result === 'object' && result.message) {
                    console.log(`   Error: ${result.message}`);
                }
                return false;
            }
        } catch (error) {
            console.error(`❌ Error submitting ${name} for verification:`, error.message);
            return false;
        }
    }

    async verifyAllContracts() {
        await this.initialize();
        
        const contracts = [];
        
        // AtomicMultiSend contract
        const atomicMultiSendAddress = this.tokenLoader.getFaucetConfig().atomicMultiSend;
        if (atomicMultiSendAddress) {
            contracts.push({
                address: atomicMultiSendAddress,
                name: 'AtomicMultiSend',
                flattenedPath: path.join(__dirname, '../flattened/AtomicMultiSend_flat.sol'),
                constructorArgs: '' // No constructor args
            });
        }
        
        // Token contracts - only unverified ones
        const unverifiedTokens = [
            { symbol: 'PEPE', address: '0xBCf75f81D7A74cf18a41C267443F0fF3E1A9A671' },
            { symbol: 'USDT', address: '0xc8648a893357e9893669036Be58aFE71B8140eD6' }
        ];
        
        for (const token of unverifiedTokens) {
            contracts.push({
                address: token.address,
                name: token.symbol,
                flattenedPath: path.join(__dirname, `../flattened/${token.symbol}_flat.sol`),
                constructorArgs: this.encodeConstructorArgs(this.faucetAddress) // initialOwner parameter
            });
        }
        
        // Check if flattened files exist
        console.log('\n📄 Checking flattened contracts...');
        for (const contract of contracts) {
            try {
                await fs.access(contract.flattenedPath);
                console.log(`✅ Found ${contract.name} flattened source`);
            } catch {
                console.error(`❌ Missing ${contract.name} flattened source at ${contract.flattenedPath}`);
                console.log(`   Run: forge flatten src/tokens/${contract.name}.sol > ${contract.flattenedPath}`);
            }
        }
        
        // Verify all contracts
        console.log('\n🚀 Submitting contracts for verification...');
        const results = [];
        for (const contract of contracts) {
            try {
                await fs.access(contract.flattenedPath);
                const success = await this.verifyContract(contract);
                results.push({ name: contract.name, success });
            } catch (error) {
                console.error(`Skipping ${contract.name}: ${error.message}`);
                results.push({ name: contract.name, success: false });
            }
        }
        
        // Summary
        console.log('\n📊 Verification Summary:');
        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);
        
        if (successful.length > 0) {
            console.log(`✅ Successfully submitted: ${successful.map(r => r.name).join(', ')}`);
        }
        
        if (failed.length > 0) {
            console.log(`❌ Failed to verify: ${failed.map(r => r.name).join(', ')}`);
        }
        
        console.log(`\n🔗 View all verified contracts at:`);
        console.log(`   ${this.explorerUrl}/verified-contracts`);
    }

    encodeConstructorArgs(address) {
        // Encode address parameter (remove 0x prefix and pad to 32 bytes)
        return address.toLowerCase().replace('0x', '').padStart(64, '0');
    }
}

// Run verification if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const verifier = new BlockscoutAPIVerifier();
    
    verifier.verifyAllContracts()
        .then(() => {
            console.log('\n✨ Verification process complete!');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n❌ Verification error:', error.message);
            process.exit(1);
        });
}

export default BlockscoutAPIVerifier;
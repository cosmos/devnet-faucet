#!/usr/bin/env node

/**
 * Contract verification via Blockscout API
 * Uses the official Blockscout API format for contract verification
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import config, { getEvmAddress, initializeSecureKeys } from '../config.js';
import TokenConfigLoader from '../src/TokenConfigLoader.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class BlockscoutVerifier {
    constructor() {
        // Use our Blockscout instance, not the official one
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
        console.log('🔍 Blockscout Smart Contract Verification');
        console.log(`📍 Faucet Address: ${this.faucetAddress}`);
        console.log(`🌐 Explorer: ${this.explorerUrl}`);
        
        // Check verification config
        await this.checkVerificationConfig();
    }

    async checkVerificationConfig() {
        try {
            const response = await fetch(`${this.explorerApiUrl}/smart-contracts/verification/config`);
            const config = await response.json();
            console.log(`✅ Verification service available`);
            console.log(`   Supported compilers: ${config.solidity_compiler_versions?.length || 0} versions`);
            console.log(`   License types: ${config.license_types?.length || 0} types`);
        } catch (error) {
            console.log(`⚠️  Could not fetch verification config: ${error.message}`);
        }
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
        
        // Prepare JSON payload according to Blockscout API docs
        const payload = {
            "compiler_version": "v0.8.28+commit.7893614a",
            "license_type": "mit", // Use lowercase
            "contract_name": name,
            "is_optimization_enabled": true,
            "optimization_runs": 200,
            "evm_version": "istanbul",
            "source_code": sourceCode,
            "constructor_args": constructorArgs
        };

        console.log(`   Compiler: ${payload.compiler_version}`);
        console.log(`   Optimization: ${payload.is_optimization_enabled} (${payload.optimization_runs} runs)`);
        console.log(`   EVM Version: ${payload.evm_version}`);
        if (constructorArgs) {
            console.log(`   Constructor Args: ${constructorArgs}`);
        }

        try {
            const response = await fetch(
                `${this.explorerApiUrl}/smart-contracts/${address}/verification/via/flattened-code`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify(payload)
                }
            );
            
            const responseText = await response.text();
            let result;
            try {
                result = JSON.parse(responseText);
            } catch {
                result = responseText;
            }
            
            if (response.ok || response.status === 200 || response.status === 201) {
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
                console.log(`❌ ${name} verification failed`);
                console.log(`   Status: ${response.status}`);
                if (typeof result === 'object') {
                    if (result.message) console.log(`   Message: ${result.message}`);
                    if (result.errors) console.log(`   Errors: ${JSON.stringify(result.errors)}`);
                } else {
                    console.log(`   Response: ${result}`);
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
        let allFilesExist = true;
        for (const contract of contracts) {
            try {
                await fs.access(contract.flattenedPath);
                console.log(`✅ Found ${contract.name} flattened source`);
            } catch {
                console.error(`❌ Missing ${contract.name} flattened source at ${contract.flattenedPath}`);
                console.log(`   Run: forge flatten src/tokens/${contract.name}.sol > ${contract.flattenedPath}`);
                allFilesExist = false;
            }
        }
        
        if (!allFilesExist) {
            console.log('\n⚠️  Some flattened files are missing. Please generate them first.');
            return;
        }
        
        // Verify all contracts
        console.log('\n🚀 Submitting contracts for verification...');
        const results = [];
        for (const contract of contracts) {
            const success = await this.verifyContract(contract);
            results.push({ name: contract.name, success });
            
            // Add delay between verifications to avoid rate limiting
            if (contracts.indexOf(contract) < contracts.length - 1) {
                console.log('\n⏳ Waiting before next verification...');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        // Summary
        console.log('\n📊 Verification Summary:');
        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);
        
        if (successful.length > 0) {
            console.log(`✅ Successfully verified: ${successful.map(r => r.name).join(', ')}`);
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
    const verifier = new BlockscoutVerifier();
    
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

export default BlockscoutVerifier;
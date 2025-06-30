#!/usr/bin/env node

/**
 * Automated contract verification for deployment scripts
 * Adapted from the standalone verification tool
 */

import fs from 'fs/promises';
import path from 'path';
import fetch from 'node-fetch';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import config from '../config.js';
import TokenConfigLoader from '../src/TokenConfigLoader.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FLATTENED_DIR = path.join(__dirname, '../flattened');

class AutomatedVerifier {
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
        
        // Compiler settings from foundry.toml
        this.compilerSettings = {
            version: 'v0.8.28+commit.7893614a',
            optimization: true,
            runs: 200,
            evmVersion: 'istanbul',
            viaIR: true,
            license: 'mit'
        };
    }

    async initialize() {
        console.log('\n Starting Automated Contract Verification');
        console.log(' =======================================');
        console.log(` Explorer: ${this.explorerUrl}`);
        console.log(` Chain ID: ${this.networkConfig.chainId}`);
        
        // Create flattened directory
        await fs.mkdir(FLATTENED_DIR, { recursive: true });
        
        // Check verification service
        await this.checkVerificationService();
    }

    async checkVerificationService() {
        try {
            const response = await fetch(`${this.explorerApiUrl}/smart-contracts/verification/config`);
            const data = await response.json();
            console.log(' Verification service available');
        } catch (error) {
            console.warn(' Could not verify service availability:', error.message);
        }
    }

    async checkIfVerified(address) {
        try {
            const response = await fetch(`${this.explorerApiUrl}/smart-contracts/${address.toLowerCase()}`);
            const data = await response.json();
            return data.is_verified === true;
        } catch (error) {
            return false;
        }
    }

    async flattenContract(contractName, contractPath) {
        const outputPath = path.join(FLATTENED_DIR, `${contractName}_flat.sol`);
        
        // Check if Foundry is installed
        try {
            execSync('forge --version', { stdio: 'ignore' });
        } catch {
            console.error(' Foundry not installed. Cannot flatten contracts.');
            return null;
        }
        
        console.log(`  Flattening ${contractName}...`);
        try {
            const result = execSync(`forge flatten ${contractPath}`, { encoding: 'utf8' });
            await fs.writeFile(outputPath, result);
            return result;
        } catch (error) {
            console.error(`  Failed to flatten: ${error.message}`);
            return null;
        }
    }

    async verifyContract(contractName, address, constructorArgs = '') {
        console.log(`\n Verifying ${contractName} at ${address}`);
        
        // Ensure lowercase address
        address = address.toLowerCase();
        
        // Check if already verified
        const isVerified = await this.checkIfVerified(address);
        if (isVerified) {
            console.log(`  Already verified`);
            return true;
        }
        
        // Find contract source
        const contractPath = await this.findContractPath(contractName);
        if (!contractPath) {
            console.error(`  Contract source not found`);
            return false;
        }
        
        // Flatten contract
        const sourceCode = await this.flattenContract(contractName, contractPath);
        if (!sourceCode) {
            return false;
        }
        
        // Prepare verification payload
        const payload = {
            compiler_version: this.compilerSettings.version,
            license_type: this.compilerSettings.license,
            contract_name: contractName,
            is_optimization_enabled: this.compilerSettings.optimization,
            optimization_runs: this.compilerSettings.runs,
            evm_version: this.compilerSettings.evmVersion,
            source_code: sourceCode,
            constructor_args: constructorArgs
        };
        
        console.log(`  Compiler: ${payload.compiler_version}`);
        console.log(`  Optimization: ${payload.is_optimization_enabled} (${payload.optimization_runs} runs)`);
        console.log(`  EVM Version: ${payload.evm_version}`);
        
        // Submit verification
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
                console.log(`  Verification submitted successfully`);
                console.log(`  View at: ${this.explorerUrl}/address/${address}`);
                
                // Wait for confirmation
                console.log(`  Waiting for confirmation...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                const verified = await this.checkIfVerified(address);
                if (verified) {
                    console.log(`  Verification confirmed`);
                } else {
                    console.log(`  Verification pending`);
                }
                
                return true;
            } else {
                console.error(`  Verification failed`);
                console.error(`  Status: ${response.status}`);
                if (typeof result === 'object' && result.message) {
                    console.error(`  Error: ${result.message}`);
                }
                return false;
            }
        } catch (error) {
            console.error(`  Error: ${error.message}`);
            return false;
        }
    }

    async findContractPath(contractName) {
        // Check in src directory first
        const srcPaths = [
            path.join(__dirname, `../src/${contractName}.sol`),
            path.join(__dirname, `../src/tokens/${contractName}.sol`),
            path.join(__dirname, `../contracts/${contractName}.sol`)
        ];
        
        for (const contractPath of srcPaths) {
            try {
                await fs.access(contractPath);
                return contractPath;
            } catch {}
        }
        
        return null;
    }

    encodeConstructorArgs(args) {
        if (!args || args.length === 0) return '';
        
        // For address parameters (like token initial owner)
        if (args.length === 1 && typeof args[0] === 'string' && args[0].startsWith('0x')) {
            return args[0].toLowerCase().replace('0x', '').padStart(64, '0');
        }
        
        // For more complex encoding, would need ABI
        return '';
    }

    async verifyDeployedContracts(deploymentResults) {
        await this.initialize();
        
        const results = {
            verified: [],
            failed: [],
            alreadyVerified: []
        };
        
        // Verify AtomicMultiSend if deployed
        if (deploymentResults.atomicMultiSend) {
            const success = await this.verifyContract(
                'AtomicMultiSend',
                deploymentResults.atomicMultiSend,
                ''
            );
            
            if (success) {
                results.verified.push('AtomicMultiSend');
            } else {
                results.failed.push('AtomicMultiSend');
            }
            
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        // Verify tokens
        if (deploymentResults.tokens) {
            for (const [symbol, address] of Object.entries(deploymentResults.tokens)) {
                const constructorArgs = this.encodeConstructorArgs([deploymentResults.deployerAddress]);
                
                const success = await this.verifyContract(
                    symbol,
                    address,
                    constructorArgs
                );
                
                if (success) {
                    results.verified.push(symbol);
                } else {
                    results.failed.push(symbol);
                }
                
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        // Summary
        console.log('\n Verification Summary');
        console.log(' ===================');
        if (results.verified.length > 0) {
            console.log(` Verified: ${results.verified.join(', ')}`);
        }
        if (results.failed.length > 0) {
            console.log(` Failed: ${results.failed.join(', ')}`);
        }
        
        console.log(`\n View verified contracts at:`);
        console.log(` ${this.explorerUrl}/verified-contracts`);
        
        return results;
    }
}

export default AutomatedVerifier;

// Run if called directly with deployment results
if (import.meta.url === `file://${process.argv[1]}`) {
    const resultsFile = process.argv[2];
    if (!resultsFile) {
        console.error('Usage: node verify-contracts-automated.js <deployment-results.json>');
        process.exit(1);
    }
    
    fs.readFile(resultsFile, 'utf8')
        .then(data => {
            const deploymentResults = JSON.parse(data);
            const verifier = new AutomatedVerifier();
            return verifier.verifyDeployedContracts(deploymentResults);
        })
        .catch(error => {
            console.error('Verification failed:', error.message);
            process.exit(1);
        });
}
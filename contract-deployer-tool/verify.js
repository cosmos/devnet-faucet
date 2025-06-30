#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import fetch from 'node-fetch';
import { execSync } from 'child_process';
import { config } from './config.js';

const CONTRACTS_DIR = './contracts';
const DEPLOYMENTS_DIR = './deployments';
const FLATTENED_DIR = './flattened';

class ContractVerifier {
    constructor() {
        this.deployments = {};
    }

    async initialize() {
        console.log('Contract Verification Tool');
        console.log('==========================');
        console.log(`Explorer: ${config.explorerUrl}`);
        console.log(`Chain ID: ${config.chainId}`);
        
        // Load deployments
        await this.loadDeployments();
        
        // Create flattened directory
        await fs.mkdir(FLATTENED_DIR, { recursive: true });
        
        // Check if verification service is available
        await this.checkVerificationService();
    }

    async loadDeployments() {
        const deploymentFile = path.join(DEPLOYMENTS_DIR, `${config.chainId}.json`);
        try {
            const data = await fs.readFile(deploymentFile, 'utf8');
            this.deployments = JSON.parse(data);
            console.log(`Loaded ${Object.keys(this.deployments).length} deployments`);
        } catch (error) {
            throw new Error(`No deployments found for chain ${config.chainId}`);
        }
    }

    async checkVerificationService() {
        try {
            const response = await fetch(`${config.explorerApiUrl}/smart-contracts/verification/config`);
            const data = await response.json();
            console.log('Verification service available');
        } catch (error) {
            console.warn('Could not verify service availability:', error.message);
        }
    }

    async checkIfVerified(address) {
        try {
            const response = await fetch(`${config.explorerApiUrl}/smart-contracts/${address.toLowerCase()}`);
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
            throw new Error('Foundry not installed. Install it with: curl -L https://foundry.paradigm.xyz | bash && foundryup');
        }
        
        console.log(`  Flattening ${contractName}...`);
        try {
            const result = execSync(`forge flatten ${contractPath}`, { encoding: 'utf8' });
            await fs.writeFile(outputPath, result);
            return result;
        } catch (error) {
            throw new Error(`Failed to flatten: ${error.message}`);
        }
    }

    async verifyContract(contractName, deployment) {
        console.log(`\nVerifying ${contractName} at ${deployment.address}`);
        
        // Check if already verified
        const isVerified = await this.checkIfVerified(deployment.address);
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
        
        // Prepare verification payload
        const payload = {
            compiler_version: config.compilerVersion,
            license_type: config.license,
            contract_name: contractName,
            is_optimization_enabled: config.optimization,
            optimization_runs: config.optimizationRuns,
            evm_version: config.evmVersion,
            source_code: sourceCode,
            constructor_args: this.encodeConstructorArgs(deployment.constructorArgs || [])
        };
        
        console.log(`  Compiler: ${payload.compiler_version}`);
        console.log(`  Optimization: ${payload.is_optimization_enabled} (${payload.optimization_runs} runs)`);
        console.log(`  EVM Version: ${payload.evm_version}`);
        if (payload.constructor_args) {
            console.log(`  Constructor Args: ${payload.constructor_args}`);
        }
        
        // Submit verification
        try {
            const response = await fetch(
                `${config.explorerApiUrl}/smart-contracts/${deployment.address.toLowerCase()}/verification/via/flattened-code`,
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
                console.log(`  View at: ${config.explorerUrl}/address/${deployment.address}`);
                
                // Wait and check
                console.log(`  Waiting for confirmation...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                const verified = await this.checkIfVerified(deployment.address);
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
                } else if (typeof result === 'string') {
                    console.error(`  Response: ${result}`);
                }
                return false;
            }
        } catch (error) {
            console.error(`  Error: ${error.message}`);
            return false;
        }
    }

    async findContractPath(contractName) {
        // Check direct file
        let contractPath = path.join(CONTRACTS_DIR, `${contractName}.sol`);
        try {
            await fs.access(contractPath);
            return contractPath;
        } catch {}
        
        // Check in subdirectories
        try {
            const items = await fs.readdir(CONTRACTS_DIR);
            for (const item of items) {
                const itemPath = path.join(CONTRACTS_DIR, item);
                const stat = await fs.stat(itemPath);
                if (stat.isDirectory()) {
                    contractPath = path.join(itemPath, `${contractName}.sol`);
                    try {
                        await fs.access(contractPath);
                        return contractPath;
                    } catch {}
                }
            }
        } catch {}
        
        return null;
    }

    encodeConstructorArgs(args) {
        if (!args || args.length === 0) return '';
        
        // Simple encoding for common types
        return args.map(arg => {
            if (typeof arg === 'string' && arg.startsWith('0x')) {
                // Address or bytes
                return arg.toLowerCase().replace('0x', '').padStart(64, '0');
            } else if (typeof arg === 'number' || typeof arg === 'bigint') {
                // Number
                return arg.toString(16).padStart(64, '0');
            } else if (typeof arg === 'boolean') {
                // Boolean
                return arg ? '1'.padStart(64, '0') : '0'.padStart(64, '0');
            } else {
                // String - would need proper ABI encoding
                console.warn('Complex constructor argument encoding not implemented');
                return '';
            }
        }).join('');
    }

    async run() {
        await this.initialize();
        
        const contracts = Object.keys(this.deployments);
        if (contracts.length === 0) {
            console.log('\nNo deployed contracts found');
            return;
        }
        
        console.log(`\nFound ${contracts.length} deployed contract(s):`);
        contracts.forEach(name => {
            console.log(`  - ${name} at ${this.deployments[name].address}`);
        });
        
        // Verify contracts
        const results = {
            verified: [],
            failed: [],
            alreadyVerified: []
        };
        
        for (const contractName of contracts) {
            const deployment = this.deployments[contractName];
            
            // Check if already verified before attempting
            const isVerified = await this.checkIfVerified(deployment.address);
            if (isVerified) {
                results.alreadyVerified.push(contractName);
                console.log(`\n${contractName} already verified`);
                continue;
            }
            
            const success = await this.verifyContract(contractName, deployment);
            if (success) {
                results.verified.push(contractName);
            } else {
                results.failed.push(contractName);
            }
            
            // Delay between verifications
            if (contracts.indexOf(contractName) < contracts.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        // Summary
        console.log('\n==========================');
        console.log('Verification Summary');
        console.log('==========================');
        if (results.verified.length > 0) {
            console.log(`Verified: ${results.verified.join(', ')}`);
        }
        if (results.alreadyVerified.length > 0) {
            console.log(`Already verified: ${results.alreadyVerified.join(', ')}`);
        }
        if (results.failed.length > 0) {
            console.log(`Failed: ${results.failed.join(', ')}`);
        }
        
        console.log(`\nView verified contracts at:`);
        console.log(`${config.explorerUrl}/verified-contracts`);
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const verifier = new ContractVerifier();
    verifier.run().catch(error => {
        console.error('\nVerification failed:', error.message);
        process.exit(1);
    });
}
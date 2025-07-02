#!/usr/bin/env node

/**
 * Script to verify preinstalled system contracts on Blockscout
 * Downloads source code from official repositories and submits for verification
 */

import fs from 'fs/promises';
import path from 'path';
import fetch from 'node-fetch';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { PREINSTALLED_CONTRACTS } from '../src/preinstalled-contracts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTRACTS_DIR = path.join(__dirname, '../preinstalled-sources');
const FLATTENED_DIR = path.join(__dirname, '../flattened');

// Contract source URLs and compiler settings
const CONTRACT_SOURCES = {
    'Create2': {
        url: 'https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/refs/heads/master/contracts/utils/Create2.sol',
        contractName: 'Create2',
        compilerVersion: 'v0.8.20+commit.a1b79de6',
        optimization: true,
        runs: 200,
        evmVersion: 'paris'
    },
    'Multicall3': {
        url: 'https://raw.githubusercontent.com/mds1/multicall/v3.1.0/src/Multicall3.sol',
        contractName: 'Multicall3',
        compilerVersion: 'v0.8.12+commit.f00d7308',
        optimization: true,
        runs: 10000000,
        evmVersion: 'london'
    },
    'Permit2': {
        url: 'https://raw.githubusercontent.com/Uniswap/permit2/refs/heads/main/src/Permit2.sol',
        contractName: 'Permit2',
        compilerVersion: 'v0.8.17+commit.8df45f5f',
        optimization: true,
        runs: 1000000,
        evmVersion: 'default'
    },
    'SafeSingletonFactory': {
        url: 'https://raw.githubusercontent.com/safe-global/safe-singleton-factory/v1.0.17/contracts/SafeSingletonFactory.sol',
        contractName: 'SafeSingletonFactory',
        compilerVersion: 'v0.7.6+commit.7338295f',
        optimization: false,
        runs: 200,
        evmVersion: 'istanbul'
    }
};

class PreinstalledContractVerifier {
    constructor() {
        this.explorerApiUrl = 'https://evm-devnet-1.cloud.blockscout.com/api/v2';
        this.explorerUrl = 'https://evm-devnet-1.cloud.blockscout.com';
    }

    async initialize() {
        console.log('Preinstalled Contract Verification');
        console.log('==================================');
        console.log(`Explorer: ${this.explorerUrl}`);
        
        // Create directories
        await fs.mkdir(CONTRACTS_DIR, { recursive: true });
        await fs.mkdir(FLATTENED_DIR, { recursive: true });
    }

    async downloadContract(name, sourceInfo) {
        console.log(`\nDownloading ${name} source code...`);
        
        try {
            const response = await fetch(sourceInfo.url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const sourceCode = await response.text();
            const fileName = `${name}.sol`;
            const filePath = path.join(CONTRACTS_DIR, fileName);
            
            await fs.writeFile(filePath, sourceCode);
            console.log(`  Saved to: ${filePath}`);
            
            return { sourceCode, filePath };
        } catch (error) {
            console.error(`  Failed to download: ${error.message}`);
            return null;
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

    async flattenContract(name, filePath) {
        console.log(`  Flattening ${name}...`);
        
        try {
            // For simple contracts without dependencies, the source itself is flattened
            const sourceCode = await fs.readFile(filePath, 'utf8');
            
            // Check if it has imports
            if (sourceCode.includes('import ')) {
                console.log(`  Contract has imports, attempting to flatten with forge...`);
                
                // Try using forge flatten if available
                try {
                    execSync('forge --version', { stdio: 'ignore' });
                    const result = execSync(`forge flatten ${filePath}`, { encoding: 'utf8' });
                    return result;
                } catch (error) {
                    console.log(`  Forge not available, using source as-is`);
                    return sourceCode;
                }
            }
            
            return sourceCode;
        } catch (error) {
            console.error(`  Failed to process: ${error.message}`);
            return null;
        }
    }

    async verifyContract(name, address, sourceInfo) {
        console.log(`\nVerifying ${name} at ${address}`);
        
        // Check if already verified
        const isVerified = await this.checkIfVerified(address);
        if (isVerified) {
            console.log(`  Already verified`);
            return { name, status: 'already_verified' };
        }
        
        // Download source code
        const download = await this.downloadContract(name, sourceInfo);
        if (!download) {
            return { name, status: 'download_failed' };
        }
        
        // Flatten if needed
        const flattenedCode = await this.flattenContract(name, download.filePath);
        if (!flattenedCode) {
            return { name, status: 'flatten_failed' };
        }
        
        // Prepare verification payload
        const payload = {
            compiler_version: sourceInfo.compilerVersion,
            license_type: 'mit',
            contract_name: sourceInfo.contractName,
            is_optimization_enabled: sourceInfo.optimization,
            optimization_runs: sourceInfo.runs,
            evm_version: sourceInfo.evmVersion,
            source_code: flattenedCode,
            autodetect_constructor_args: true
        };
        
        console.log(`  Compiler: ${payload.compiler_version}`);
        console.log(`  Optimization: ${payload.is_optimization_enabled} (${payload.optimization_runs} runs)`);
        console.log(`  EVM Version: ${payload.evm_version}`);
        
        // Submit verification
        try {
            const response = await fetch(
                `${this.explorerApiUrl}/smart-contracts/${address.toLowerCase()}/verification/via/flattened-code`,
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
                    return { name, status: 'verified' };
                } else {
                    console.log(`  Verification pending`);
                    return { name, status: 'pending' };
                }
            } else {
                console.error(`  Verification failed`);
                console.error(`  Status: ${response.status}`);
                if (typeof result === 'object' && result.message) {
                    console.error(`  Error: ${result.message}`);
                }
                return { name, status: 'failed', error: result };
            }
        } catch (error) {
            console.error(`  Error: ${error.message}`);
            return { name, status: 'error', error: error.message };
        }
    }

    async run() {
        await this.initialize();
        
        const results = [];
        
        for (const [name, contractInfo] of Object.entries(PREINSTALLED_CONTRACTS)) {
            const sourceInfo = CONTRACT_SOURCES[name];
            
            if (!sourceInfo) {
                console.log(`\n${name}: No source information available`);
                results.push({ name, status: 'no_source_info' });
                continue;
            }
            
            const result = await this.verifyContract(name, contractInfo.address, sourceInfo);
            results.push(result);
            
            // Delay between verifications
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
        // Summary
        console.log('\n==================================');
        console.log('Verification Summary');
        console.log('==================================');
        
        const verified = results.filter(r => r.status === 'verified' || r.status === 'already_verified');
        const pending = results.filter(r => r.status === 'pending');
        const failed = results.filter(r => !['verified', 'already_verified', 'pending'].includes(r.status));
        
        if (verified.length > 0) {
            console.log(`Verified: ${verified.map(r => r.name).join(', ')}`);
        }
        if (pending.length > 0) {
            console.log(`Pending: ${pending.map(r => r.name).join(', ')}`);
        }
        if (failed.length > 0) {
            console.log(`Failed: ${failed.map(r => `${r.name} (${r.status})`).join(', ')}`);
        }
        
        console.log(`\nView contracts at:`);
        for (const [name, contractInfo] of Object.entries(PREINSTALLED_CONTRACTS)) {
            console.log(`${name}: ${this.explorerUrl}/address/${contractInfo.address}`);
        }
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const verifier = new PreinstalledContractVerifier();
    verifier.run().catch(error => {
        console.error('\nVerification failed:', error.message);
        process.exit(1);
    });
}

export default PreinstalledContractVerifier;
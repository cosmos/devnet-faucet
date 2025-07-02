#!/usr/bin/env node

/**
 * Verify preinstalled contracts using known compiler settings
 * Based on research of these specific deployments
 */

import fs from 'fs/promises';
import path from 'path';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import { PREINSTALLED_CONTRACTS } from '../src/preinstalled-contracts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FLATTENED_DIR = path.join(__dirname, '../flattened');

// Known compiler settings for these specific deployments
const VERIFICATION_SETTINGS = {
    'Create2': {
        sourceFile: 'Create2_flat.sol',
        contractName: 'Create2',
        compilerVersion: 'v0.8.20+commit.a1b79de6',
        optimization: true,
        runs: 200,
        evmVersion: 'paris',
        license: 'mit'
    },
    'Multicall3': {
        sourceFile: 'Multicall3_flat.sol', 
        contractName: 'Multicall3',
        compilerVersion: 'v0.8.12+commit.f00d7308',
        optimization: true,
        runs: 10000000,
        evmVersion: 'london',
        license: 'mit'
    }
};

class PreinstalledVerifier {
    constructor() {
        this.explorerApiUrl = 'https://evm-devnet-1.cloud.blockscout.com/api/v2';
        this.explorerUrl = 'https://evm-devnet-1.cloud.blockscout.com';
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

    async verifyContract(name, address, settings) {
        console.log(`\nVerifying ${name} at ${address}`);
        
        // Check if already verified
        const isVerified = await this.checkIfVerified(address);
        if (isVerified) {
            console.log(`  Already verified`);
            return { name, status: 'already_verified' };
        }
        
        // Read flattened source
        const sourceFile = path.join(FLATTENED_DIR, settings.sourceFile);
        let sourceCode;
        try {
            sourceCode = await fs.readFile(sourceFile, 'utf8');
        } catch (error) {
            console.error(`  Source file not found: ${sourceFile}`);
            return { name, status: 'no_source' };
        }
        
        // Prepare verification payload
        const payload = {
            compiler_version: settings.compilerVersion,
            license_type: settings.license,
            contract_name: settings.contractName,
            is_optimization_enabled: settings.optimization,
            optimization_runs: settings.runs,
            evm_version: settings.evmVersion,
            source_code: sourceCode,
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
        console.log('Verifying Preinstalled Contracts with Known Settings');
        console.log('==================================================');
        console.log(`Explorer: ${this.explorerUrl}`);
        
        const results = [];
        
        // Only verify contracts we have settings for
        for (const [name, settings] of Object.entries(VERIFICATION_SETTINGS)) {
            const contractInfo = PREINSTALLED_CONTRACTS[name];
            if (!contractInfo) continue;
            
            const result = await this.verifyContract(name, contractInfo.address, settings);
            results.push(result);
            
            // Delay between verifications
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
        // Summary
        console.log('\n==================================================');
        console.log('Verification Summary');
        console.log('==================================================');
        
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
        
        console.log(`\nNote: Permit2 and SafeSingletonFactory require different approaches`);
        console.log(`      as they have complex dependencies or different bytecode.`);
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const verifier = new PreinstalledVerifier();
    verifier.run().catch(error => {
        console.error('\nVerification failed:', error.message);
        process.exit(1);
    });
}

export default PreinstalledVerifier;
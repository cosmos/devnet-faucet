#!/usr/bin/env node

/**
 * Script to verify contracts on Blockscout
 * This will flatten contracts and submit them for verification
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import FormData from 'form-data';
import config, { getEvmAddress, initializeSecureKeys } from '../config.js';
import TokenConfigLoader from '../src/TokenConfigLoader.js';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

class BlockscoutVerifier {
    constructor() {
        this.explorerApiUrl = 'https://evm-devnet-1.cloud.blockscout.com/api';
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
        console.log('🔍 Blockscout Contract Verification');
        console.log(`📍 Faucet Address: ${this.faucetAddress}`);
        console.log(`🌐 Explorer: ${this.explorerUrl}`);
    }

    async flattenContract(contractPath, outputPath) {
        console.log(`📄 Flattening ${path.basename(contractPath)}...`);
        
        try {
            // Create output directory if it doesn't exist
            await fs.mkdir(path.dirname(outputPath), { recursive: true });
            
            // Use forge flatten command
            const { stdout, stderr } = await execAsync(`forge flatten ${contractPath}`);
            
            if (stderr && !stderr.includes('Warning')) {
                throw new Error(`Flatten error: ${stderr}`);
            }
            
            // Write flattened content to file
            await fs.writeFile(outputPath, stdout);
            console.log(`✅ Flattened to: ${outputPath}`);
            
            return stdout;
        } catch (error) {
            console.error(`❌ Failed to flatten ${contractPath}: ${error.message}`);
            throw error;
        }
    }

    async checkVerificationStatus(address) {
        try {
            const response = await fetch(`${this.explorerApiUrl}?module=contract&action=getsourcecode&address=${address}`);
            const data = await response.json();
            
            if (data.status === '1' && data.result && data.result[0]) {
                const result = data.result[0];
                return result.SourceCode && result.SourceCode !== '';
            }
            return false;
        } catch (error) {
            console.error(`Error checking verification status: ${error.message}`);
            return false;
        }
    }

    async verifyContract(contractData) {
        const { address, name, sourceCode, constructorArgs = '', compilerVersion = 'v0.8.28+commit.7893614a', optimization = false, runs = 200 } = contractData;
        
        console.log(`\n🔍 Verifying ${name} at ${address}`);
        
        // Check if already verified
        const isVerified = await this.checkVerificationStatus(address);
        if (isVerified) {
            console.log(`✅ ${name} is already verified on Blockscout`);
            return true;
        }
        
        console.log(`📝 Submitting ${name} for verification...`);
        
        const formData = new FormData();
        formData.append('addressHash', address);
        formData.append('name', name);
        formData.append('compilerVersion', compilerVersion);
        formData.append('optimization', optimization ? 'true' : 'false');
        formData.append('optimizationRuns', runs.toString());
        formData.append('contractSourceCode', sourceCode);
        formData.append('constructorArguments', constructorArgs);
        formData.append('autodetectConstructorArguments', 'false');
        formData.append('evmVersion', 'paris'); // or 'london', 'berlin', etc.
        formData.append('licenseType', '3'); // MIT license
        
        try {
            const response = await fetch(`${this.explorerApiUrl}/v2/smart-contracts/${address}/verification/via/flattened-code`, {
                method: 'POST',
                body: formData,
                headers: formData.getHeaders()
            });
            
            const result = await response.json();
            
            if (response.ok) {
                console.log(`✅ ${name} verification submitted successfully!`);
                console.log(`   View at: ${this.explorerUrl}/address/${address}`);
                return true;
            } else {
                console.log(`❌ ${name} verification failed:`, result.message || 'Unknown error');
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
                sourcePath: path.join(__dirname, '../src/AtomicMultiSend.sol'),
                flattenedPath: path.join(__dirname, '../flattened/AtomicMultiSend_flat.sol'),
                constructorArgs: '' // No constructor args
            });
        }
        
        // Token contracts
        const tokens = this.tokenLoader.getErc20Tokens();
        for (const token of tokens) {
            contracts.push({
                address: token.erc20_contract,
                name: token.symbol,
                sourcePath: path.join(__dirname, `../src/tokens/${token.symbol}.sol`),
                flattenedPath: path.join(__dirname, `../flattened/${token.symbol}_flat.sol`),
                constructorArgs: this.encodeConstructorArgs(this.faucetAddress) // initialOwner parameter
            });
        }
        
        // Flatten all contracts
        console.log('\n📄 Flattening contracts...');
        for (const contract of contracts) {
            try {
                const flattenedCode = await this.flattenContract(contract.sourcePath, contract.flattenedPath);
                contract.sourceCode = flattenedCode;
            } catch (error) {
                console.error(`Failed to flatten ${contract.name}: ${error.message}`);
            }
        }
        
        // Verify all contracts
        console.log('\n🚀 Submitting contracts for verification...');
        const results = [];
        for (const contract of contracts) {
            if (contract.sourceCode) {
                const success = await this.verifyContract(contract);
                results.push({ name: contract.name, success });
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
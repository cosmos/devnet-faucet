#!/usr/bin/env node

/**
 * Contract verification and redeployment script
 * Ensures all contracts are deployed and under our control
 */

import 'dotenv/config';
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import TokenConfigLoader from '../src/TokenConfigLoader.js';
import config, { getEvmAddress, initializeSecureKeys } from '../config.js';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ERC20 ABI for ownership checks
const ERC20_ABI = [
    'function owner() external view returns (address)',
    'function balanceOf(address account) external view returns (uint256)',
    'function totalSupply() external view returns (uint256)',
    'function symbol() external view returns (string)',
    'function decimals() external view returns (uint8)',
    'function name() external view returns (string)'
];

// AtomicMultiSend ABI for ownership checks
const ATOMIC_MULTISEND_ABI = [
    'function owner() external view returns (address)',
    'function paused() external view returns (bool)'
];

class ContractVerifier {
    constructor() {
        this.provider = new ethers.JsonRpcProvider(config.blockchain.endpoints.evm_endpoint);
        this.networkConfig = {
            name: config.blockchain.name,
            chainId: config.blockchain.ids.chainId,
            cosmosChainId: config.blockchain.ids.cosmosChainId,
            type: config.blockchain.type
        };
        this.tokenLoader = new TokenConfigLoader(this.networkConfig);
        this.faucetAddress = null;
        this.needsRedeployment = [];
    }

    async initialize() {
        await initializeSecureKeys();
        this.faucetAddress = getEvmAddress();
        console.log('🔍 Contract Verification Started');
        console.log(`📍 Faucet Address: ${this.faucetAddress}`);
    }

    async checkContract(address, expectedOwner = null) {
        try {
            // Check if contract exists
            const code = await this.provider.getCode(address);
            if (code === '0x') {
                return { exists: false, isOwned: false };
            }

            // If we expect an owner, check ownership
            if (expectedOwner) {
                try {
                    const contract = new ethers.Contract(address, ['function owner() external view returns (address)'], this.provider);
                    const owner = await contract.owner();
                    const isOwned = owner.toLowerCase() === expectedOwner.toLowerCase();
                    return { exists: true, isOwned, actualOwner: owner };
                } catch (e) {
                    // Contract might not have owner function
                    return { exists: true, isOwned: null, error: 'No owner function' };
                }
            }

            return { exists: true, isOwned: null };
        } catch (error) {
            console.error(`Error checking contract ${address}:`, error.message);
            return { exists: false, isOwned: false, error: error.message };
        }
    }

    async verifyAtomicMultiSend() {
        console.log('\n📋 Verifying AtomicMultiSend Contract...');
        
        const atomicMultiSendAddress = this.tokenLoader.getFaucetConfig().atomicMultiSend;
        
        if (!atomicMultiSendAddress) {
            console.log('❌ No AtomicMultiSend address configured');
            this.needsRedeployment.push({ type: 'atomicMultiSend', reason: 'Not configured' });
            return false;
        }

        console.log(`  Address: ${atomicMultiSendAddress}`);
        const status = await this.checkContract(atomicMultiSendAddress, this.faucetAddress);

        if (!status.exists) {
            console.log('❌ Contract does not exist on chain');
            this.needsRedeployment.push({ type: 'atomicMultiSend', reason: 'Not deployed' });
            return false;
        }

        if (status.isOwned === false) {
            console.log(`❌ Contract not owned by faucet (owner: ${status.actualOwner})`);
            this.needsRedeployment.push({ type: 'atomicMultiSend', reason: 'Not owned by faucet' });
            return false;
        }

        console.log('✅ AtomicMultiSend verified and owned by faucet');
        return true;
    }

    async verifyTokenContracts() {
        console.log('\n🪙 Verifying Token Contracts...');
        
        const tokens = this.tokenLoader.getErc20Tokens();
        let allValid = true;

        for (const token of tokens) {
            console.log(`\n  Checking ${token.symbol}...`);
            console.log(`  Address: ${token.erc20_contract}`);

            const status = await this.checkContract(token.erc20_contract, this.faucetAddress);

            if (!status.exists) {
                console.log(`  ❌ Contract does not exist`);
                this.needsRedeployment.push({ 
                    type: 'token', 
                    symbol: token.symbol, 
                    reason: 'Not deployed' 
                });
                allValid = false;
                continue;
            }

            // Verify token properties
            try {
                const contract = new ethers.Contract(token.erc20_contract, ERC20_ABI, this.provider);
                const [symbol, decimals, totalSupply] = await Promise.all([
                    contract.symbol(),
                    contract.decimals(),
                    contract.totalSupply()
                ]);

                if (symbol !== token.symbol) {
                    console.log(`  ❌ Symbol mismatch (expected: ${token.symbol}, actual: ${symbol})`);
                    this.needsRedeployment.push({ 
                        type: 'token', 
                        symbol: token.symbol, 
                        reason: 'Symbol mismatch' 
                    });
                    allValid = false;
                    continue;
                }

                if (Number(decimals) !== Number(token.decimals)) {
                    console.log(`  ❌ Decimals mismatch (expected: ${token.decimals}, actual: ${decimals})`);
                    this.needsRedeployment.push({ 
                        type: 'token', 
                        symbol: token.symbol, 
                        reason: 'Decimals mismatch' 
                    });
                    allValid = false;
                    continue;
                }

                // Check ownership
                if (status.isOwned === false) {
                    console.log(`  ❌ Not owned by faucet (owner: ${status.actualOwner})`);
                    this.needsRedeployment.push({ 
                        type: 'token', 
                        symbol: token.symbol, 
                        reason: 'Not owned by faucet' 
                    });
                    allValid = false;
                    continue;
                }

                console.log(`  ✅ ${token.symbol} verified`);
                console.log(`     Symbol: ${symbol}`);
                console.log(`     Decimals: ${decimals}`);
                console.log(`     Total Supply: ${ethers.formatUnits(totalSupply, decimals)}`);

            } catch (error) {
                console.log(`  ❌ Error verifying token: ${error.message}`);
                this.needsRedeployment.push({ 
                    type: 'token', 
                    symbol: token.symbol, 
                    reason: 'Verification error' 
                });
                allValid = false;
            }
        }

        return allValid;
    }

    async redeployContracts() {
        if (this.needsRedeployment.length === 0) {
            return true;
        }

        console.log('\n🔄 Redeployment Required');
        console.log('The following contracts need redeployment:');
        
        for (const item of this.needsRedeployment) {
            if (item.type === 'atomicMultiSend') {
                console.log(`  - AtomicMultiSend: ${item.reason}`);
            } else if (item.type === 'token') {
                console.log(`  - ${item.symbol}: ${item.reason}`);
            }
        }

        console.log('\n🚀 Starting redeployment...');

        try {
            // Run the deployment script
            const { stdout, stderr } = await execAsync('node scripts/automated-deploy.js');
            
            if (stderr) {
                console.error('Deployment stderr:', stderr);
            }

            console.log('\n✅ Redeployment completed successfully');
            
            // Clear the redeployment list
            this.needsRedeployment = [];
            
            // Re-verify to ensure everything is correct
            console.log('\n🔍 Re-verifying contracts after deployment...');
            const atomicMultiSendValid = await this.verifyAtomicMultiSend();
            const tokensValid = await this.verifyTokenContracts();

            return atomicMultiSendValid && tokensValid;

        } catch (error) {
            console.error('\n❌ Redeployment failed:', error.message);
            throw error;
        }
    }

    async verify() {
        await this.initialize();

        // Verify all contracts
        const atomicMultiSendValid = await this.verifyAtomicMultiSend();
        const tokensValid = await this.verifyTokenContracts();

        if (!atomicMultiSendValid || !tokensValid) {
            console.log('\n⚠️  Some contracts need redeployment');
            
            // Optionally auto-redeploy or prompt user
            if (process.env.AUTO_REDEPLOY === 'true') {
                return await this.redeployContracts();
            } else {
                console.log('\nTo automatically redeploy, run with AUTO_REDEPLOY=true');
                return false;
            }
        }

        console.log('\n✅ All contracts verified successfully!');
        return true;
    }
}

// Export for use in other scripts
export default ContractVerifier;

// Run verification if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const verifier = new ContractVerifier();
    
    verifier.verify()
        .then(success => {
            if (success) {
                console.log('\n✅ Contract verification complete');
                process.exit(0);
            } else {
                console.log('\n❌ Contract verification failed');
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('\n❌ Verification error:', error.message);
            process.exit(1);
        });
}
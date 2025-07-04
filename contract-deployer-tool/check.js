#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { ethers } from 'ethers';
import { config, getProvider } from './config.js';

const DEPLOYMENTS_DIR = './deployments';

async function checkContracts() {
    console.log('Contract Status Check');
    console.log('====================');
    console.log(`Network: ${config.chainId}`);
    console.log(`RPC: ${config.rpcUrl}`);
    console.log('');
    
    const provider = getProvider();
    
    // Check preinstalled contracts
    console.log('Preinstalled Contracts:');
    try {
        const preinstalledFile = path.join(DEPLOYMENTS_DIR, 'preinstalled.json');
        const data = await fs.readFile(preinstalledFile, 'utf8');
        const preinstalled = JSON.parse(data);
        
        for (const [name, contract] of Object.entries(preinstalled.contracts)) {
            const code = await provider.getCode(contract.address);
            const hasCode = code !== '0x';
            console.log(`  ${name}: ${contract.address} ${hasCode ? '[DEPLOYED]' : '[NOT FOUND]'}`);
        }
    } catch (error) {
        console.log('  No preinstalled contracts file found');
    }
    
    // Check deployed contracts
    console.log('\nDeployed Contracts:');
    try {
        const deploymentFile = path.join(DEPLOYMENTS_DIR, `${config.chainId}.json`);
        const data = await fs.readFile(deploymentFile, 'utf8');
        const deployments = JSON.parse(data);
        
        if (Object.keys(deployments).length === 0) {
            console.log('  No contracts deployed yet');
        } else {
            for (const [name, deployment] of Object.entries(deployments)) {
                const code = await provider.getCode(deployment.address);
                const hasCode = code !== '0x';
                console.log(`  ${name}: ${deployment.address} ${hasCode ? '[DEPLOYED]' : '[MISSING]'}`);
                if (deployment.blockNumber) {
                    console.log(`    Block: ${deployment.blockNumber}`);
                }
            }
        }
    } catch (error) {
        console.log('  No deployments found for this network');
    }
    
    // Check Blockscout verification
    if (config.explorerApiUrl) {
        console.log('\nVerification Status:');
        const allContracts = [];
        
        // Add deployed contracts
        try {
            const deploymentFile = path.join(DEPLOYMENTS_DIR, `${config.chainId}.json`);
            const data = await fs.readFile(deploymentFile, 'utf8');
            const deployments = JSON.parse(data);
            Object.entries(deployments).forEach(([name, deployment]) => {
                allContracts.push({ name, address: deployment.address });
            });
        } catch {}
        
        if (allContracts.length > 0) {
            for (const contract of allContracts) {
                try {
                    const response = await fetch(`${config.explorerApiUrl}/smart-contracts/${contract.address.toLowerCase()}`);
                    const data = await response.json();
                    const verified = data.is_verified === true;
                    console.log(`  ${contract.name}: ${verified ? '[VERIFIED]' : '[NOT VERIFIED]'}`);
                } catch (error) {
                    console.log(`  ${contract.name}: [UNABLE TO CHECK]`);
                }
            }
        } else {
            console.log('  No contracts to check');
        }
    }
}

// Run check
checkContracts().catch(error => {
    console.error('\nError:', error.message);
    process.exit(1);
});
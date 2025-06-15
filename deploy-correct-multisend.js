#!/usr/bin/env node

import { ethers } from 'ethers';
import fs from 'fs';
import config from './config.js';
import { pathToString } from '@cosmjs/crypto';

// Generate deployer wallet from centralized config
const deployerWallet = ethers.HDNodeWallet.fromPhrase(
  config.blockchain.sender.mnemonic,
  undefined,
  pathToString(config.blockchain.sender.option.hdPaths[0])
);

async function deployCorrectMultiSend() {
    console.log('[DEPLOY] Deploying correct MultiSend contract...');
    console.log('RPC:', config.blockchain.endpoints.evm_endpoint);
    console.log('Deployer:', deployerWallet.address);
    
    const provider = new ethers.JsonRpcProvider(config.blockchain.endpoints.evm_endpoint);
    const wallet = deployerWallet.connect(provider);
    
    // Load the correct contract artifact
    const artifactPath = './out/MultiSend.sol/MultiSend.json';
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    
    // Create contract factory
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode.object, wallet);
    
    console.log('[DEPLOY] Deploying contract...');
    const contract = await factory.deploy({
        gasLimit: 2000000,
        gasPrice: ethers.parseUnits('20', 'gwei')
    });
    
    console.log('[DEPLOY] Waiting for deployment...');
    await contract.waitForDeployment();
    
    const contractAddress = await contract.getAddress();
    console.log('[SUCCESS] MultiSend deployed to:', contractAddress);
    
    // Verify ownership
    const owner = await contract.owner();
    console.log('[VERIFY] Contract owner:', owner);
    console.log('[VERIFY] Expected owner:', wallet.address);
    console.log('[VERIFY] Ownership correct:', owner.toLowerCase() === wallet.address.toLowerCase());
    
    // Update config file to use new address
    console.log('\n[UPDATE] Updating config with new MultiSend address...');
    console.log('Old address:', config.blockchain.contracts.multiSend);
    console.log('New address:', contractAddress);
    
    return contractAddress;
}

// Run deployment
deployCorrectMultiSend()
    .then(address => {
        console.log('\n[COMPLETE] Deployment successful!');
        console.log('[NEXT] Update config.js with new address:', address);
        process.exit(0);
    })
    .catch(error => {
        console.error('[ERROR] Deployment failed:', error);
        process.exit(1);
    });
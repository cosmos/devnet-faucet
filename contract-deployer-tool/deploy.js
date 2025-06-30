#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { ethers } from 'ethers';
import { execSync } from 'child_process';
import { config, getWallet } from './config.js';

const CONTRACTS_DIR = './contracts';
const DEPLOYMENTS_DIR = './deployments';
const OUT_DIR = './out';

class ContractDeployer {
    constructor() {
        this.wallet = getWallet();
        this.deployments = {};
    }

    async initialize() {
        console.log('Contract Deployment Tool');
        console.log('========================');
        console.log(`Deployer: ${this.wallet.address}`);
        console.log(`Network: ${config.chainId}`);
        console.log(`RPC: ${config.rpcUrl}`);
        
        // Check dependencies
        await this.checkDependencies();
        
        // Check balance
        const balance = await this.wallet.provider.getBalance(this.wallet.address);
        console.log(`Balance: ${ethers.formatEther(balance)} ETH`);
        
        if (balance === 0n) {
            throw new Error('Deployer has no ETH balance');
        }
        
        // Create directories
        await fs.mkdir(DEPLOYMENTS_DIR, { recursive: true });
        
        // Load existing deployments
        await this.loadDeployments();
    }
    
    async checkDependencies() {
        // Check if OpenZeppelin is needed
        try {
            const contracts = await this.findContracts();
            let needsOpenZeppelin = false;
            
            for (const contract of contracts) {
                const content = await fs.readFile(contract.path, 'utf8');
                if (content.includes('@openzeppelin/contracts')) {
                    needsOpenZeppelin = true;
                    break;
                }
            }
            
            if (needsOpenZeppelin) {
                try {
                    await fs.access('./node_modules/@openzeppelin/contracts');
                    console.log('OpenZeppelin contracts found');
                } catch {
                    console.log('Installing OpenZeppelin contracts...');
                    execSync('npm install --save-dev @openzeppelin/contracts', { stdio: 'inherit' });
                }
            }
        } catch (error) {
            // No contracts to check yet
        }
    }

    async loadDeployments() {
        const deploymentFile = path.join(DEPLOYMENTS_DIR, `${config.chainId}.json`);
        try {
            const data = await fs.readFile(deploymentFile, 'utf8');
            this.deployments = JSON.parse(data);
            console.log(`Loaded ${Object.keys(this.deployments).length} existing deployments`);
        } catch (error) {
            console.log('No existing deployments found');
            this.deployments = {};
        }
        
        // Load preinstalled contracts
        await this.loadPreinstalledContracts();
    }
    
    async loadPreinstalledContracts() {
        try {
            const preinstalledFile = path.join(DEPLOYMENTS_DIR, 'preinstalled.json');
            const data = await fs.readFile(preinstalledFile, 'utf8');
            const preinstalled = JSON.parse(data);
            
            console.log('Checking preinstalled contracts...');
            for (const [name, contract] of Object.entries(preinstalled.contracts)) {
                const code = await this.wallet.provider.getCode(contract.address);
                if (code !== '0x') {
                    console.log(`  Found preinstalled: ${name} at ${contract.address}`);
                }
            }
        } catch (error) {
            // No preinstalled file, skip
        }
    }

    async saveDeployments() {
        const deploymentFile = path.join(DEPLOYMENTS_DIR, `${config.chainId}.json`);
        await fs.writeFile(deploymentFile, JSON.stringify(this.deployments, null, 2));
    }

    async findContracts() {
        const contracts = [];
        
        try {
            const items = await fs.readdir(CONTRACTS_DIR);
            
            for (const item of items) {
                const itemPath = path.join(CONTRACTS_DIR, item);
                const stat = await fs.stat(itemPath);
                
                if (stat.isFile() && item.endsWith('.sol')) {
                    contracts.push({
                        name: path.basename(item, '.sol'),
                        path: itemPath
                    });
                } else if (stat.isDirectory()) {
                    // Check directory for .sol files
                    const files = await fs.readdir(itemPath);
                    for (const file of files) {
                        if (file.endsWith('.sol')) {
                            contracts.push({
                                name: path.basename(file, '.sol'),
                                path: path.join(itemPath, file)
                            });
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`Error reading contracts directory: ${error.message}`);
        }
        
        return contracts;
    }

    async compileContracts() {
        console.log('\nCompiling contracts...');
        
        // Check if Foundry is installed
        try {
            execSync('forge --version', { stdio: 'ignore' });
        } catch {
            throw new Error('Foundry not installed. Install it with: curl -L https://foundry.paradigm.xyz | bash && foundryup');
        }
        
        try {
            execSync('forge build', { stdio: 'inherit' });
            console.log('Compilation successful');
        } catch (error) {
            throw new Error(`Compilation failed: ${error.message}`);
        }
    }

    async getContractArtifact(contractName) {
        const artifactPath = path.join(OUT_DIR, `${contractName}.sol`, `${contractName}.json`);
        try {
            const artifact = JSON.parse(await fs.readFile(artifactPath, 'utf8'));
            return artifact;
        } catch (error) {
            throw new Error(`Could not find artifact for ${contractName}: ${error.message}`);
        }
    }

    async checkIfDeployed(contractName) {
        if (this.deployments[contractName]) {
            const address = this.deployments[contractName].address;
            const code = await this.wallet.provider.getCode(address);
            if (code !== '0x') {
                return true;
            }
        }
        return false;
    }

    async deployContract(contract) {
        console.log(`\nDeploying ${contract.name}...`);
        
        const artifact = await this.getContractArtifact(contract.name);
        const factory = new ethers.ContractFactory(
            artifact.abi,
            artifact.bytecode,
            this.wallet
        );
        
        // Determine constructor arguments
        const constructorArgs = await this.getConstructorArgs(contract.name);
        
        console.log(`  Gas Price: ${config.gasPrice ? ethers.formatUnits(config.gasPrice, 'gwei') + ' gwei' : 'auto'}`);
        console.log(`  Gas Limit: ${config.gasLimit}`);
        if (constructorArgs.length > 0) {
            console.log(`  Constructor Args: ${constructorArgs.join(', ')}`);
        }
        
        const deployTx = await factory.deploy(...constructorArgs, {
            gasPrice: config.gasPrice,
            gasLimit: config.gasLimit
        });
        
        console.log(`  Transaction: ${deployTx.deploymentTransaction().hash}`);
        console.log(`  Waiting for confirmation...`);
        
        const deployedContract = await deployTx.waitForDeployment();
        const address = await deployedContract.getAddress();
        const receipt = await deployTx.deploymentTransaction().wait(config.confirmations);
        
        console.log(`  Deployed to: ${address}`);
        console.log(`  Gas Used: ${receipt.gasUsed.toString()}`);
        
        // Save deployment info
        this.deployments[contract.name] = {
            address: address,
            transactionHash: receipt.hash,
            blockNumber: receipt.blockNumber,
            gasUsed: receipt.gasUsed.toString(),
            deployer: this.wallet.address,
            constructorArgs: constructorArgs,
            timestamp: new Date().toISOString()
        };
        
        await this.saveDeployments();
        
        return address;
    }

    async getConstructorArgs(contractName) {
        // Check for constructor args file
        const argsFile = path.join(CONTRACTS_DIR, `${contractName}.args.json`);
        try {
            const args = JSON.parse(await fs.readFile(argsFile, 'utf8'));
            return args;
        } catch {
            // No args file, check common patterns
            if (contractName.includes('Token') || ['WBTC', 'USDT', 'PEPE', 'USDC', 'DAI'].includes(contractName)) {
                // Token contracts often need an initial owner
                return [this.wallet.address];
            }
            return [];
        }
    }

    async run() {
        await this.initialize();
        
        const contracts = await this.findContracts();
        if (contracts.length === 0) {
            console.log('\nNo contracts found in ./contracts directory');
            return;
        }
        
        console.log(`\nFound ${contracts.length} contract(s):`);
        contracts.forEach(c => console.log(`  - ${c.name} (${c.path})`));
        
        // Compile all contracts
        await this.compileContracts();
        
        // Deploy contracts
        const deployed = [];
        const skipped = [];
        
        for (const contract of contracts) {
            const isDeployed = await this.checkIfDeployed(contract.name);
            
            if (isDeployed) {
                console.log(`\n${contract.name} already deployed at ${this.deployments[contract.name].address}`);
                skipped.push(contract.name);
            } else {
                try {
                    await this.deployContract(contract);
                    deployed.push(contract.name);
                } catch (error) {
                    console.error(`Failed to deploy ${contract.name}: ${error.message}`);
                }
            }
        }
        
        // Summary
        console.log('\n========================');
        console.log('Deployment Summary');
        console.log('========================');
        if (deployed.length > 0) {
            console.log(`Deployed: ${deployed.join(', ')}`);
        }
        if (skipped.length > 0) {
            console.log(`Skipped (already deployed): ${skipped.join(', ')}`);
        }
        
        console.log(`\nDeployments saved to: ${path.join(DEPLOYMENTS_DIR, `${config.chainId}.json`)}`);
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const deployer = new ContractDeployer();
    deployer.run().catch(error => {
        console.error('\nDeployment failed:', error.message);
        process.exit(1);
    });
}
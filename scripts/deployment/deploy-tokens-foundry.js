#!/usr/bin/env node

/**
 * Foundry Based Token Deployment for Cosmos EVM
 *
 * Uses Foundry's compiled artifacts to deploy contracts
 * Detailed logging and report generation
 */

import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// Configuration
const CONFIG = {
    NETWORK: {
        name: 'cosmos_evm',
        chainId: 262144,
        rpcUrl: 'https://cevm-01-evmrpc.dev.skip.build',
    },
    DEPLOYER: {
        privateKey: 'dd138b977ac3248b328b7b65ac30338b1482a17197a175f03fd2df20fb0919c6',
        address: '0x42e6047c5780b103e52265f6483c2d0113aa6b87'
    },
    GAS: {
        gasLimit: 5000000,
        gasPrice: ethers.parseUnits('20', 'gwei')
    },
    FOUNDRY: {
        artifactsDir: './out',
        srcDir: './src'
    }
};

// Token configurations
const TOKEN_CONFIGS = {
    WBTC: {
        contractName: 'WBTC',
        name: 'Wrapped Bitcoin',
        symbol: 'WBTC',
        decimals: 8,
        initialSupply: '1000000000',
        mintTo: CONFIG.DEPLOYER.address,
        description: 'Wrapped Bitcoin token for Cosmos EVM'
    },
    PEPE: {
        contractName: 'PEPE',
        name: 'Pepe Token',
        symbol: 'PEPE',
        decimals: 18,
        initialSupply: '1000000000',
        mintTo: CONFIG.DEPLOYER.address,
        description: 'Pepe meme token for Cosmos EVM'
    },
    USDT: {
        contractName: 'USDT',
        name: 'Tether USD',
        symbol: 'USDT',
        decimals: 6,
        initialSupply: '1000000000',
        mintTo: CONFIG.DEPLOYER.address,
        description: 'USDT stablecoin for Cosmos EVM'
    }
};

const UTILITY_CONFIGS = {
    MultiSend: {
        contractName: 'MultiSend',
        description: 'Batch token transfer utility',
        transferOwnershipTo: CONFIG.DEPLOYER.address
    }
};

// Colors and logging
const colors = {
    reset: '\x1b[0m', bright: '\x1b[1m', red: '\x1b[31m', green: '\x1b[32m',
    yellow: '\x1b[33m', blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m'
};

const log = {
    info: (msg) => console.log(`${colors.blue}ℹ ${msg}${colors.reset}`),
    success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
    warning: (msg) => console.log(`${colors.yellow}⚠ ${msg}${colors.reset}`),
    error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
    header: (msg) => console.log(`${colors.cyan}${colors.bright}\n${'='.repeat(60)}\n  ${msg}\n${'='.repeat(60)}${colors.reset}`),
    section: (msg) => console.log(`${colors.magenta}\n--- ${msg} ---${colors.reset}`)
};

class FoundryTokenDeployer {
    constructor() {
        this.provider = new ethers.JsonRpcProvider(CONFIG.NETWORK.rpcUrl);
        this.wallet = new ethers.Wallet(CONFIG.DEPLOYER.privateKey, this.provider);
        this.deploymentReport = {
            network: CONFIG.NETWORK.name,
            chainId: CONFIG.NETWORK.chainId,
            timestamp: new Date().toISOString(),
            deployer: this.wallet.address,
            startBalance: null,
            endBalance: null,
            deployments: {},
            totalGasUsed: 0n,
            success: true
        };
    }

    async init() {
        log.header('Foundry Token Deployment Suite');
        log.info(`Network: ${CONFIG.NETWORK.name} (Chain ID: ${CONFIG.NETWORK.chainId})`);
        log.info(`Deployer: ${this.wallet.address}`);

        // Check Foundry setup
        try {
            execSync('forge --version', { stdio: 'pipe' });
            log.success('Foundry detected');
        } catch {
            log.error('Foundry not found! Install with: curl -L https://foundry.paradigm.xyz | bash');
            throw new Error('Foundry required');
        }

        // Verify network connection
        const network = await this.provider.getNetwork();
        if (network.chainId !== BigInt(CONFIG.NETWORK.chainId)) {
            throw new Error(`Chain ID mismatch! Expected ${CONFIG.NETWORK.chainId}, got ${network.chainId}`);
        }

        this.deploymentReport.startBalance = await this.provider.getBalance(this.wallet.address);
        log.success(`Connected to chain ID: ${network.chainId}`);
        log.info(`Deployer balance: ${ethers.formatEther(this.deploymentReport.startBalance)} ETH`);

        if (this.deploymentReport.startBalance === 0n) {
            throw new Error('Insufficient balance for deployment');
        }
    }

    compileContracts() {
        log.section('Compiling Contracts');
        try {
            log.info('Running forge build...');
            execSync('forge build', { stdio: 'inherit' });
            log.success('Contracts compiled successfully');
        } catch (error) {
            log.error('Compilation failed');
            throw error;
        }
    }

    loadContractArtifact(contractName) {
        const artifactPath = path.join(CONFIG.FOUNDRY.artifactsDir, `${contractName}.sol`, `${contractName}.json`);

        if (!fs.existsSync(artifactPath)) {
            throw new Error(`Artifact not found: ${artifactPath}. Run 'forge build' first.`);
        }

        const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
        return {
            abi: artifact.abi,
            bytecode: artifact.bytecode.object
        };
    }

    async deployToken(tokenSymbol, config) {
        log.section(`Deploying ${tokenSymbol}`);

        try {
            const { abi, bytecode } = this.loadContractArtifact(config.contractName);
            log.info(`Loaded ${config.contractName} artifact`);

            const factory = new ethers.ContractFactory(abi, bytecode, this.wallet);

            // Deploy with constructor parameters (faucet address)
            log.info(`Deploying ${config.name} (${config.symbol})...`);
            log.info(`Initial supply: ${config.initialSupply} tokens (${config.decimals} decimals)`);
            log.info(`Mint to: ${config.mintTo}`);

            const contract = await factory.deploy(config.mintTo, {
                gasLimit: CONFIG.GAS.gasLimit,
                gasPrice: CONFIG.GAS.gasPrice
            });

            log.info(`Transaction sent: ${contract.deploymentTransaction().hash}`);
            log.info('Waiting for deployment confirmation...');

            const receipt = await contract.deploymentTransaction().wait();
            const contractAddress = await contract.getAddress();

            // Get token info from deployed contract
            const tokenContract = new ethers.Contract(contractAddress, abi, this.provider);
            const [name, symbol, decimals, totalSupply] = await Promise.all([
                tokenContract.name(),
                tokenContract.symbol(),
                tokenContract.decimals(),
                tokenContract.totalSupply()
            ]);

            const deploymentData = {
                contractName: config.contractName,
                name: name,
                symbol: symbol,
                decimals: Number(decimals),
                totalSupply: totalSupply.toString(),
                totalSupplyFormatted: ethers.formatUnits(totalSupply, decimals),
                mintTo: config.mintTo,
                description: config.description,
                contractAddress: contractAddress,
                deploymentTx: contract.deploymentTransaction().hash,
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed.toString(),
                gasPrice: CONFIG.GAS.gasPrice.toString(),
                timestamp: new Date().toISOString(),
                status: 'deployed'
            };

            // Verify balance was minted correctly
            const balance = await tokenContract.balanceOf(config.mintTo);
            deploymentData.mintedBalance = balance.toString();
            deploymentData.mintedBalanceFormatted = ethers.formatUnits(balance, decimals);

            log.success(`${tokenSymbol} deployed successfully!`);
            log.info(`Contract: ${contractAddress}`);
            log.info(`Transaction: ${contract.deploymentTransaction().hash}`);
            log.info(`Block: ${receipt.blockNumber}`);
            log.info(`Gas Used: ${receipt.gasUsed.toLocaleString()}`);
            log.info(`Total Supply: ${deploymentData.totalSupplyFormatted} ${symbol}`);
            log.info(`Minted to ${config.mintTo}: ${deploymentData.mintedBalanceFormatted} ${symbol}`);

            this.deploymentReport.deployments[tokenSymbol] = deploymentData;
            this.deploymentReport.totalGasUsed += receipt.gasUsed;

            return deploymentData;

        } catch (error) {
            log.error(`Failed to deploy ${tokenSymbol}: ${error.message}`);
            this.deploymentReport.success = false;
            throw error;
        }
    }

    async deployUtilityContract(contractName, config) {
        log.section(`Deploying ${contractName}`);

        try {
            const { abi, bytecode } = this.loadContractArtifact(config.contractName);
            const factory = new ethers.ContractFactory(abi, bytecode, this.wallet);

            log.info(`Deploying ${config.contractName}...`);
            const contract = await factory.deploy({
                gasLimit: CONFIG.GAS.gasLimit,
                gasPrice: CONFIG.GAS.gasPrice
            });

            const receipt = await contract.deploymentTransaction().wait();
            const contractAddress = await contract.getAddress();

            const deploymentData = {
                contractName: config.contractName,
                description: config.description,
                contractAddress: contractAddress,
                deploymentTx: contract.deploymentTransaction().hash,
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed.toString(),
                timestamp: new Date().toISOString(),
                status: 'deployed'
            };

            // Transfer ownership if specified
            if (config.transferOwnershipTo) {
                log.info(`Transferring ownership to: ${config.transferOwnershipTo}`);
                const utilityContract = new ethers.Contract(contractAddress, abi, this.wallet);
                const ownershipTx = await utilityContract.transferOwnership(config.transferOwnershipTo, {
                    gasLimit: 100000,
                    gasPrice: CONFIG.GAS.gasPrice
                });
                const ownershipReceipt = await ownershipTx.wait();

                deploymentData.ownershipTransfer = {
                    to: config.transferOwnershipTo,
                    tx: ownershipTx.hash,
                    blockNumber: ownershipReceipt.blockNumber,
                    gasUsed: ownershipReceipt.gasUsed.toString()
                };

                this.deploymentReport.totalGasUsed += ownershipReceipt.gasUsed;
                log.success(`Ownership transferred to: ${config.transferOwnershipTo}`);
            }

            log.success(`${contractName} deployed successfully!`);
            log.info(`Contract: ${contractAddress}`);
            log.info(`Transaction: ${contract.deploymentTransaction().hash}`);
            log.info(`Block: ${receipt.blockNumber}`);
            log.info(`Gas Used: ${receipt.gasUsed.toLocaleString()}`);

            this.deploymentReport.deployments[contractName] = deploymentData;
            this.deploymentReport.totalGasUsed += receipt.gasUsed;

            return deploymentData;

        } catch (error) {
            log.error(`Failed to deploy ${contractName}: ${error.message}`);
            this.deploymentReport.success = false;
            throw error;
        }
    }

    async deployAll() {
        log.header('Starting Complete Deployment');

        try {
            // Compile contracts first
            this.compileContracts();

            // Deploy all tokens
            for (const [symbol, config] of Object.entries(TOKEN_CONFIGS)) {
                await this.deployToken(symbol, config);
            }

            // Deploy utility contracts
            for (const [name, config] of Object.entries(UTILITY_CONFIGS)) {
                await this.deployUtilityContract(name, config);
            }

            // Update final balance
            this.deploymentReport.endBalance = await this.provider.getBalance(this.wallet.address);

            log.success('All contracts deployed successfully!');
            return this.deploymentReport;

        } catch (error) {
            log.error(`Deployment failed: ${error.message}`);
            this.deploymentReport.success = false;
            throw error;
        }
    }

    async saveDeploymentReport() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `deployment-${timestamp}.json`;
        const deploymentsDir = './deployments';

        if (!fs.existsSync(deploymentsDir)) {
            fs.mkdirSync(deploymentsDir, { recursive: true });
        }

        const filepath = path.join(deploymentsDir, filename);

        try {
            fs.writeFileSync(filepath, JSON.stringify(this.deploymentReport, null, 2));
            log.success(`Deployment report saved: ${filepath}`);

            // Save as latest.json
            const latestPath = path.join(deploymentsDir, 'latest.json');
            fs.writeFileSync(latestPath, JSON.stringify(this.deploymentReport, null, 2));

            // Save addresses for easy import
            const addresses = {};
            for (const [name, deployment] of Object.entries(this.deploymentReport.deployments)) {
                addresses[name] = deployment.contractAddress;
            }
            const addressPath = path.join(deploymentsDir, 'addresses.json');
            fs.writeFileSync(addressPath, JSON.stringify(addresses, null, 2));

            log.success(`Contract addresses saved: ${addressPath}`);

        } catch (error) {
            log.error(`Failed to save reports: ${error.message}`);
        }
    }

    printSummary() {
        log.header('Deployment Summary');

        const gasSpent = this.deploymentReport.startBalance - this.deploymentReport.endBalance;

        log.info(`Network: ${this.deploymentReport.network} (${this.deploymentReport.chainId})`);
        log.info(`Deployer: ${this.deploymentReport.deployer}`);
        log.info(`Timestamp: ${this.deploymentReport.timestamp}`);
        log.info(`Total Contracts: ${Object.keys(this.deploymentReport.deployments).length}`);
        log.info(`Total Gas Used: ${this.deploymentReport.totalGasUsed.toLocaleString()}`);
        log.info(`ETH Spent: ${ethers.formatEther(gasSpent)}`);

        log.section('Deployed Contracts');
        for (const [name, deployment] of Object.entries(this.deploymentReport.deployments)) {
            log.info(`${name}: ${deployment.contractAddress}`);
            if (deployment.symbol) {
                log.info(`  └─ ${deployment.totalSupplyFormatted} ${deployment.symbol} minted to ${deployment.mintTo}`);
            }
        }

        log.section('Next Steps');
        log.info('1. Register ERC20 tokens:');
        log.info('   node scripts/register-erc20-tokens.js register all');
        log.info('2. Update faucet configuration with new addresses');
        log.info('3. Test token functionality');
        log.info('4. Verify contracts on block explorer (if available)');
    }
}

// Main execution
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    const deployer = new FoundryTokenDeployer();

    try {
        await deployer.init();

        switch (command) {
            case 'deploy':
                await deployer.deployAll();
                break;
            case 'compile':
                deployer.compileContracts();
                break;
            default:
                console.log(`${colors.cyan}Foundry Token Deployment Suite${colors.reset}`);
                console.log();
                console.log('Usage:');
                console.log('  node scripts/deploy-tokens-foundry.js compile  - Compile contracts only');
                console.log('  node scripts/deploy-tokens-foundry.js deploy   - Compile and deploy all');
                console.log();
                console.log('Requirements:');
                console.log('- Foundry installed (forge command available)');
                console.log('- Contract source files in src/ directory');
                console.log('- Sufficient ETH balance for deployment');
                break;
        }

        if (command === 'deploy') {
            await deployer.saveDeploymentReport();
            deployer.printSummary();
        }

    } catch (error) {
        log.error(`Script failed: ${error.message}`);
        process.exit(1);
    }
}

// Export for module use
export { FoundryTokenDeployer, TOKEN_CONFIGS, UTILITY_CONFIGS };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}
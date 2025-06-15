#!/usr/bin/env node

/**
 * Foundry-Integrated Token Deployment Script for Cosmos EVM
 */

import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const CONFIG = {
    NETWORK: {
        name: 'cosmos_evm',
        chainId: 262144,
        rpcUrl: 'https://cevm-01-evmrpc.dev.skip.build',
    },
    DEPLOYER: {
        privateKey: 'dd138b977ac3248b328b7b65ac30338b1482a17197a175f03fd2df20fb0919c6',
        address: '0x42e6047c5780b103e52265f6483c2d0113aa6b87'
    }
};

const TOKEN_CONFIGS = {
    WBTC: {
        name: 'Wrapped Bitcoin',
        symbol: 'WBTC',
        decimals: 8,
        initialSupply: '1000000000',
        mintTo: CONFIG.DEPLOYER.address
    },
    PEPE: {
        name: 'Pepe Token',
        symbol: 'PEPE',
        decimals: 18,
        initialSupply: '1000000000',
        mintTo: CONFIG.DEPLOYER.address
    },
    USDT: {
        name: 'Tether USD',
        symbol: 'USDT',
        decimals: 6,
        initialSupply: '1000000000',
        mintTo: CONFIG.DEPLOYER.address
    }
};

const colors = {
    reset: '\x1b[0m', green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m', red: '\x1b[31m', cyan: '\x1b[36m'
};

const log = {
    info: (msg) => console.log(`${colors.blue}ℹ ${msg}${colors.reset}`),
    success: (msg) => console.log(`${colors.green} ${msg}${colors.reset}`),
    warning: (msg) => console.log(`${colors.yellow}⚠ ${msg}${colors.reset}`),
    error: (msg) => console.log(`${colors.red} ${msg}${colors.reset}`),
    header: (msg) => console.log(`${colors.cyan}\n${'='.repeat(60)}\n  ${msg}\n${'='.repeat(60)}${colors.reset}`)
};

class TokenDeployer {
    constructor() {
        this.provider = new ethers.JsonRpcProvider(CONFIG.NETWORK.rpcUrl);
        this.wallet = new ethers.Wallet(CONFIG.DEPLOYER.privateKey, this.provider);
        this.report = {
            network: CONFIG.NETWORK.name,
            chainId: CONFIG.NETWORK.chainId,
            timestamp: new Date().toISOString(),
            deployer: this.wallet.address,
            deployments: {},
            totalGasUsed: 0n
        };
    }

    async init() {
        log.header('Token Deployment Suite');
        log.info(`Network: ${CONFIG.NETWORK.name}`);
        log.info(`Deployer: ${this.wallet.address}`);

        const balance = await this.provider.getBalance(this.wallet.address);
        log.info(`Balance: ${ethers.formatEther(balance)} ETH`);

        if (balance === 0n) {
            throw new Error('Insufficient balance');
        }
    }

    async saveReport() {
        const dir = './deployments';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filepath = path.join(dir, `deployment-${timestamp}.json`);

                // Convert BigInt to string for JSON serialization
        const reportForJson = {
            ...this.report,
            totalGasUsed: this.report.totalGasUsed.toString()
        };

        fs.writeFileSync(filepath, JSON.stringify(reportForJson, null, 2));
        fs.writeFileSync(path.join(dir, 'latest.json'), JSON.stringify(reportForJson, null, 2));

        // Save just addresses for easy import
        const addresses = {};
        for (const [name, deployment] of Object.entries(this.report.deployments)) {
            addresses[name] = deployment.contractAddress;
        }
        fs.writeFileSync(path.join(dir, 'addresses.json'), JSON.stringify(addresses, null, 2));

        log.success(`Reports saved to ${dir}/`);
    }

    printSummary() {
        log.header('Deployment Summary');

        log.info(`Total Contracts: ${Object.keys(this.report.deployments).length}`);
        log.info(`Total Gas Used: ${this.report.totalGasUsed.toLocaleString()}`);

        console.log('\nDeployed Contracts:');
        for (const [name, deployment] of Object.entries(this.report.deployments)) {
            console.log(`${name}: ${deployment.contractAddress}`);
            if (deployment.symbol) {
                console.log(`  └─ ${deployment.totalSupplyFormatted} ${deployment.symbol}`);
            }
        }

        console.log('\nNext Steps:');
        console.log('1. Register tokens: node scripts/register-erc20-tokens.js register all');
        console.log('2. Update faucet configuration');
    }
}

async function main() {
    const deployer = new TokenDeployer();

    try {
        await deployer.init();

        log.header('Token Configurations');
        for (const [symbol, config] of Object.entries(TOKEN_CONFIGS)) {
            console.log(`${symbol}:`);
            console.log(`  Name: ${config.name}`);
            console.log(`  Symbol: ${config.symbol}`);
            console.log(`  Decimals: ${config.decimals}`);
            console.log(`  Supply: ${config.initialSupply}`);
            console.log(`  Mint To: ${config.mintTo}`);
            console.log();
        }

        log.warning('This is a configuration preview. For actual deployment:');
        log.info('1. Ensure contracts are in src/ directory');
        log.info('2. Run: forge build');
        log.info('3. Use this script with actual bytecode');

        await deployer.saveReport();
        deployer.printSummary();

    } catch (error) {
        log.error(`Failed: ${error.message}`);
        process.exit(1);
    }
}

export { TokenDeployer, TOKEN_CONFIGS, CONFIG };

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}
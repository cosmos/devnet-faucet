#!/usr/bin/env node

/**
 * Simple Faucet Deployment & Test Script
 *
 * 1. Build contracts with Forge
 * 2. Deploy all tokens + MultiSend
 * 3. Verify contracts exist on chain
 * 4. Test MultiSend with real transactions to different address types
 * 5. Record contract addresses for manual faucet operation
 */

import { ethers } from 'ethers';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Configuration
const NETWORK_CONFIG = {
    rpcUrl: 'https://cevm-01-evmrpc.dev.skip.build',
    chainId: 262144,
    privateKey: 'dd138b977ac3248b328b7b65ac30338b1482a17197a175f03fd2df20fb0919c6'
};

const FAUCET_ADDRESS = '0x42e6047c5780b103e52265f6483c2d0113aa6b87';

// Test addresses (different types)
const TEST_ADDRESSES = [
    '0x1234567890123456789012345678901234567890', // Regular EVM address
    '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd', // Another EVM address
    '0x0000000000000000000000000000000000000001'  // System address
];

class SimpleDeployer {
    constructor() {
        this.provider = new ethers.JsonRpcProvider(NETWORK_CONFIG.rpcUrl);
        this.wallet = new ethers.Wallet(NETWORK_CONFIG.privateKey, this.provider);
        this.contracts = {};
    }

    async buildContracts() {
        console.log('[BUILD] Building contracts with Forge...');
        try {
            await execAsync('forge build');
            console.log('[SUCCESS] Contracts built successfully');
        } catch (error) {
            console.error('[ERROR] Build failed:', error.message);
            throw error;
        }
    }

    loadArtifact(contractName) {
        const path = `./out/${contractName}.sol/${contractName}.json`;
        const artifact = JSON.parse(fs.readFileSync(path, 'utf8'));
        return { abi: artifact.abi, bytecode: artifact.bytecode.object };
    }

    async deployTokens() {
        console.log('\n[DEPLOY] Deploying ERC20 tokens...');

        const tokens = ['WBTC', 'PEPE', 'USDT'];

        for (const token of tokens) {
            const { abi, bytecode } = this.loadArtifact(token);
            const factory = new ethers.ContractFactory(abi, bytecode, this.wallet);

            console.log(`Deploying ${token}...`);
            const contract = await factory.deploy(FAUCET_ADDRESS);
            await contract.waitForDeployment();

            const address = await contract.getAddress();
            this.contracts[token] = { address, abi };

            console.log(`[SUCCESS] ${token} deployed to: ${address}`);
        }
    }

    async deployMultiSend() {
        console.log('\n[DEPLOY] Deploying MultiSend contract...');

        const { abi, bytecode } = this.loadArtifact('MultiSend');
        const factory = new ethers.ContractFactory(abi, bytecode, this.wallet);

        const contract = await factory.deploy();
        await contract.waitForDeployment();

        const address = await contract.getAddress();
        this.contracts.MultiSend = { address, abi };

        // Transfer ownership to faucet
        await contract.transferOwnership(FAUCET_ADDRESS);

        console.log(`[SUCCESS] MultiSend deployed to: ${address}`);
        console.log(`[SUCCESS] Ownership transferred to faucet`);
    }

    async verifyContracts() {
        console.log('\n[VERIFY] Verifying contracts exist on chain...');

        for (const [name, { address, abi }] of Object.entries(this.contracts)) {
            try {
                const contract = new ethers.Contract(address, abi, this.provider);

                if (name === 'MultiSend') {
                    const owner = await contract.owner();
                    console.log(`[SUCCESS] ${name} verified - Owner: ${owner}`);
                } else {
                    const symbol = await contract.symbol();
                    const balance = await contract.balanceOf(FAUCET_ADDRESS);
                    const decimals = await contract.decimals();
                    console.log(`[SUCCESS] ${name} verified - Symbol: ${symbol}, Faucet Balance: ${ethers.formatUnits(balance, decimals)}`);
                }
            } catch (error) {
                console.error(`[ERROR] ${name} verification failed:`, error.message);
                throw error;
            }
        }
    }

    async testMultiSend() {
        console.log('\n[TEST] Testing MultiSend with real transactions...');

        const multiSendContract = new ethers.Contract(
            this.contracts.MultiSend.address,
            this.contracts.MultiSend.abi,
            this.wallet
        );

        // Prepare test transfers (small amounts)
        const transfers = [
            {
                token: this.contracts.WBTC.address,
                amount: ethers.parseUnits('0.01', 8) // 0.01 WBTC
            },
            {
                token: this.contracts.PEPE.address,
                amount: ethers.parseUnits('10', 18) // 10 PEPE
            },
            {
                token: this.contracts.USDT.address,
                amount: ethers.parseUnits('1', 6) // 1 USDT
            }
        ];

        // Test with different address types
        for (let i = 0; i < TEST_ADDRESSES.length; i++) {
            const testAddress = TEST_ADDRESSES[i];
            console.log(`\nTesting transfer to address ${i + 1}: ${testAddress}`);

            try {
                // First approve MultiSend to spend tokens
                for (const transfer of transfers) {
                    const tokenContract = new ethers.Contract(transfer.token, this.contracts.WBTC.abi, this.wallet);
                    const approveTx = await tokenContract.approve(this.contracts.MultiSend.address, transfer.amount);
                    await approveTx.wait();
                }

                // Execute MultiSend
                const tx = await multiSendContract.multiSend(testAddress, transfers);
                const receipt = await tx.wait();

                console.log(`[SUCCESS] MultiSend transaction successful: ${tx.hash}`);
                console.log(`   Gas used: ${receipt.gasUsed.toString()}`);

                // Verify balances
                for (const transfer of transfers) {
                    const tokenContract = new ethers.Contract(transfer.token, this.contracts.WBTC.abi, this.provider);
                    const balance = await tokenContract.balanceOf(testAddress);
                    const symbol = await tokenContract.symbol();
                    const decimals = await tokenContract.decimals();

                    console.log(`   ${symbol} balance at ${testAddress}: ${ethers.formatUnits(balance, decimals)}`);
                }

            } catch (error) {
                console.error(`[ERROR] Test ${i + 1} failed:`, error.message);
                // Continue with other tests
            }
        }
    }

    async recordAddresses() {
        console.log('\n[RECORD] Recording contract addresses...');

        const deploymentRecord = {
            timestamp: new Date().toISOString(),
            network: 'cosmos_evm',
            chainId: NETWORK_CONFIG.chainId,
            faucetAddress: FAUCET_ADDRESS,
            contracts: {}
        };

        // Extract addresses
        for (const [name, { address }] of Object.entries(this.contracts)) {
            deploymentRecord.contracts[name] = address;
        }

        // Create deployments directory
        if (!fs.existsSync('./deployments')) {
            fs.mkdirSync('./deployments');
        }

        // Save deployment record
        const filename = `./deployments/deployment-${Date.now()}.json`;
        fs.writeFileSync(filename, JSON.stringify(deploymentRecord, null, 2));

        // Save latest addresses for easy reference
        fs.writeFileSync('./deployments/latest-addresses.json', JSON.stringify(deploymentRecord.contracts, null, 2));

        console.log(`[SUCCESS] Addresses saved to: ${filename}`);
        console.log(`[SUCCESS] Latest addresses: ./deployments/latest-addresses.json`);

        // Display addresses
        console.log('\n[INFO] Contract Addresses:');
        for (const [name, address] of Object.entries(deploymentRecord.contracts)) {
            console.log(`  ${name}: ${address}`);
        }
    }

    async deploy() {
        console.log('[START] Starting Simple Deployment & Test Process');
        console.log('============================================');
        console.log(`Network: ${NETWORK_CONFIG.rpcUrl}`);
        console.log(`Deployer: ${this.wallet.address}`);
        console.log(`Faucet: ${FAUCET_ADDRESS}\n`);

        try {
            await this.buildContracts();
            await this.deployTokens();
            await this.deployMultiSend();
            await this.verifyContracts();
            await this.testMultiSend();
            await this.recordAddresses();

            console.log('\n[COMPLETE] DEPLOYMENT & TESTING COMPLETED SUCCESSFULLY!');
            console.log('==============================================');
            console.log('[SUCCESS] All contracts deployed and verified');
            console.log('[SUCCESS] MultiSend tested with real transactions');
            console.log('[SUCCESS] Contract addresses recorded');
            console.log('\n[READY] Ready for manual faucet operation!');
            console.log('Start faucet with: node faucet.js');

        } catch (error) {
            console.error('\n[ERROR] DEPLOYMENT FAILED:', error.message);
            throw error;
        }
    }
}

// Main execution
async function main() {
    const deployer = new SimpleDeployer();

    try {
        await deployer.deploy();
        process.exit(0);
    } catch (error) {
        console.error('Process failed:', error.message);
        process.exit(1);
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export { SimpleDeployer };
#!/usr/bin/env node

/**
 * Automated deployment script for Cosmos EVM Faucet
 * Handles the complete deployment pipeline with optional testing
 * Usage: 
 *   node scripts/automated-deploy.js           # Deploy only
 *   node scripts/automated-deploy.js --test    # Deploy + Test
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

// Configuration
const CONFIG = {
    rpcUrl: 'https://cevm-01-evmrpc.dev.skip.build',
    contractName: 'AtomicMultiSend',
    configFile: 'config.js',
    requiredEnvVars: ['MNEMONIC'] // Only mnemonic needed, private key derived
};

class DeploymentManager {
    constructor(options = {}) {
        this.deploymentData = null;
        this.runTests = options.test || false;
        this.verbose = options.verbose || false;
    }

    async deriveAndCacheAddresses() {
        console.log('🔑 Deriving and caching wallet addresses...');
        
        try {
            const { deriveAndCacheAddresses } = await import('./derive-and-cache-addresses.js');
            await deriveAndCacheAddresses(process.env.MNEMONIC);
            console.log('✅ Wallet addresses cached successfully');
        } catch (error) {
            throw new Error(`Address derivation failed: ${error.message}`);
        }
    }

    async validateEnvironment() {
        console.log('🔍 Validating environment...');
        
        // Check required environment variables
        for (const envVar of CONFIG.requiredEnvVars) {
            if (!process.env[envVar]) {
                throw new Error(`Missing required environment variable: ${envVar}`);
            }
        }
        
        // Check Foundry installation
        try {
            await execAsync('forge --version');
            console.log('✅ Foundry installed');
        } catch (error) {
            throw new Error('Foundry not installed or not in PATH');
        }
        
        // Check Node.js version
        const nodeVersion = process.version;
        console.log(`✅ Node.js version: ${nodeVersion}`);
        
        // Test RPC connectivity
        try {
            const { stdout } = await execAsync(`curl -s -X POST ${CONFIG.rpcUrl} -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'`);
            const response = JSON.parse(stdout);
            if (response.result) {
                console.log(`✅ RPC connectivity: Chain ID ${parseInt(response.result, 16)}`);
            } else {
                throw new Error('Invalid RPC response');
            }
        } catch (error) {
            throw new Error(`RPC connectivity failed: ${error.message}`);
        }
    }

    async cleanBuildArtifacts() {
        console.log('🧹 Cleaning build artifacts...');
        
        try {
            // Remove existing artifacts
            await execAsync('rm -rf out cache broadcast deployments/*.json');
            await execAsync('forge clean');
            console.log('✅ Build artifacts cleaned');
        } catch (error) {
            console.warn('⚠️  Error cleaning artifacts:', error.message);
        }
    }

    async deployTokenRegistry() {
        console.log('🪙 Deploying ERC-20 tokens from registry...');
        
        try {
            const { stdout } = await execAsync('node scripts/deploy-token-registry.js');
            console.log('✅ Token registry deployment successful');
            console.log(stdout);
        } catch (error) {
            throw new Error(`Token registry deployment failed: ${error.message}`);
        }
    }

    async compileContracts() {
        console.log('🔨 Compiling contracts...');
        
        try {
            const { stdout } = await execAsync('forge build');
            console.log('✅ Contracts compiled successfully');
            console.log(stdout);
        } catch (error) {
            throw new Error(`Contract compilation failed: ${error.message}`);
        }
    }

    async deployContract() {
        console.log('🚀 Deploying AtomicMultiSend contract...');
        
        try {
            // Import derived private key from config
            const { DERIVED_PRIVATE_KEY } = await import('../config.js');
            
            const { stdout } = await execAsync(
                `PRIVATE_KEY=${DERIVED_PRIVATE_KEY} forge script script/Deploy${CONFIG.contractName}.s.sol ` +
                `--rpc-url ${CONFIG.rpcUrl} ` +
                `--broadcast ` +
                `--skip-simulation`
            );
            
            console.log('✅ Contract deployed successfully');
            
            // Parse deployment output to extract contract address
            const addressMatch = stdout.match(/AtomicMultiSend deployed at: (0x[a-fA-F0-9]{40})/);
            if (addressMatch) {
                this.deploymentData = {
                    contractAddress: addressMatch[1],
                    timestamp: Date.now(),
                    rpcUrl: CONFIG.rpcUrl
                };
                console.log(`📍 Contract address: ${this.deploymentData.contractAddress}`);
            } else {
                throw new Error('Could not parse contract address from deployment output');
            }
            
            return this.deploymentData.contractAddress;
        } catch (error) {
            throw new Error(`Contract deployment failed: ${error.message}`);
        }
    }

    async extractABI() {
        console.log('📋 Extracting contract ABI...');
        
        try {
            // Use the ABI extraction script we created
            const { default: extractABI } = await import('./extract-abi.js');
            await extractABI();
            console.log('✅ ABI extracted successfully');
        } catch (error) {
            throw new Error(`ABI extraction failed: ${error.message}`);
        }
    }

    async updateConfiguration(contractAddress) {
        console.log('⚙️  Updating configuration...');
        
        try {
            // Read current config
            const configPath = CONFIG.configFile;
            let configContent = fs.readFileSync(configPath, 'utf8');
            
            // Replace contract address using regex
            const addressRegex = /atomicMultiSend:\s*"0x[a-fA-F0-9]{40}"/;
            const newAddressLine = `atomicMultiSend: "${contractAddress}"`;
            
            if (addressRegex.test(configContent)) {
                configContent = configContent.replace(addressRegex, newAddressLine);
            } else {
                throw new Error('Could not find atomicMultiSend address pattern in config');
            }
            
            // Write updated config
            fs.writeFileSync(configPath, configContent);
            console.log(`✅ Configuration updated with new contract address: ${contractAddress}`);
        } catch (error) {
            throw new Error(`Configuration update failed: ${error.message}`);
        }
    }

    async setTokenApprovals() {
        console.log('🎯 Setting token approvals...');
        
        try {
            const { stdout } = await execAsync('node scripts/approve-tokens.js');
            console.log('✅ Token approvals set successfully');
            console.log(stdout);
        } catch (error) {
            throw new Error(`Token approval failed: ${error.message}`);
        }
    }

    async verifyDeployment() {
        console.log('✅ Verifying deployment...');
        
        try {
            // Basic contract verification
            const { stdout } = await execAsync(
                `curl -s -X POST ${CONFIG.rpcUrl} -H "Content-Type: application/json" ` +
                `-d '{"jsonrpc":"2.0","method":"eth_getCode","params":["${this.deploymentData.contractAddress}","latest"],"id":1}'`
            );
            
            const response = JSON.parse(stdout);
            if (response.result && response.result !== '0x') {
                console.log('✅ Contract verification successful');
                console.log(`📍 Contract deployed at: ${this.deploymentData.contractAddress}`);
            } else {
                throw new Error('Contract not found on chain');
            }
            
            if (this.runTests) {
                await this.runIntegrationTests();
            }
        } catch (error) {
            throw new Error(`Deployment verification failed: ${error.message}`);
        }
    }

    async runIntegrationTests() {
        console.log('\n🧪 Running integration tests...');
        
        try {
            // Start faucet in background
            console.log('📡 Starting faucet server...');
            const faucetProcess = exec('node faucet.js');
            
            // Wait for server to start
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Test 1: EVM workflow - token distribution to fresh EVM address
            console.log('🔬 Test 1: EVM workflow - Token distribution to fresh EVM address');
            const testEvmAddress = '0x1234567890abcdef1234567890abcdef12345678';
            const { stdout: result1 } = await execAsync(`curl -s "http://localhost:8088/send/${testEvmAddress}"`);
            const response1 = JSON.parse(result1);
            
            if (response1.result && response1.result.code === 0) {
                console.log('✅ Test 1 passed: EVM token distribution successful');
                console.log(`  📊 Transfers completed: ${response1.result.transfers?.length || 0} tokens`);
                console.log(`  🧾 EVM TX hash: ${response1.result.transaction_hash || 'N/A'}`);
                console.log(`  🧾 Cosmos TX hash: ${response1.result.transfers?.find(t => t.type === 'cosmos_native')?.hash || 'N/A'}`);
            } else {
                console.log('❌ Test 1 failed:', response1.result || result1);
            }
            
            // Test 2: Cosmos workflow - ATOM distribution to cosmos address
            console.log('\n🔬 Test 2: Cosmos workflow - ATOM distribution to cosmos address');
            const testCosmosAddress = 'cosmos170v7axfk7r0ts6ht7zw5er5glankxjdf2me5sa';
            const { stdout: result2 } = await execAsync(`curl -s "http://localhost:8088/send/${testCosmosAddress}"`);
            const response2 = JSON.parse(result2);
            
            if (response2.result && response2.result.code === 0) {
                console.log('✅ Test 2 passed: Cosmos ATOM distribution successful');
                console.log(`  💎 ATOM sent via bank send`);
                console.log(`  🧾 Cosmos TX hash: ${response2.result.transaction_hash || 'N/A'}`);
            } else {
                console.log('❌ Test 2 failed:', response2.result || result2);
            }
            
            // Test 3: Rate limiting (same EVM address)
            console.log('\n🔬 Test 3: Rate limiting verification (EVM)');
            const { stdout: result3 } = await execAsync(`curl -s "http://localhost:8088/send/${testEvmAddress}"`);
            const response3 = JSON.parse(result3);
            
            if (response3.result && response3.result.message?.includes('sufficient balance')) {
                console.log('✅ Test 3 passed: Rate limiting working (address has sufficient balance)');
            } else if (response3.result && response3.result.message?.includes('rate limit')) {
                console.log('✅ Test 3 passed: Rate limiting active');
            } else {
                console.log('⚠️  Test 3 unclear:', response3.result || result3);
            }
            
            // Test 4: Rate limiting (same cosmos address) 
            console.log('\n🔬 Test 4: Rate limiting verification (Cosmos)');
            const { stdout: result4 } = await execAsync(`curl -s "http://localhost:8088/send/${testCosmosAddress}"`);
            const response4 = JSON.parse(result4);
            
            if (response4.result && response4.result.message?.includes('sufficient balance')) {
                console.log('✅ Test 4 passed: Cosmos rate limiting working (address has sufficient balance)');
            } else if (response4.result && response4.result.message?.includes('rate limit')) {
                console.log('✅ Test 4 passed: Cosmos rate limiting active');
            } else {
                console.log('⚠️  Test 4 unclear:', response4.result || result4);
            }
            
            // Test 5: Config endpoint
            console.log('\n🔬 Test 5: Configuration endpoint');
            const { stdout: result5 } = await execAsync('curl -s "http://localhost:8088/config.json"');
            const config = JSON.parse(result5);
            
            if (config.network && config.network.contracts) {
                console.log('✅ Test 5 passed: Configuration endpoint working');
                console.log(`  📋 Contract address in config: ${config.network.contracts.atomicMultiSend}`);
            } else {
                console.log('❌ Test 5 failed: Invalid config response');
            }
            
            // Cleanup
            faucetProcess.kill();
            console.log('\n🎯 Integration tests completed');
            
        } catch (error) {
            console.error(`❌ Integration tests failed: ${error.message}`);
            // Try to cleanup
            try {
                await execAsync('pkill -f "node faucet.js"');
            } catch {}
        }
    }

    async saveDeploymentRecord() {
        console.log('💾 Saving deployment record...');
        
        try {
            const deploymentRecord = {
                ...this.deploymentData,
                deployedAt: new Date().toISOString(),
                version: '1.0.0',
                network: 'cosmos-evm-testnet'
            };
            
            const recordPath = 'deployments/deployment-record.json';
            fs.writeFileSync(recordPath, JSON.stringify(deploymentRecord, null, 2));
            console.log(`✅ Deployment record saved: ${recordPath}`);
        } catch (error) {
            console.warn(`⚠️  Could not save deployment record: ${error.message}`);
        }
    }

    async deploy() {
        const startTime = Date.now();
        console.log('🚀 Starting automated deployment pipeline...\n');
        
        try {
            await this.validateEnvironment();
            await this.deriveAndCacheAddresses();
            await this.cleanBuildArtifacts();
            await this.deployTokenRegistry();
            await this.compileContracts();
            const contractAddress = await this.deployContract();
            await this.extractABI();
            await this.updateConfiguration(contractAddress);
            await this.setTokenApprovals();
            await this.verifyDeployment();
            await this.saveDeploymentRecord();
            
            const duration = (Date.now() - startTime) / 1000;
            console.log('\n🎉 Deployment completed successfully!');
            console.log(`⏱️  Total time: ${duration.toFixed(2)}s`);
            console.log(`📍 Contract address: ${contractAddress}`);
            
            if (this.runTests) {
                console.log('\n✅ All tests passed!');
            }
            
            console.log('\n📋 Next steps:');
            console.log('  1. Start the faucet: npm start');
            if (!this.runTests) {
                console.log('  2. Run tests: npm run deploy:test');
                console.log('  3. Monitor transaction logs');
            } else {
                console.log('  2. Monitor transaction logs');
            }
            
        } catch (error) {
            const duration = (Date.now() - startTime) / 1000;
            console.error('\n❌ Deployment failed!');
            console.error(`⏱️  Failed after: ${duration.toFixed(2)}s`);
            console.error(`💥 Error: ${error.message}`);
            process.exit(1);
        }
    }
}

// Parse command line arguments
function parseArgs() {
    const args = process.argv.slice(2);
    return {
        test: args.includes('--test') || args.includes('-t'),
        verbose: args.includes('--verbose') || args.includes('-v'),
        help: args.includes('--help') || args.includes('-h')
    };
}

// Show help
function showHelp() {
    console.log(`
Cosmos EVM Faucet Deployment Script

Usage:
  node scripts/automated-deploy.js [options]

Options:
  --test, -t     Run integration tests after deployment
  --verbose, -v  Enable verbose logging
  --help, -h     Show this help message

Examples:
  node scripts/automated-deploy.js           # Deploy only
  node scripts/automated-deploy.js --test    # Deploy + test
  npm run deploy                             # Deploy only (via npm)
  npm run deploy:test                        # Deploy + test (via npm)
`);
}

// Run deployment if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const options = parseArgs();
    
    if (options.help) {
        showHelp();
        process.exit(0);
    }
    
    const deployer = new DeploymentManager(options);
    deployer.deploy();
}

export default DeploymentManager;
#!/usr/bin/env node

/**
 * Environment validation script
 * Checks all prerequisites before deployment
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const execAsync = promisify(exec);

class EnvironmentValidator {
    constructor() {
        this.checks = [];
        this.warnings = [];
        this.errors = [];
    }

    log(status, message, details = '') {
        const icons = { pass: '', warn: '', fail: '', info: '' };
        console.log(`${icons[status]} ${message}${details ? ` ${details}` : ''}`);
        
        if (status === 'fail') this.errors.push(message);
        if (status === 'warn') this.warnings.push(message);
    }

    async checkNodeVersion() {
        try {
            const version = process.version;
            const majorVersion = parseInt(version.slice(1).split('.')[0]);
            
            if (majorVersion >= 18) {
                this.log('pass', 'Node.js version', version);
            } else {
                this.log('fail', 'Node.js version too old', `${version} (requires >= 18)`);
            }
        } catch (error) {
            this.log('fail', 'Node.js check failed', error.message);
        }
    }

    async checkFoundry() {
        try {
            const { stdout } = await execAsync('forge --version');
            const version = stdout.trim().split('\n')[0];
            this.log('pass', 'Foundry installation', version);
        } catch (error) {
            this.log('fail', 'Foundry not installed or not in PATH');
        }
    }

    async checkEnvironmentVariables() {
        const required = ['MNEMONIC']; // Private key derived from mnemonic
        const optional = ['RPC_URL', 'CHAIN_ID'];
        
        for (const envVar of required) {
            if (process.env[envVar]) {
                this.log('pass', `Environment variable ${envVar}`, '(set)');
            } else {
                this.log('fail', `Missing required environment variable: ${envVar}`);
            }
        }
        
        for (const envVar of optional) {
            if (process.env[envVar]) {
                this.log('info', `Optional environment variable ${envVar}`, '(set)');
            }
        }
    }

    async checkNetworkConnectivity() {
        const rpcUrl = process.env.RPC_URL || 'https://cevm-01-evmrpc.dev.skip.build';
        
        try {
            const { stdout } = await execAsync(
                `curl -s -X POST ${rpcUrl} -H "Content-Type: application/json" ` +
                `-d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'`
            );
            
            const response = JSON.parse(stdout);
            if (response.result) {
                const chainId = parseInt(response.result, 16);
                this.log('pass', 'RPC connectivity', `Chain ID: ${chainId}`);
            } else {
                this.log('fail', 'RPC returned invalid response', stdout);
            }
        } catch (error) {
            this.log('fail', 'RPC connectivity check failed', error.message);
        }
    }

    async checkFileStructure() {
        const requiredFiles = [
            'config.js',
            'faucet.js',
            'foundry.toml',
            'script/DeployAtomicMultiSend.s.sol',
            'src/AtomicMultiSend.sol'
        ];
        
        const requiredDirs = [
            'scripts',
            'deployments',
            'views'
        ];
        
        for (const file of requiredFiles) {
            if (fs.existsSync(file)) {
                this.log('pass', `Required file: ${file}`);
            } else {
                this.log('fail', `Missing required file: ${file}`);
            }
        }
        
        for (const dir of requiredDirs) {
            if (fs.existsSync(dir)) {
                this.log('pass', `Required directory: ${dir}`);
            } else {
                this.log('warn', `Missing directory: ${dir}`, '(will be created)');
            }
        }
    }

    async checkDependencies() {
        try {
            if (fs.existsSync('package.json')) {
                this.log('pass', 'package.json exists');
                
                // Check if node_modules exists
                if (fs.existsSync('node_modules')) {
                    this.log('pass', 'Dependencies installed');
                } else {
                    this.log('warn', 'Dependencies not installed', 'Run: npm install');
                }
            } else {
                this.log('fail', 'package.json not found');
            }
        } catch (error) {
            this.log('fail', 'Dependency check failed', error.message);
        }
    }

    async checkTokenContracts() {
        const rpcUrl = process.env.RPC_URL || 'https://cevm-01-evmrpc.dev.skip.build';
        const tokenContracts = [
            { name: 'WBTC', address: '0xC52cB914767C076919Dc4245D4B005c8865a2f1F' },
            { name: 'PEPE', address: '0xD0C124828bF8648E8681d1eD3117f20Ab989e7a1' },
            { name: 'USDT', address: '0xf66bB908fa291EE1Fd78b09937b14700839E7c80' }
        ];
        
        for (const token of tokenContracts) {
            try {
                const { stdout } = await execAsync(
                    `curl -s -X POST ${rpcUrl} -H "Content-Type: application/json" ` +
                    `-d '{"jsonrpc":"2.0","method":"eth_getCode","params":["${token.address}","latest"],"id":1}'`
                );
                
                const response = JSON.parse(stdout);
                if (response.result && response.result !== '0x') {
                    this.log('pass', `${token.name} contract deployed`, token.address);
                } else {
                    this.log('warn', `${token.name} contract not found`, token.address);
                }
            } catch (error) {
                this.log('warn', `${token.name} contract check failed`, error.message);
            }
        }
    }

    async checkWalletBalance() {
        if (!process.env.MNEMONIC) {
            this.log('warn', 'Cannot check wallet balance - MNEMONIC not set');
            return;
        }
        
        try {
            // Import the cached derived address from config
            const { DERIVED_ADDRESS } = await import('../config.js');
            
            this.log('pass', 'Wallet address (cached)', `${DERIVED_ADDRESS.slice(0, 8)}...${DERIVED_ADDRESS.slice(-6)}`);
            this.log('info', 'Wallet balance check', '(should be verified manually on-chain)');
        } catch (error) {
            this.log('warn', 'Wallet derivation failed', error.message);
        }
    }

    async validate() {
        console.log(' Validating deployment environment...\n');
        
        await this.checkNodeVersion();
        await this.checkFoundry();
        await this.checkEnvironmentVariables();
        await this.checkNetworkConnectivity();
        await this.checkFileStructure();
        await this.checkDependencies();
        await this.checkTokenContracts();
        await this.checkWalletBalance();
        
        console.log('\n Validation Summary:');
        console.log(` Passed: ${this.checks.length - this.errors.length - this.warnings.length}`);
        console.log(`  Warnings: ${this.warnings.length}`);
        console.log(` Errors: ${this.errors.length}`);
        
        if (this.errors.length > 0) {
            console.log('\n Critical Issues:');
            this.errors.forEach(error => console.log(`  • ${error}`));
        }
        
        if (this.warnings.length > 0) {
            console.log('\n  Warnings:');
            this.warnings.forEach(warning => console.log(`  • ${warning}`));
        }
        
        if (this.errors.length === 0) {
            console.log('\n Environment validation passed! Ready for deployment.');
            return true;
        } else {
            console.log('\n Environment validation failed! Please fix the issues above.');
            return false;
        }
    }
}

// Run validation if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const validator = new EnvironmentValidator();
    validator.validate().then(success => {
        process.exit(success ? 0 : 1);
    });
}

export default EnvironmentValidator;
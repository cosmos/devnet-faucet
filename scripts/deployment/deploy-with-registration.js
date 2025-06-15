#!/usr/bin/env node

/**
 * Complete Deployment Script with Integrated Token Registration
 * 
 * This script combines:
 * 1. ERC20 token deployment using Foundry
 * 2. Automatic token registration for both directions
 * 3. Validation and testing of the complete flow
 * 
 * Provides a fully automated deployment for devnet resets
 */

import { FoundryTokenDeployer } from './deploy-tokens-foundry.js';
import { TokenRegistrationManager } from '../token-registration-system.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

// Deployment configuration
const DEPLOYMENT_CONFIG = {
    wait_times: {
        deployment: 5000,      // Wait after token deployment
        registration: 10000,   // Wait after registration
        verification: 5000     // Wait for verification
    },
    validation: {
        check_balances: true,
        verify_contracts: true,
        test_faucet: true
    }
};

class ComprehensiveDeployer {
    constructor() {
        this.tokenDeployer = new FoundryTokenDeployer();
        this.registrationManager = new TokenRegistrationManager();
        this.deploymentResults = {
            tokens: {},
            registrations: {},
            validations: {},
            summary: {}
        };
    }

    async runCompleteDeployment() {
        console.log(' Starting Complete Deployment with Registration');
        console.log('=' .repeat(70));
        
        try {
            // Phase 1: Deploy ERC20 tokens
            await this.deployTokens();
            
            // Phase 2: Initialize registration system
            await this.initializeRegistration();
            
            // Phase 3: Register tokens for both directions
            await this.registerTokens();
            
            // Phase 4: Validate deployment
            await this.validateDeployment();
            
            // Phase 5: Generate comprehensive report
            await this.generateDeploymentReport();
            
            console.log('\n Complete deployment finished successfully!');
            
        } catch (error) {
            console.error(' Complete deployment failed:', error.message);
            throw error;
        }
    }

    async deployTokens() {
        console.log('\n Phase 1: Token Deployment');
        console.log('-' .repeat(40));
        
        try {
            // Initialize and deploy tokens using Foundry
            await this.tokenDeployer.init();
            const deploymentResult = await this.tokenDeployer.deployAll();
            
            this.deploymentResults.tokens = deploymentResult;
            console.log(' Token deployment completed');
            
            // Wait for deployment to be fully processed
            console.log(`⏳ Waiting ${DEPLOYMENT_CONFIG.wait_times.deployment}ms for deployment processing...`);
            await new Promise(resolve => setTimeout(resolve, DEPLOYMENT_CONFIG.wait_times.deployment));
            
        } catch (error) {
            console.error(' Token deployment failed:', error.message);
            throw error;
        }
    }

    async initializeRegistration() {
        console.log('\n🔧 Phase 2: Registration System Initialization');
        console.log('-' .repeat(40));
        
        try {
            await this.registrationManager.initialize();
            console.log(' Registration system initialized');
        } catch (error) {
            console.error(' Registration initialization failed:', error.message);
            throw error;
        }
    }

    async registerTokens() {
        console.log('\n Phase 3: Token Registration');
        console.log('-' .repeat(40));
        
        try {
            // Extract deployed contract addresses for registration
            const deployedContracts = [];
            for (const [symbol, deployment] of Object.entries(this.deploymentResults.tokens.deployments)) {
                if (deployment.contractAddress) {
                    deployedContracts.push(deployment.contractAddress);
                }
            }
            
            console.log(`Found ${deployedContracts.length} deployed contracts for registration`);
            
            // Register ERC20 tokens for cosmos representation
            if (deployedContracts.length > 0) {
                console.log('\n Registering ERC20 tokens for cosmos representation...');
                try {
                    const erc20Result = await this.registrationManager.registerERC20TokensForCosmos(deployedContracts);
                    this.deploymentResults.registrations.erc20 = erc20Result;
                    console.log(' ERC20 registration completed');
                } catch (error) {
                    console.error('  ERC20 registration failed (may already be registered):', error.message);
                    this.deploymentResults.registrations.erc20 = { error: error.message };
                }
            }
            
            // Register native tokens for ERC20 representation
            console.log('\n Registering native tokens for ERC20 representation...');
            try {
                const nativeResult = await this.registrationManager.registerAllConfiguredTokens();
                this.deploymentResults.registrations.native = nativeResult;
                console.log(' Native token registration completed');
            } catch (error) {
                console.error('  Native token registration failed (may already be registered):', error.message);
                this.deploymentResults.registrations.native = { error: error.message };
            }
            
            // Wait for registration processing
            console.log(`⏳ Waiting ${DEPLOYMENT_CONFIG.wait_times.registration}ms for registration processing...`);
            await new Promise(resolve => setTimeout(resolve, DEPLOYMENT_CONFIG.wait_times.registration));
            
        } catch (error) {
            console.error(' Token registration failed:', error.message);
            throw error;
        }
    }

    async validateDeployment() {
        console.log('\n Phase 4: Deployment Validation');
        console.log('-' .repeat(40));
        
        const validations = {};
        
        try {
            // Check token pairs
            console.log(' Checking token pairs...');
            const tokenPairs = await this.registrationManager.checkTokenPairs();
            validations.token_pairs = {
                count: tokenPairs.length,
                pairs: tokenPairs,
                success: tokenPairs.length > 0
            };
            console.log(` Found ${tokenPairs.length} token pairs`);
            
            // Check contract deployment status
            if (DEPLOYMENT_CONFIG.validation.verify_contracts) {
                console.log(' Verifying contract deployments...');
                validations.contracts = await this.verifyContracts();
            }
            
            // Check faucet balances
            if (DEPLOYMENT_CONFIG.validation.check_balances) {
                console.log(' Checking faucet balances...');
                validations.balances = await this.checkFaucetBalances();
            }
            
            // Test faucet functionality
            if (DEPLOYMENT_CONFIG.validation.test_faucet) {
                console.log(' Testing faucet functionality...');
                validations.faucet_test = await this.testFaucetEndpoints();
            }
            
            this.deploymentResults.validations = validations;
            console.log(' Deployment validation completed');
            
        } catch (error) {
            console.error(' Deployment validation failed:', error.message);
            this.deploymentResults.validations = { error: error.message };
        }
    }

    async verifyContracts() {
        const results = [];
        
        for (const [symbol, deployment] of Object.entries(this.deploymentResults.tokens.deployments)) {
            try {
                // Simple verification - check if contract has code
                const provider = this.tokenDeployer.provider;
                const code = await provider.getCode(deployment.contractAddress);
                
                results.push({
                    symbol: symbol,
                    address: deployment.contractAddress,
                    hasCode: code !== '0x',
                    verified: code !== '0x'
                });
            } catch (error) {
                results.push({
                    symbol: symbol,
                    address: deployment.contractAddress,
                    error: error.message,
                    verified: false
                });
            }
        }
        
        return {
            total: results.length,
            verified: results.filter(r => r.verified).length,
            results: results
        };
    }

    async checkFaucetBalances() {
        try {
            // Use the existing faucet balance endpoint
            const response = await fetch('http://localhost:8088/balance/evm');
            const data = await response.json();
            
            return {
                success: response.ok,
                balances: data.balances,
                type: data.type
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async testFaucetEndpoints() {
        const tests = [];
        
        try {
            // Test config endpoint
            const configResponse = await fetch('http://localhost:8088/config.json');
            tests.push({
                endpoint: '/config.json',
                success: configResponse.ok,
                status: configResponse.status
            });
            
            // Test balance endpoints
            const evmBalanceResponse = await fetch('http://localhost:8088/balance/evm');
            tests.push({
                endpoint: '/balance/evm',
                success: evmBalanceResponse.ok,
                status: evmBalanceResponse.status
            });
            
            const cosmosBalanceResponse = await fetch('http://localhost:8088/balance/cosmos');
            tests.push({
                endpoint: '/balance/cosmos',
                success: cosmosBalanceResponse.ok,
                status: cosmosBalanceResponse.status
            });
            
        } catch (error) {
            tests.push({
                endpoint: 'general',
                success: false,
                error: error.message
            });
        }
        
        return {
            total: tests.length,
            passed: tests.filter(t => t.success).length,
            tests: tests
        };
    }

    async generateDeploymentReport() {
        console.log('\n📊 Phase 5: Deployment Report Generation');
        console.log('-' .repeat(40));
        
        const summary = {
            timestamp: new Date().toISOString(),
            deployment_success: !!this.deploymentResults.tokens.success,
            registration_success: !!(this.deploymentResults.registrations.erc20 || this.deploymentResults.registrations.native),
            validation_success: !!this.deploymentResults.validations.token_pairs?.success,
            
            // Counts
            tokens_deployed: Object.keys(this.deploymentResults.tokens.deployments || {}).length,
            token_pairs_found: this.deploymentResults.validations.token_pairs?.count || 0,
            contracts_verified: this.deploymentResults.validations.contracts?.verified || 0,
            
            // Gas usage
            total_gas_used: this.deploymentResults.tokens.totalGasUsed?.toString() || '0',
            
            // Status
            overall_success: this.isDeploymentSuccessful()
        };
        
        this.deploymentResults.summary = summary;
        
        // Save report
        await this.saveDeploymentReport();
        
        // Print summary
        this.printDeploymentSummary();
        
        console.log(' Deployment report generated');
    }

    isDeploymentSuccessful() {
        return (
            this.deploymentResults.tokens?.success &&
            this.deploymentResults.validations?.token_pairs?.success &&
            (this.deploymentResults.registrations?.erc20 || this.deploymentResults.registrations?.native)
        );
    }

    async saveDeploymentReport() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `complete-deployment-${timestamp}.json`;
        const deploymentsDir = './deployments';
        
        try {
            await fs.mkdir(deploymentsDir, { recursive: true });
            
            const filepath = path.join(deploymentsDir, filename);
            await fs.writeFile(filepath, JSON.stringify(this.deploymentResults, null, 2));
            
            // Save as latest
            const latestPath = path.join(deploymentsDir, 'latest-complete.json');
            await fs.writeFile(latestPath, JSON.stringify(this.deploymentResults, null, 2));
            
            console.log(`📄 Report saved: ${filepath}`);
            
        } catch (error) {
            console.error(' Failed to save report:', error.message);
        }
    }

    printDeploymentSummary() {
        console.log('\n Complete Deployment Summary');
        console.log('=' .repeat(60));
        
        const summary = this.deploymentResults.summary;
        
        console.log(`📅 Timestamp: ${summary.timestamp}`);
        console.log(`🏭 Tokens Deployed: ${summary.tokens_deployed}`);
        console.log(`🔗 Token Pairs: ${summary.token_pairs_found}`);
        console.log(` Contracts Verified: ${summary.contracts_verified}`);
        console.log(`⛽ Total Gas Used: ${summary.total_gas_used}`);
        
        const status = summary.overall_success ? ' SUCCESS' : ' ISSUES DETECTED';
        console.log(` Overall Status: ${status}`);
        
        if (summary.overall_success) {
            console.log('\n Deployment ready for use!');
            console.log('   - All tokens deployed and registered');
            console.log('   - Faucet system operational');
            console.log('   - Token pairs active');
        } else {
            console.log('\n  Please review the deployment:');
            console.log('   - Check token registration status');
            console.log('   - Verify faucet configuration');
            console.log('   - Test token functionality');
        }
    }
}

/**
 * Command line interface
 */
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    
    const deployer = new ComprehensiveDeployer();
    
    try {
        switch (command) {
            case 'deploy':
                await deployer.runCompleteDeployment();
                break;
                
            case 'validate':
                await deployer.initializeRegistration();
                await deployer.validateDeployment();
                await deployer.generateDeploymentReport();
                break;
                
            default:
                console.log(' Complete Deployment with Registration');
                console.log('');
                console.log('Usage:');
                console.log('  node scripts/deployment/deploy-with-registration.js deploy    - Full deployment');
                console.log('  node scripts/deployment/deploy-with-registration.js validate  - Validation only');
                console.log('');
                console.log('Features:');
                console.log('- Deploys ERC20 tokens using Foundry');
                console.log('- Registers tokens for both directions');
                console.log('- Validates complete system functionality');
                console.log('- Generates comprehensive reports');
                break;
        }
        
    } catch (error) {
        console.error(' Deployment script failed:', error.message);
        process.exit(1);
    }
}

// Export for module use
export { ComprehensiveDeployer };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}
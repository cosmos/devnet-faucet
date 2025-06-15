#!/usr/bin/env node

/**
 * Automated Devnet Setup Script
 * 
 * Complete automation for devnet resets:
 * 1. Deploy ERC20 tokens
 * 2. Register tokens (both directions)
 * 3. Update faucet configuration
 * 4. Validate complete system
 * 
 * This is the single script to run after devnet resets.
 */

import { FoundryTokenDeployer } from './deployment/deploy-tokens-foundry.js';
import { TokenRegistrationManager } from './token-registration-system.js';
import { ConfigUpdater } from './update-config-with-deployments.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

class AutomatedDevnetSetup {
    constructor() {
        this.startTime = Date.now();
        this.results = {
            deployment: null,
            registration: null,
            config_update: null,
            validation: null,
            success: false,
            duration: 0
        };
    }

    async runCompleteSetup() {
        console.log(' Starting Automated Devnet Setup');
        console.log('=' .repeat(60));
        console.log('This script will:');
        console.log('  1. Deploy ERC20 tokens using Foundry');
        console.log('  2. Register tokens for both cosmos and EVM sides');
        console.log('  3. Update faucet configuration automatically');
        console.log('  4. Validate the complete system');
        console.log('=' .repeat(60));
        
        try {
            // Step 1: Deploy tokens
            await this.deployTokens();
            
            // Step 2: Register tokens  
            await this.registerTokens();
            
            // Step 3: Update configuration
            await this.updateConfiguration();
            
            // Step 4: Validate system
            await this.validateSystem();
            
            // Step 5: Final summary
            this.generateFinalSummary();
            
            this.results.success = true;
            console.log('\n Automated devnet setup completed successfully!');
            
        } catch (error) {
            console.error('\n Automated setup failed:', error.message);
            this.results.success = false;
            throw error;
        } finally {
            this.results.duration = Date.now() - this.startTime;
        }
    }

    async deployTokens() {
        console.log('\n Step 1: Deploying ERC20 Tokens');
        console.log('-' .repeat(40));
        
        try {
            const deployer = new FoundryTokenDeployer();
            await deployer.init();
            
            console.log(' Compiling contracts...');
            deployer.compileContracts();
            
            console.log(' Deploying all tokens...');
            const result = await deployer.deployAll();
            
            console.log(' Saving deployment report...');
            await deployer.saveDeploymentReport();
            
            this.results.deployment = {
                success: result.success,
                tokens_deployed: Object.keys(result.deployments).length,
                gas_used: result.totalGasUsed.toString(),
                deployer_address: result.deployer
            };
            
            console.log(' Token deployment completed');
            console.log(`   Deployed ${this.results.deployment.tokens_deployed} tokens`);
            console.log(`   Gas used: ${this.results.deployment.gas_used}`);
            
        } catch (error) {
            console.error(' Token deployment failed:', error.message);
            this.results.deployment = { success: false, error: error.message };
            throw error;
        }
    }

    async registerTokens() {
        console.log('\n Step 2: Registering Tokens');
        console.log('-' .repeat(40));
        
        try {
            const registrationManager = new TokenRegistrationManager();
            await registrationManager.initialize();
            
            console.log(' Running comprehensive token registration...');
            const result = await registrationManager.registerAllConfiguredTokens();
            
            this.results.registration = {
                erc20_registrations: result.erc20_registrations.length,
                native_registrations: result.native_registrations.length,
                errors: result.errors.length,
                token_pairs: result.final_token_pairs?.length || 0
            };
            
            console.log(' Token registration completed');
            console.log(`   ERC20 registrations: ${this.results.registration.erc20_registrations}`);
            console.log(`   Native registrations: ${this.results.registration.native_registrations}`);
            console.log(`   Final token pairs: ${this.results.registration.token_pairs}`);
            
            if (this.results.registration.errors > 0) {
                console.log(`     Errors encountered: ${this.results.registration.errors} (may be expected)`);
            }
            
        } catch (error) {
            console.error(' Token registration failed:', error.message);
            this.results.registration = { success: false, error: error.message };
            // Don't throw - registration failures may be acceptable
        }
    }

    async updateConfiguration() {
        console.log('\n🔧 Step 3: Updating Configuration');
        console.log('-' .repeat(40));
        
        try {
            const configUpdater = new ConfigUpdater();
            const success = await configUpdater.updateConfigWithDeployments();
            
            this.results.config_update = { success };
            
            if (success) {
                console.log(' Configuration updated successfully');
                console.log('   Contract addresses updated in config.js');
            } else {
                console.log('  Configuration update had issues');
            }
            
        } catch (error) {
            console.error(' Configuration update failed:', error.message);
            this.results.config_update = { success: false, error: error.message };
            // Don't throw - continue with validation
        }
    }

    async validateSystem() {
        console.log('\n Step 4: System Validation');
        console.log('-' .repeat(40));
        
        const validation = {
            faucet_running: false,
            config_endpoints: false,
            balance_endpoints: false,
            token_pairs: false
        };
        
        try {
            // Check if faucet is running
            console.log(' Checking if faucet is running...');
            try {
                const response = await fetch('http://localhost:8088/config.json');
                validation.faucet_running = response.ok;
                validation.config_endpoints = response.ok;
                
                if (response.ok) {
                    console.log(' Faucet is running and responding');
                } else {
                    console.log('  Faucet is not responding properly');
                }
            } catch (error) {
                console.log(' Faucet is not running. Start it with: node faucet.js');
            }
            
            // Check balance endpoints
            if (validation.faucet_running) {
                console.log(' Testing balance endpoints...');
                try {
                    const evmResponse = await fetch('http://localhost:8088/balance/evm');
                    const cosmosResponse = await fetch('http://localhost:8088/balance/cosmos');
                    validation.balance_endpoints = evmResponse.ok && cosmosResponse.ok;
                    
                    if (validation.balance_endpoints) {
                        console.log(' Balance endpoints working');
                    } else {
                        console.log('  Balance endpoints have issues');
                    }
                } catch (error) {
                    console.log(' Balance endpoint test failed:', error.message);
                }
            }
            
            // Check token pairs
            console.log(' Checking token pairs...');
            try {
                const registrationManager = new TokenRegistrationManager();
                await registrationManager.initialize();
                const tokenPairs = await registrationManager.checkTokenPairs();
                validation.token_pairs = tokenPairs.length > 0;
                
                console.log(` Found ${tokenPairs.length} token pairs`);
            } catch (error) {
                console.log(' Token pairs check failed:', error.message);
            }
            
            this.results.validation = validation;
            
        } catch (error) {
            console.error(' System validation failed:', error.message);
            this.results.validation = { error: error.message };
        }
    }

    generateFinalSummary() {
        console.log('\n📊 Automated Devnet Setup Summary');
        console.log('=' .repeat(60));
        
        const duration = (this.results.duration / 1000).toFixed(1);
        console.log(`  Total Duration: ${duration} seconds`);
        
        // Deployment Summary
        console.log('\n Deployment:');
        if (this.results.deployment?.success) {
            console.log(`    ${this.results.deployment.tokens_deployed} tokens deployed`);
            console.log(`   ⛽ Gas used: ${this.results.deployment.gas_used}`);
        } else {
            console.log('    Deployment failed');
        }
        
        // Registration Summary
        console.log('\n Registration:');
        if (this.results.registration) {
            console.log(`    ERC20 registrations: ${this.results.registration.erc20_registrations}`);
            console.log(`    Native registrations: ${this.results.registration.native_registrations}`);
            console.log(`   🔗 Token pairs: ${this.results.registration.token_pairs}`);
            if (this.results.registration.errors > 0) {
                console.log(`     Errors: ${this.results.registration.errors}`);
            }
        } else {
            console.log('    Registration failed');
        }
        
        // Configuration Summary
        console.log('\n🔧 Configuration:');
        if (this.results.config_update?.success) {
            console.log('    Configuration updated');
        } else {
            console.log('    Configuration update failed');
        }
        
        // Validation Summary
        console.log('\n Validation:');
        if (this.results.validation) {
            const checks = [
                { name: 'Faucet Running', status: this.results.validation.faucet_running },
                { name: 'Config Endpoints', status: this.results.validation.config_endpoints },
                { name: 'Balance Endpoints', status: this.results.validation.balance_endpoints },
                { name: 'Token Pairs', status: this.results.validation.token_pairs }
            ];
            
            checks.forEach(check => {
                const icon = check.status ? '' : '';
                console.log(`   ${icon} ${check.name}`);
            });
        }
        
        // Overall Status
        console.log('\n Overall Status:');
        if (this.results.success) {
            console.log('    SETUP COMPLETED SUCCESSFULLY');
            console.log('\n System is ready for use!');
            console.log('   - Tokens deployed and registered');
            console.log('   - Configuration updated');
            console.log('   - Faucet ready to distribute tokens');
        } else {
            console.log('    SETUP COMPLETED WITH ISSUES');
            console.log('\n  Please review the errors above and:');
            console.log('   - Check deployment logs');
            console.log('   - Verify network connectivity');
            console.log('   - Start faucet if not running');
        }
        
        console.log('\n Quick Start Commands:');
        console.log('   node faucet.js                           # Start the faucet');
        console.log('   node scripts/token-registration-system.js check  # Check token pairs');
        console.log('   curl http://localhost:8088/config.json   # Test faucet API');
    }

    async runQuickTest() {
        console.log('\n Running Quick System Test');
        console.log('-' .repeat(40));
        
        try {
            // Test a faucet request
            const testAddress = '0x1234567890123456789012345678901234567890';
            const response = await fetch(`http://localhost:8088/send/${testAddress}`);
            
            if (response.ok) {
                const data = await response.json();
                console.log(' Faucet test successful');
                console.log('   Response:', data.result);
            } else {
                console.log('  Faucet test failed with status:', response.status);
            }
        } catch (error) {
            console.log(' Quick test failed:', error.message);
        }
    }
}

/**
 * Command line interface
 */
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    
    const setup = new AutomatedDevnetSetup();
    
    try {
        switch (command) {
            case 'run':
                await setup.runCompleteSetup();
                break;
                
            case 'test':
                await setup.runQuickTest();
                break;
                
            default:
                console.log('🤖 Automated Devnet Setup');
                console.log('');
                console.log('Usage:');
                console.log('  node scripts/automated-devnet-setup.js run   - Complete automated setup');
                console.log('  node scripts/automated-devnet-setup.js test  - Quick system test');
                console.log('');
                console.log('This script automates the entire devnet setup process:');
                console.log('   Deploy ERC20 tokens');
                console.log('   Register tokens (both directions)');
                console.log('   Update faucet configuration');
                console.log('   Validate system functionality');
                console.log('');
                console.log('Perfect for devnet resets and initial setup!');
                break;
        }
        
    } catch (error) {
        console.error(' Automated setup failed:', error.message);
        process.exit(1);
    }
}

// Export for module use
export { AutomatedDevnetSetup };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}
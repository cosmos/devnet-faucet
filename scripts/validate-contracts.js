#!/usr/bin/env node

/**
 * Contract Validation Startup Script
 * 
 * This script validates all contract addresses before starting the faucet.
 * It ensures that:
 * - All configured addresses point to valid contracts
 * - Contracts have the expected interface and properties
 * - Faucet has proper permissions/ownership
 * - Network is correct and reachable
 * 
 * Usage:
 *   node scripts/validate-contracts.js              # Validate only
 *   node scripts/validate-contracts.js --fix        # Validate and fix issues
 *   node scripts/validate-contracts.js --interactive # Interactive mode
 */

import { ContractValidator } from '../src/ContractValidator.js';
import config from '../config.js';
import secureKeyManager from '../src/SecureKeyManager.js';
import 'dotenv/config';

class ValidationRunner {
    constructor(options = {}) {
        this.options = options;
        this.validator = null;
    }

    async run() {
        console.log('🔍 COSMOS EVM FAUCET - CONTRACT VALIDATION');
        console.log('==========================================');
        
        try {
            // Initialize validator
            this.validator = new ContractValidator(config, secureKeyManager);
            await this.validator.initialize();
            
            // Validate network connectivity
            await this.validateNetwork();
            
            // Validate all contracts
            const results = await this.validator.validateAllContracts();
            
            // Show detailed report
            console.log(this.validator.generateValidationReport());
            
            // Handle failures if needed
            if (!results.allValid) {
                if (this.options.fix || this.options.interactive) {
                    console.log('\n🔧 ATTEMPTING TO RESOLVE ISSUES...');
                    const resolved = await this.validator.resolveValidationFailures();
                    
                    if (resolved) {
                        console.log('\n✅ All issues resolved! Faucet ready to start.');
                        process.exit(0);
                    } else {
                        console.log('\n❌ Some issues remain unresolved.');
                        process.exit(1);
                    }
                } else {
                    console.log('\n❌ VALIDATION FAILED');
                    console.log('Run with --fix or --interactive to resolve issues');
                    console.log('Or manually update config.js with correct addresses');
                    process.exit(1);
                }
            } else {
                console.log('\n✅ ALL CONTRACTS VALIDATED SUCCESSFULLY!');
                console.log('Faucet is ready to start.');
                process.exit(0);
            }
            
        } catch (error) {
            console.error('\n💥 VALIDATION ERROR:', error.message);
            console.error('Stack:', error.stack);
            process.exit(1);
        }
    }

    async validateNetwork() {
        console.log('\n🌐 Validating network connectivity...');
        
        try {
            const provider = this.validator.provider;
            
            // Check network connection
            const network = await provider.getNetwork();
            console.log(`   ✅ Connected to network: Chain ID ${network.chainId}`);
            
            // Verify chain ID matches config
            const expectedChainId = BigInt(config.blockchain.ids.chainId);
            if (network.chainId !== expectedChainId) {
                throw new Error(`Chain ID mismatch: expected ${expectedChainId}, got ${network.chainId}`);
            }
            
            // Check faucet balance
            const balance = await provider.getBalance(this.validator.faucetAddress);
            const balanceEth = Number(balance) / 1e18;
            console.log(`   💰 Faucet balance: ${balanceEth.toFixed(4)} ETH`);
            
            if (balanceEth < 0.01) {
                console.warn('   ⚠️  Low faucet balance - may not be able to send transactions');
            }
            
        } catch (error) {
            throw new Error(`Network validation failed: ${error.message}`);
        }
    }

    showHelp() {
        console.log(`
Cosmos EVM Faucet - Contract Validation

This script validates that all contract addresses in config.js are valid,
accessible, and properly configured for the current network.

Usage:
  node scripts/validate-contracts.js [options]

Options:
  --fix          Automatically attempt to fix validation failures
  --interactive  Interactive mode - prompt for user input on failures
  --help, -h     Show this help message

Examples:
  node scripts/validate-contracts.js                 # Validate only
  node scripts/validate-contracts.js --fix           # Auto-fix issues
  node scripts/validate-contracts.js --interactive   # Interactive fixes

Exit Codes:
  0  All contracts valid
  1  Validation failed or error occurred

Contract Validation Checks:
  ✓ Network connectivity and chain ID
  ✓ Contract addresses point to deployed contracts
  ✓ Contracts have expected interfaces (ERC20, AtomicMultiSend)
  ✓ Token contracts have correct symbol and decimals
  ✓ Faucet has proper ownership/permissions
  ✓ Contract addresses are unique (no conflicts)
`);
    }
}

function parseArgs() {
    const args = process.argv.slice(2);
    return {
        fix: args.includes('--fix'),
        interactive: args.includes('--interactive'),
        help: args.includes('--help') || args.includes('-h')
    };
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const options = parseArgs();
    
    if (options.help) {
        new ValidationRunner().showHelp();
        process.exit(0);
    }
    
    const runner = new ValidationRunner(options);
    runner.run().catch(error => {
        console.error('Validation runner failed:', error);
        process.exit(1);
    });
}

export { ValidationRunner };
/**
 * Contract Validation and Deployment System
 * 
 * This system validates that all contract addresses in config.js are:
 * 1. Valid contracts (not EOA addresses)
 * 2. Have the expected contract interface
 * 3. Are owned/controlled by the faucet wallet
 * 4. Actually deployed on the current network
 * 
 * If validation fails, it provides options to:
 * - Enter known valid addresses manually
 * - Deploy new contracts automatically
 * - Skip problematic contracts
 */

import { JsonRpcProvider, Contract } from 'ethers';
import fs from 'fs/promises';
import readline from 'readline';

export class ContractValidator {
    constructor(config, secureKeyManager) {
        this.config = config;
        this.keyManager = secureKeyManager;
        this.provider = new JsonRpcProvider(config.blockchain.endpoints.evm_endpoint);
        this.faucetAddress = null;
        this.validationResults = {};
        
        // Standard ERC20 ABI for token validation
        this.erc20ABI = [
            "function name() view returns (string)",
            "function symbol() view returns (string)", 
            "function decimals() view returns (uint8)",
            "function totalSupply() view returns (uint256)",
            "function balanceOf(address) view returns (uint256)",
            "function owner() view returns (address)"
        ];
        
        // AtomicMultiSend ABI for contract validation  
        this.atomicMultiSendABI = [
            "function owner() view returns (address)",
            "function atomicMultiSend(address payable recipient, tuple(address token, uint256 amount)[] transfers) payable",
            "function getBalance(address token) view returns (uint256)"
        ];
    }

    async initialize() {
        await this.keyManager.initialize();
        this.faucetAddress = this.keyManager.getEvmAddress();
        console.log(` Faucet Address: ${this.faucetAddress}`);
    }

    /**
     * Main validation entry point
     */
    async validateAllContracts() {
        console.log('\n VALIDATING CONTRACT ADDRESSES');
        console.log('=====================================');
        
        const results = {
            tokens: {},
            atomicMultiSend: null,
            needsDeployment: [],
            needsManualInput: [],
            allValid: true
        };

        // Validate token contracts
        for (const token of this.config.blockchain.tx.amounts) {
            console.log(`\n Validating ${token.denom.toUpperCase()} token...`);
            const result = await this.validateTokenContract(token);
            results.tokens[token.denom] = result;
            
            if (!result.valid) {
                results.allValid = false;
                if (result.shouldRedeploy) {
                    results.needsDeployment.push({type: 'token', denom: token.denom, config: token});
                } else {
                    results.needsManualInput.push({type: 'token', denom: token.denom, config: token});
                }
            }
        }

        // Validate AtomicMultiSend contract
        console.log(`\n Validating AtomicMultiSend contract...`);
        const atomicResult = await this.validateAtomicMultiSendContract();
        results.atomicMultiSend = atomicResult;
        
        if (!atomicResult.valid) {
            results.allValid = false;
            if (atomicResult.shouldRedeploy) {
                results.needsDeployment.push({type: 'atomicMultiSend'});
            } else {
                results.needsManualInput.push({type: 'atomicMultiSend'});
            }
        }

        this.validationResults = results;
        return results;
    }

    async validateTokenContract(tokenConfig) {
        const address = tokenConfig.erc20_contract;
        const result = {
            valid: false,
            address: address,
            reason: '',
            contractData: null,
            shouldRedeploy: false,
            ownedByFaucet: false
        };

        try {
            // Check if address is set
            if (!address || address === "0x0000000000000000000000000000000000000000") {
                result.reason = 'No address configured';
                result.shouldRedeploy = true;
                console.log(`   No address configured`);
                return result;
            }

            // Check if address has contract code
            const code = await this.provider.getCode(address);
            if (code === '0x') {
                result.reason = 'No contract deployed at address';
                result.shouldRedeploy = true;
                console.log(`   No contract at ${address}`);
                return result;
            }

            // Try to instantiate contract and call basic functions
            const contract = new Contract(address, this.erc20ABI, this.provider);
            
            try {
                const [name, symbol, decimals] = await Promise.all([
                    contract.name(),
                    contract.symbol(), 
                    contract.decimals()
                ]);

                result.contractData = { name, symbol, decimals: Number(decimals) };
                
                // Validate expected properties (skip symbol check for native tokens)
                const isNativeToken = tokenConfig.denom === 'uatom' && tokenConfig.erc20_contract === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
                if (!isNativeToken && symbol.toUpperCase() !== tokenConfig.denom.toUpperCase()) {
                    result.reason = `Symbol mismatch: expected ${tokenConfig.denom.toUpperCase()}, got ${symbol}`;
                    console.log(`    Symbol mismatch: expected ${tokenConfig.denom.toUpperCase()}, got ${symbol}`);
                    return result;
                } else if (isNativeToken) {
                    console.log(`    Native token wrapper detected - symbol validation skipped`);
                }

                if (!isNativeToken && Number(decimals) !== tokenConfig.decimals) {
                    result.reason = `Decimals mismatch: expected ${tokenConfig.decimals}, got ${decimals}`;
                    console.log(`    Decimals mismatch: expected ${tokenConfig.decimals}, got ${decimals}`);
                    return result;
                } else if (isNativeToken) {
                    console.log(`    Native token wrapper - decimals validation skipped (expected ${tokenConfig.decimals}, got ${decimals})`);
                }

                // Check ownership if possible
                try {
                    const owner = await contract.owner();
                    result.ownedByFaucet = (owner.toLowerCase() === this.faucetAddress.toLowerCase());
                    console.log(`   Owner: ${owner} ${result.ownedByFaucet ? '(Faucet )' : '(External )'}`);
                } catch (e) {
                    console.log(`   No owner() function - may not be Ownable`);
                }

                result.valid = true;
                console.log(`   Valid ${symbol} token at ${address}`);
                console.log(`     Name: ${name}, Decimals: ${decimals}`);
                
            } catch (contractError) {
                result.reason = `Contract call failed: ${contractError.message}`;
                console.log(`   Contract calls failed: ${contractError.message}`);
                return result;
            }

        } catch (error) {
            result.reason = `Validation error: ${error.message}`;
            console.log(`   Validation failed: ${error.message}`);
        }

        return result;
    }

    async validateAtomicMultiSendContract() {
        const address = this.config.blockchain.contracts.atomicMultiSend;
        const result = {
            valid: false,
            address: address,
            reason: '',
            contractData: null,
            shouldRedeploy: false,
            ownedByFaucet: false
        };

        try {
            // Check if address is set
            if (!address) {
                result.reason = 'No address configured';
                result.shouldRedeploy = true;
                console.log(`   No address configured`);
                return result;
            }

            // Check if address has contract code
            const code = await this.provider.getCode(address);
            if (code === '0x') {
                result.reason = 'No contract deployed at address';
                result.shouldRedeploy = true;
                console.log(`   No contract at ${address}`);
                return result;
            }

            // Try to instantiate contract and call functions
            const contract = new Contract(address, this.atomicMultiSendABI, this.provider);
            
            try {
                const owner = await contract.owner();
                result.ownedByFaucet = (owner.toLowerCase() === this.faucetAddress.toLowerCase());
                result.contractData = { owner };
                
                console.log(`   Owner: ${owner} ${result.ownedByFaucet ? '(Faucet )' : '(External )'}`);
                
                if (!result.ownedByFaucet) {
                    result.reason = `Contract owned by ${owner}, not faucet (${this.faucetAddress})`;
                    console.log(`    Contract not owned by faucet`);
                    return result;
                }

                result.valid = true;
                console.log(`   Valid AtomicMultiSend contract at ${address}`);
                
            } catch (contractError) {
                result.reason = `Contract call failed: ${contractError.message}`;
                console.log(`   Contract calls failed: ${contractError.message}`);
                return result;
            }

        } catch (error) {
            result.reason = `Validation error: ${error.message}`;
            console.log(`   Validation failed: ${error.message}`);
        }

        return result;
    }

    /**
     * Interactive resolution of validation failures
     */
    async resolveValidationFailures() {
        if (this.validationResults.allValid) {
            console.log('\n All contracts validated successfully!');
            return true;
        }

        console.log('\n  VALIDATION FAILURES DETECTED');
        console.log('=====================================');
        
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const question = (text) => new Promise((resolve) => rl.question(text, resolve));

        try {
            // Handle contracts that need manual input
            for (const item of this.validationResults.needsManualInput) {
                console.log(`\n ${item.type === 'token' ? item.denom.toUpperCase() + ' token' : 'AtomicMultiSend'} validation failed`);
                console.log(`   Reason: ${this.validationResults[item.type === 'token' ? 'tokens' : 'atomicMultiSend'][item.denom || 0]?.reason || 'Unknown'}`);
                
                const action = await question(
                    `   Options:\n` +
                    `   [1] Enter known valid address manually\n` +
                    `   [2] Deploy new contract\n` +
                    `   [3] Skip (may cause faucet errors)\n` +
                    `   Choose (1-3): `
                );

                switch (action.trim()) {
                    case '1':
                        const address = await question(`   Enter valid ${item.type === 'token' ? item.denom.toUpperCase() : 'AtomicMultiSend'} address: `);
                        await this.updateConfigAddress(item, address);
                        break;
                    case '2':
                        await this.deployContract(item);
                        break;
                    case '3':
                        console.log(`     Skipping ${item.type === 'token' ? item.denom.toUpperCase() : 'AtomicMultiSend'} - may cause errors`);
                        break;
                    default:
                        console.log(`   Invalid choice, skipping...`);
                }
            }

            // Handle contracts that need deployment
            if (this.validationResults.needsDeployment.length > 0) {
                console.log(`\n ${this.validationResults.needsDeployment.length} contracts need deployment`);
                const deploy = await question(`   Deploy all missing contracts? (y/n): `);
                
                if (deploy.toLowerCase() === 'y' || deploy.toLowerCase() === 'yes') {
                    for (const item of this.validationResults.needsDeployment) {
                        await this.deployContract(item);
                    }
                }
            }

        } finally {
            rl.close();
        }

        // Re-validate after changes
        console.log('\n Re-validating contracts...');
        const newResults = await this.validateAllContracts();
        return newResults.allValid;
    }

    async updateConfigAddress(item, address) {
        try {
            console.log(`    Updating config with ${item.type === 'token' ? item.denom.toUpperCase() : 'AtomicMultiSend'}: ${address}`);
            
            const configPath = './config.js';
            let configContent = await fs.readFile(configPath, 'utf8');
            
            if (item.type === 'token') {
                // Update token address
                const tokenRegex = new RegExp(
                    `(denom:\\s*"${item.denom}"[\\s\\S]*?erc20_contract:\\s*)"[^"]*"`,
                    'g'
                );
                configContent = configContent.replace(tokenRegex, `$1"${address}"`);
            } else {
                // Update AtomicMultiSend address
                const atomicRegex = /atomicMultiSend:\s*(?:"[^"]*"|null)/;
                configContent = configContent.replace(atomicRegex, `atomicMultiSend: "${address}"`);
            }
            
            await fs.writeFile(configPath, configContent);
            console.log(`    Config updated`);
            
        } catch (error) {
            console.error(`    Failed to update config: ${error.message}`);
        }
    }

    async deployContract(item) {
        console.log(`    Deploying ${item.type === 'token' ? item.denom.toUpperCase() + ' token' : 'AtomicMultiSend'}...`);
        
        try {
            if (item.type === 'token') {
                // Deploy single token
                const { execAsync } = await import('util');
                const { promisify } = await import('util');
                const exec = promisify(execAsync);
                
                // Create temporary registry with just this token
                const tempRegistry = {
                    meta: {
                        version: "1.0.0",
                        description: "Temporary token registry",
                        network: "cosmos-evm-testnet"
                    },
                    tokens: [this.createTokenDefinition(item.config)]
                };
                
                await fs.writeFile('./temp-token-registry.json', JSON.stringify(tempRegistry, null, 2));
                
                const { stdout } = await exec('REGISTRY_FILE=temp-token-registry.json node scripts/deploy-token-registry.js');
                console.log(`    Token deployed successfully`);
                
                // Parse deployment output for address
                const report = JSON.parse(await fs.readFile('./deployments/token-deployment-report.json', 'utf8'));
                const deployment = report.deployments.find(d => d.symbol === item.denom.toUpperCase());
                
                if (deployment) {
                    await this.updateConfigAddress(item, deployment.address);
                }
                
                // Cleanup
                await fs.unlink('./temp-token-registry.json').catch(() => {});
                
            } else {
                // Deploy AtomicMultiSend
                const { execAsync } = await import('util');
                const { promisify } = await import('util');
                const exec = promisify(execAsync);
                
                const { stdout } = await exec(
                    `MNEMONIC="${process.env.MNEMONIC}" PRIVATE_KEY=${this.keyManager.getPrivateKey()} forge script script/DeployAtomicMultiSend.s.sol --rpc-url ${this.config.blockchain.endpoints.evm_endpoint} --broadcast --skip-simulation`
                );
                
                // Parse deployment output for address
                const addressMatch = stdout.match(/AtomicMultiSend deployed at: (0x[a-fA-F0-9]{40})/);
                if (addressMatch) {
                    await this.updateConfigAddress(item, addressMatch[1]);
                    console.log(`    AtomicMultiSend deployed at ${addressMatch[1]}`);
                }
            }
            
        } catch (error) {
            console.error(`    Deployment failed: ${error.message}`);
        }
    }

    createTokenDefinition(tokenConfig) {
        return {
            name: this.getTokenName(tokenConfig.denom),
            symbol: tokenConfig.denom.toUpperCase(),
            decimals: tokenConfig.decimals,
            description: `${this.getTokenName(tokenConfig.denom)} for cosmos-evm testnet`,
            features: {
                mintable: true,
                burnable: true,
                pausable: false,
                permit: false,
                snapshots: false,
                flashMint: false,
                capped: false
            },
            roles: {
                owner: this.faucetAddress,
                minter: this.faucetAddress,
                pauser: this.faucetAddress
            },
            distribution: [{
                wallet: this.faucetAddress,
                amount: "100000000000000"
            }],
            faucet: {
                enabled: true,
                amount: tokenConfig.amount,
                targetBalance: tokenConfig.target_balance
            }
        };
    }

    getTokenName(denom) {
        const names = {
            wbtc: "Wrapped Bitcoin",
            pepe: "Pepe Token", 
            usdt: "Tether USD"
        };
        return names[denom.toLowerCase()] || denom.toUpperCase();
    }

    /**
     * Generate a summary of current contract state
     */
    generateValidationReport() {
        if (!this.validationResults) return "No validation performed yet";
        
        let report = "\n CONTRACT VALIDATION REPORT\n";
        report += "=====================================\n";
        
        // Token status
        report += "\n Token Contracts:\n";
        for (const [denom, result] of Object.entries(this.validationResults.tokens)) {
            const status = result.valid ? "" : "";
            const ownership = result.ownedByFaucet ? " Owned" : " External";
            report += `   ${status} ${denom.toUpperCase()}: ${result.address || 'Not configured'}\n`;
            if (result.contractData) {
                report += `      ${result.contractData.name} (${result.contractData.decimals} decimals) ${ownership}\n`;
            }
            if (!result.valid) {
                report += `        ${result.reason}\n`;
            }
        }
        
        // AtomicMultiSend status
        report += "\n AtomicMultiSend Contract:\n";
        const atomic = this.validationResults.atomicMultiSend;
        const atomicStatus = atomic.valid ? "" : "";
        const atomicOwnership = atomic.ownedByFaucet ? " Owned" : " External";
        report += `   ${atomicStatus} AtomicMultiSend: ${atomic.address || 'Not configured'}\n`;
        if (atomic.contractData) {
            report += `      ${atomicOwnership}\n`;
        }
        if (!atomic.valid) {
            report += `        ${atomic.reason}\n`;
        }
        
        // Summary
        report += `\n Summary:\n`;
        report += `   Total Contracts: ${Object.keys(this.validationResults.tokens).length + 1}\n`;
        report += `   Valid: ${Object.values(this.validationResults.tokens).filter(r => r.valid).length + (atomic.valid ? 1 : 0)}\n`;
        report += `   Need Deployment: ${this.validationResults.needsDeployment.length}\n`;
        report += `   Need Manual Input: ${this.validationResults.needsManualInput.length}\n`;
        report += `   Overall Status: ${this.validationResults.allValid ? " ALL VALID" : " VALIDATION REQUIRED"}\n`;
        
        return report;
    }
}

export default ContractValidator;
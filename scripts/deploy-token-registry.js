#!/usr/bin/env node

/**
 * Comprehensive Token Registry Deployment System
 * Deploys all tokens defined in token-registry.json
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';
import config from '../config.js';
import secureKeyManager from '../src/SecureKeyManager.js';

const execAsync = promisify(exec);

class TokenRegistryDeployer {
    constructor() {
        this.registry = null;
        this.deploymentResults = [];
        this.provider = new ethers.JsonRpcProvider(config.blockchain.endpoints.evm_endpoint);
        this.wallet = null; // Will be initialized after secure key manager setup
    }

    async initializeWallet() {
        // Initialize secure key manager if not already done
        if (!secureKeyManager.isInitialized()) {
            await secureKeyManager.initialize();
        }
        
        // Create wallet with private key from secure manager
        const privateKey = secureKeyManager.getPrivateKeyHex();
        this.wallet = new ethers.Wallet(privateKey, this.provider);
    }

    async loadRegistry() {
        console.log(' Loading token registry...');
        
        const registryPath = path.join(process.cwd(), 'token-registry.json');
        if (!fs.existsSync(registryPath)) {
            throw new Error('token-registry.json not found');
        }
        
        const registryContent = fs.readFileSync(registryPath, 'utf8');
        this.registry = JSON.parse(registryContent);
        
        console.log(` Loaded ${this.registry.tokens.length} token definitions`);
    }

    async generateSolidityContracts() {
        console.log(' Generating Solidity contracts...');
        
        for (const token of this.registry.tokens) {
            await this.generateTokenContract(token);
        }
        
        console.log(' All Solidity contracts generated');
    }

    async generateTokenContract(token) {
        const contractCode = this.buildTokenContract(token);
        const contractPath = path.join(process.cwd(), 'src', 'tokens', `${token.symbol}.sol`);
        
        // Ensure directory exists
        const tokenDir = path.dirname(contractPath);
        if (!fs.existsSync(tokenDir)) {
            fs.mkdirSync(tokenDir, { recursive: true });
        }
        
        fs.writeFileSync(contractPath, contractCode);
        console.log(`   Generated: ${token.symbol}.sol`);
    }

    buildTokenContract(token) {
        const imports = this.getRequiredImports(token.features);
        const inheritance = this.getContractInheritance(token.features);
        const constructor = this.buildConstructor(token);
        const features = this.buildFeatures(token.features);
        
        return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

${imports.join('\n')}

/**
 * @title ${token.name}
 * @dev ${token.description || 'ERC20 token generated from registry'}
 */
contract ${token.symbol} is ${inheritance.join(', ')} {
${constructor}

${features}
}
`;
    }

    getRequiredImports(features) {
        const imports = [
            'import "@openzeppelin/contracts/token/ERC20/ERC20.sol";',
            'import "@openzeppelin/contracts/access/Ownable.sol";'
        ];
        
        if (features.mintable) {
            imports.push('import "@openzeppelin/contracts/access/AccessControl.sol";');
        }
        if (features.burnable) {
            imports.push('import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";');
        }
        if (features.pausable) {
            imports.push('import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";');
            imports.push('import "@openzeppelin/contracts/access/AccessControl.sol";');
        }
        if (features.permit) {
            imports.push('import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";');
        }
        if (features.snapshots) {
            imports.push('import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Snapshot.sol";');
        }
        if (features.flashMint) {
            imports.push('import "@openzeppelin/contracts/token/ERC20/extensions/ERC20FlashMint.sol";');
        }
        if (features.capped) {
            imports.push('import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";');
        }
        
        return imports;
    }

    getContractInheritance(features) {
        const inheritance = ['ERC20'];
        
        if (features.burnable) inheritance.push('ERC20Burnable');
        if (features.pausable) inheritance.push('ERC20Pausable');
        if (features.permit) inheritance.push('ERC20Permit');
        if (features.snapshots) inheritance.push('ERC20Snapshot');
        if (features.flashMint) inheritance.push('ERC20FlashMint');
        if (features.capped) inheritance.push('ERC20Capped');
        
        inheritance.push('Ownable');
        
        if (features.mintable || features.pausable) {
            inheritance.push('AccessControl');
        }
        
        return inheritance;
    }

    buildConstructor(token) {
        const roles = [];
        if (token.features.mintable) {
            roles.push('    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");');
        }
        if (token.features.pausable) {
            roles.push('    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");');
        }

        const constructorParams = [
            `"${token.name}"`,
            `"${token.symbol}"`
        ];

        if (token.features.permit) {
            constructorParams.push(`"${token.name}"`);
        }
        if (token.features.capped && token.maxSupply) {
            constructorParams.push(token.maxSupply);
        }

        const constructorCall = `ERC20(${constructorParams.slice(0, 2).join(', ')})`;
        let allConstructorCalls = [constructorCall];

        if (token.features.permit) allConstructorCalls.push('ERC20Permit("' + token.name + '")');
        if (token.features.capped && token.maxSupply) allConstructorCalls.push(`ERC20Capped(${token.maxSupply})`);
        allConstructorCalls.push(`Ownable(${token.roles.owner})`);

        const constructorBody = [
            '        // Grant roles',
            ...(token.features.mintable ? ['        _grantRole(MINTER_ROLE, ' + token.roles.minter + ');'] : []),
            ...(token.features.pausable ? ['        _grantRole(PAUSER_ROLE, ' + token.roles.pauser + ');'] : []),
            '',
            '        // Initial token distribution'
        ];

        for (const dist of token.distribution || []) {
            constructorBody.push(`        _mint(${dist.wallet}, ${dist.amount});`);
        }

        return `${roles.length > 0 ? '\n' + roles.join('\n') + '\n' : ''}
    constructor(address initialOwner) 
        ${allConstructorCalls.join('\n        ')}
    {
${constructorBody.join('\n')}
    }`;
    }

    buildFeatures(features) {
        const featureFunctions = [];

        if (features.mintable) {
            featureFunctions.push(`
    function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }`);
        }

        if (features.pausable) {
            featureFunctions.push(`
    function pause() public onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() public onlyRole(PAUSER_ROLE) {
        _unpause();
    }`);
        }

        if (features.snapshots) {
            featureFunctions.push(`
    function snapshot() public onlyOwner returns (uint256) {
        return _snapshot();
    }`);
        }

        // Override functions for multiple inheritance
        if (features.pausable && (features.capped || features.burnable)) {
            featureFunctions.push(`
    function _update(address from, address to, uint256 value) internal override(ERC20${features.pausable ? ', ERC20Pausable' : ''}${features.capped ? ', ERC20Capped' : ''}) {
        super._update(from, to, value);
    }`);
        }

        return featureFunctions.join('\n');
    }

    async compileContracts() {
        console.log(' Compiling contracts...');
        
        try {
            const { stdout } = await execAsync('forge build');
            console.log(' Contracts compiled successfully');
            return true;
        } catch (error) {
            console.error(' Contract compilation failed:', error.message);
            return false;
        }
    }

    async deployTokens() {
        console.log(' Deploying tokens...');
        
        for (const token of this.registry.tokens) {
            await this.deployToken(token);
        }
        
        console.log(' All tokens deployed');
    }

    async deployToken(token) {
        console.log(`\n Deploying ${token.name} (${token.symbol})...`);
        
        try {
            // Load contract artifact
            const artifactPath = path.join(process.cwd(), 'out', `${token.symbol}.sol`, `${token.symbol}.json`);
            if (!fs.existsSync(artifactPath)) {
                throw new Error(`Contract artifact not found: ${artifactPath}`);
            }
            
            const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
            
            // Deploy contract
            const contractFactory = new ethers.ContractFactory(
                artifact.abi,
                artifact.bytecode.object,
                this.wallet
            );
            
            const ownerAddress = config.derivedAddresses.evm.address;
            console.log(`   Deploying with owner: ${ownerAddress}`);
            const contract = await contractFactory.deploy(ownerAddress);
            await contract.waitForDeployment();
            
            const deployedAddress = await contract.getAddress();
            console.log(`   ${token.symbol} deployed at: ${deployedAddress}`);
            
            // Verify deployment
            const symbol = await contract.symbol();
            const name = await contract.name();
            const decimals = await contract.decimals();
            const totalSupply = await contract.totalSupply();
            
            console.log(`     Symbol: ${symbol}`);
            console.log(`     Name: ${name}`);
            console.log(`     Decimals: ${decimals}`);
            console.log(`     Total Supply: ${ethers.formatUnits(totalSupply, decimals)}`);
            
            // Store deployment result
            this.deploymentResults.push({
                name: token.name,
                symbol: token.symbol,
                address: deployedAddress,
                decimals: Number(decimals),
                totalSupply: totalSupply.toString(),
                deploymentBlock: (await this.provider.getBlockNumber()).toString(),
                transactionHash: contract.deploymentTransaction()?.hash
            });
            
        } catch (error) {
            console.error(` Failed to deploy ${token.symbol}:`, error.message);
            throw error;
        }
    }

    async updateConfigWithDeployments() {
        console.log('  Updating configuration with deployed addresses...');
        
        // Update config.js with new token addresses
        let configContent = fs.readFileSync('config.js', 'utf8');
        
        // Update the amounts array with deployed addresses
        const updatedAmounts = this.registry.tokens
            .filter(token => token.faucet?.enabled)
            .map((token, index) => {
                const deployment = this.deploymentResults.find(d => d.symbol === token.symbol);
                return {
                    denom: token.symbol.toLowerCase(),
                    amount: token.faucet.amount,
                    erc20_contract: deployment?.address || "0x0000000000000000000000000000000000000000",
                    decimals: token.decimals,
                    target_balance: token.faucet.targetBalance
                };
            });
        
        // Write updated registry with addresses
        this.registry.tokens.forEach(token => {
            const deployment = this.deploymentResults.find(d => d.symbol === token.symbol);
            if (deployment) {
                token.contractAddress = deployment.address;
                token.deploymentBlock = deployment.deploymentBlock;
                token.deployer = config.derivedAddresses.evm.address;
            }
        });
        
        this.registry.meta.updatedAt = new Date().toISOString();
        fs.writeFileSync('token-registry.json', JSON.stringify(this.registry, null, 2));
        
        console.log(' Configuration updated');
    }

    async saveDeploymentReport() {
        console.log(' Saving deployment report...');
        
        const report = {
            timestamp: new Date().toISOString(),
            network: this.registry.meta.network,
            deployer: config.derivedAddresses.evm.address,
            deployments: this.deploymentResults,
            summary: {
                totalTokens: this.deploymentResults.length,
                successfulDeployments: this.deploymentResults.length,
                failedDeployments: 0
            }
        };
        
        const reportPath = path.join(process.cwd(), 'deployments', 'token-deployment-report.json');
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        
        console.log(` Deployment report saved: ${reportPath}`);
    }

    async deploy() {
        const startTime = Date.now();
        console.log(' Starting comprehensive token registry deployment...\n');
        
        try {
            await this.initializeWallet();
            await this.loadRegistry();
            await this.generateSolidityContracts();
            
            const compiled = await this.compileContracts();
            if (!compiled) {
                throw new Error('Contract compilation failed');
            }
            
            await this.deployTokens();
            await this.updateConfigWithDeployments();
            await this.saveDeploymentReport();
            
            const duration = (Date.now() - startTime) / 1000;
            
            console.log('\n Token registry deployment completed successfully!');
            console.log(`  Total time: ${duration.toFixed(2)}s`);
            console.log(` Deployed ${this.deploymentResults.length} tokens`);
            
            console.log('\n Deployed Tokens:');
            this.deploymentResults.forEach(token => {
                console.log(`  • ${token.name} (${token.symbol}): ${token.address}`);
            });
            
        } catch (error) {
            const duration = (Date.now() - startTime) / 1000;
            console.error('\n Token registry deployment failed!');
            console.error(`  Failed after: ${duration.toFixed(2)}s`);
            console.error(` Error: ${error.message}`);
            process.exit(1);
        }
    }
}

// Run deployment if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const deployer = new TokenRegistryDeployer();
    deployer.deploy();
}

export default TokenRegistryDeployer;
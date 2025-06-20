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
import secureKeyManager from '../src/SecureKeyManager.js';

const execAsync = promisify(exec);

// Load network configuration from main config
import configModule from '../config.js';
const config = configModule.default || configModule;

class TokenRegistryDeployer {
    constructor() {
        this.registry = null;
        this.deploymentResults = [];
        this.provider = new ethers.JsonRpcProvider(config.blockchain.endpoints.evm_endpoint);
        this.wallet = null; // Will be initialized after secure key manager setup
    }

    async initializeWallet() {
        // Initialize secure key manager (it handles re-initialization safely)
        await secureKeyManager.initialize();
        
        // Create wallet with private key from secure manager
        const privateKey = secureKeyManager.getPrivateKeyHex();
        this.wallet = new ethers.Wallet(privateKey, this.provider);
    }

    async loadRegistry() {
        console.log(' Loading token configuration...');
        
        const tokensPath = path.join(process.cwd(), 'tokens.json');
        if (!fs.existsSync(tokensPath)) {
            throw new Error('tokens.json not found');
        }
        
        const tokensContent = fs.readFileSync(tokensPath, 'utf8');
        this.tokensConfig = JSON.parse(tokensContent);
        
        // Extract and transform ERC20 tokens for deployment
        this.registry = {
            tokens: this.tokensConfig.tokens
                .filter(t => t.type === 'erc20')
                .map(token => ({
                    // Basic info
                    name: token.name,
                    symbol: token.symbol,
                    decimals: token.decimals,
                    description: token.description,
                    
                    // Features
                    features: token.features,
                    
                    // Roles - map from governance structure
                    roles: {
                        owner: token.governance?.roles?.owner?.address || secureKeyManager.getEvmAddress(),
                        minter: token.governance?.roles?.minter?.address || secureKeyManager.getEvmAddress(),
                        pauser: token.governance?.roles?.pauser?.address || secureKeyManager.getEvmAddress()
                    },
                    
                    // Distribution
                    distribution: token.distribution?.initialDistribution?.map(d => ({
                        wallet: d.recipient,
                        amount: d.amount
                    })) || [{
                        wallet: secureKeyManager.getEvmAddress(),
                        amount: token.tokenomics?.initialSupply || "1000000000000000000000000"
                    }],
                    
                    // Faucet config
                    faucet: {
                        enabled: token.faucet?.enabled || true,
                        amount: token.faucet?.configuration?.amountPerRequest,
                        targetBalance: token.faucet?.configuration?.targetBalance
                    },
                    
                    // Keep reference to original for updates
                    _original: token
                }))
        };
        
        console.log(` Loaded ${this.registry.tokens.length} ERC20 token definitions`);
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
        const features = this.buildFeatures(token.features, token);
        
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
        allConstructorCalls.push('Ownable()');

        const constructorBody = [
            '        // Transfer ownership to the provided initialOwner (faucet)',
            '        _transferOwnership(initialOwner);',
            '',
            '        // Grant roles to the initialOwner',
            ...(token.features.mintable ? ['        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);', '        _grantRole(MINTER_ROLE, initialOwner);'] : []),
            ...(token.features.pausable ? ['        _grantRole(PAUSER_ROLE, initialOwner);'] : []),
            '',
            '        // Mint initial supply to the initialOwner (faucet)'
        ];

        // Always mint to initialOwner instead of hardcoded addresses
        for (const dist of token.distribution || []) {
            constructorBody.push(`        _mint(initialOwner, ${dist.amount}); // ${token.name} initial supply`);
        }

        return `${roles.length > 0 ? '\n' + roles.join('\n') + '\n' : ''}
    constructor(address initialOwner) 
        ${allConstructorCalls.join('\n        ')}
    {
${constructorBody.join('\n')}
    }`;
    }

    buildFeatures(features, token) {
        const featureFunctions = [];

        // Add decimals override if not 18 (ERC20 default)
        if (token.decimals && token.decimals !== 18) {
            featureFunctions.push(`
    function decimals() public view virtual override returns (uint8) {
        return ${token.decimals};
    }`);
        }

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
        
        // Deploy tokens sequentially with nonce management
        for (let i = 0; i < this.registry.tokens.length; i++) {
            const token = this.registry.tokens[i];
            console.log(`\n[${i + 1}/${this.registry.tokens.length}] Deploying ${token.symbol}...`);
            
            await this.deployToken(token);
            
            // Wait for the transaction to be confirmed before proceeding
            if (i < this.registry.tokens.length - 1) {
                console.log(' Waiting 5 seconds before next deployment...');
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
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
            
            // Get current nonce for sequential deployment
            const currentNonce = await this.provider.getTransactionCount(this.wallet.address, 'pending');
            console.log(`   Using nonce: ${currentNonce}`);
            
            // Deploy contract with explicit nonce
            const contractFactory = new ethers.ContractFactory(
                artifact.abi,
                artifact.bytecode.object,
                this.wallet
            );
            
            const ownerAddress = secureKeyManager.getEvmAddress();
            console.log(`   Deploying with owner: ${ownerAddress}`);
            
            const deployTx = await contractFactory.deploy(ownerAddress, {
                nonce: currentNonce,
                gasLimit: 2000000
            });
            
            console.log(`   Transaction hash: ${deployTx.deploymentTransaction()?.hash}`);
            const contract = await deployTx.waitForDeployment();
            
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
            
            // Wait a moment and verify the contract exists
            console.log(`   Waiting 3 seconds for block confirmation...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            const code = await this.provider.getCode(deployedAddress);
            if (code === '0x') {
                throw new Error(`Contract not found at ${deployedAddress} after deployment - possible network reorg`);
            }
            console.log(`   ✓ Contract verified on-chain`);
            
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
        
        // Update tokens.json with new contract addresses
        const tokensPath = path.join(process.cwd(), 'tokens.json');
        let tokensConfig = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
        
        // Update each token's contract address in tokens.json
        for (const deployment of this.deploymentResults) {
            const tokenEntry = tokensConfig.tokens.find(t => t.symbol === deployment.symbol);
            if (tokenEntry) {
                tokenEntry.contract.address = deployment.address;
                tokenEntry.contract.deploymentBlock = deployment.deploymentBlock;
                tokenEntry.contract.deploymentTransaction = deployment.transactionHash;
                tokenEntry.contract.deployer = secureKeyManager.getEvmAddress();
                tokenEntry.metadata.lastUpdated = new Date().toISOString();
                console.log(`  Updated ${deployment.symbol}: ${deployment.address}`);
            }
        }
        
        // Update metadata
        tokensConfig.meta.updatedAt = new Date().toISOString();
        
        // Write updated tokens.json
        fs.writeFileSync(tokensPath, JSON.stringify(tokensConfig, null, 2));
        
        // Update config.js with new token addresses (legacy support)
        let configContent = fs.readFileSync('config.js', 'utf8');
        
        // Update each token contract address in config.js
        for (const deployment of this.deploymentResults) {
            const denom = deployment.symbol.toLowerCase();
            const addressPattern = new RegExp(`(denom:\\s*"${denom}"[\\s\\S]*?erc20_contract:\\s*)(?:process\\.env\\.\\w+_CONTRACT\\s*\\|\\|\\s*)?null`, 'g');
            configContent = configContent.replace(addressPattern, `$1"${deployment.address}"`);
        }
        
        // Write updated config.js
        fs.writeFileSync('config.js', configContent);
        
        console.log(' Configuration updated in tokens.json');
    }

    async saveDeploymentReport() {
        console.log(' Saving deployment report...');
        
        const report = {
            timestamp: new Date().toISOString(),
            network: this.registry.meta.network,
            deployer: secureKeyManager.getEvmAddress(),
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

    async finalVerifyAllContracts() {
        console.log(' Performing final verification of all deployed contracts...');
        
        let allValid = true;
        for (const deployment of this.deploymentResults) {
            try {
                const code = await this.provider.getCode(deployment.address);
                if (code === '0x') {
                    console.error(`   ✗ ${deployment.symbol}: No contract at ${deployment.address}`);
                    allValid = false;
                } else {
                    console.log(`   ✓ ${deployment.symbol}: Contract verified at ${deployment.address}`);
                }
            } catch (error) {
                console.error(`   ✗ ${deployment.symbol}: Verification failed - ${error.message}`);
                allValid = false;
            }
        }
        
        if (!allValid) {
            throw new Error('Final contract verification failed - some contracts not found on network');
        }
        
        console.log(' ✓ All contracts verified successfully');
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
            await this.finalVerifyAllContracts();
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
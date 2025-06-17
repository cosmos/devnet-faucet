#!/usr/bin/env node

/**
 * Token Configuration Loader
 * Reads from tokens.json and provides unified configuration interface
 */

import fs from 'fs';
import path from 'path';

class TokenConfigLoader {
    constructor(networkConfig = null) {
        this.tokensConfig = null;
        this.networkConfig = networkConfig; // Accept network config from external source
        this.loadConfig();
    }

    loadConfig() {
        try {
            const tokensPath = path.join(process.cwd(), 'tokens.json');
            if (!fs.existsSync(tokensPath)) {
                throw new Error('tokens.json not found');
            }
            
            const tokensContent = fs.readFileSync(tokensPath, 'utf8');
            this.tokensConfig = JSON.parse(tokensContent);
            
            console.log(`✓ Loaded token configuration with ${this.tokensConfig.tokens.length} ERC20 tokens and ${this.tokensConfig.nativeTokens.length} native tokens`);
        } catch (error) {
            console.error('Failed to load tokens.json:', error.message);
            throw error;
        }
    }

    // Get network configuration (from external source or fallback to tokens.json)
    getNetworkConfig() {
        if (this.networkConfig) {
            return this.networkConfig;
        }
        
        // Fallback to tokens.json if no external network config provided
        // NOTE: This should not happen in normal operation since config.js should provide network config
        throw new Error('Network configuration must be provided from config.js. tokens.json no longer contains network parameters.');
    }

    // Get faucet configuration
    getFaucetConfig() {
        return {
            contractAddress: this.tokensConfig.meta.faucet.contractAddress,
            atomicMultiSend: this.tokensConfig.meta.faucet.atomicMultiSend,
            operator: this.tokensConfig.meta.faucet.operator
        };
    }

    // Get all ERC20 tokens for faucet distribution
    getErc20Tokens() {
        return this.tokensConfig.tokens.filter(token => token.faucet.enabled).map(token => ({
            denom: token.symbol.toLowerCase(),
            name: token.name,
            symbol: token.symbol,
            decimals: token.decimals,
            erc20_contract: token.contract.address,
            amount: token.faucet.configuration.amountPerRequest,
            target_balance: token.faucet.configuration.targetBalance,
            // Additional metadata
            logoUri: token.logoUri,
            category: token.category,
            description: token.description
        }));
    }

    // Get native tokens (like ATOM)
    getNativeTokens() {
        return this.tokensConfig.nativeTokens.filter(token => token.faucet.enabled).map(token => ({
            denom: token.denom,
            name: token.name,
            symbol: token.symbol,
            decimals: token.decimals,
            amount: token.faucet.configuration.amountPerRequest,
            target_balance: token.faucet.configuration.targetBalance,
            // EVM wrapper info if available
            evmWrapper: token.integration?.evmWrapped
        }));
    }

    // Get all tokens for config.js format
    getAllTokensForConfig() {
        const erc20Tokens = this.getErc20Tokens();
        const nativeTokens = this.getNativeTokens();
        
        // Convert to config.js format
        const amounts = [];
        
        // Add ERC20 tokens
        erc20Tokens.forEach(token => {
            amounts.push({
                denom: token.denom,
                amount: token.amount,
                erc20_contract: token.erc20_contract,
                decimals: token.decimals,
                target_balance: token.target_balance
            });
        });
        
        // Add native tokens (if they should be included in EVM transfers)
        nativeTokens.forEach(token => {
            if (token.evmWrapper?.enabled) {
                amounts.push({
                    denom: token.denom,
                    amount: token.amount,
                    erc20_contract: token.evmWrapper.wrapperContract,
                    decimals: token.decimals,
                    target_balance: token.target_balance
                });
            }
        });
        
        return amounts;
    }

    // Get token by symbol
    getTokenBySymbol(symbol) {
        const upperSymbol = symbol.toUpperCase();
        
        // Check ERC20 tokens
        const erc20Token = this.tokensConfig.tokens.find(token => token.symbol === upperSymbol);
        if (erc20Token) return erc20Token;
        
        // Check native tokens
        const nativeToken = this.tokensConfig.nativeTokens.find(token => token.symbol === upperSymbol);
        if (nativeToken) return nativeToken;
        
        return null;
    }

    // Update contract address for a token
    updateTokenContractAddress(symbol, newAddress) {
        const upperSymbol = symbol.toUpperCase();
        const token = this.tokensConfig.tokens.find(token => token.symbol === upperSymbol);
        
        if (token) {
            token.contract.address = newAddress;
            token.metadata.lastUpdated = new Date().toISOString();
            this.saveConfig();
            console.log(`✓ Updated ${symbol} contract address to ${newAddress}`);
            return true;
        }
        
        console.warn(` Token ${symbol} not found for address update`);
        return false;
    }

    // Update faucet contract addresses
    updateFaucetAddresses(atomicMultiSendAddress, operatorAddress) {
        this.tokensConfig.meta.faucet.atomicMultiSend = atomicMultiSendAddress;
        this.tokensConfig.meta.faucet.contractAddress = atomicMultiSendAddress;
        
        if (operatorAddress) {
            this.tokensConfig.meta.faucet.operator = operatorAddress;
            
            // Update all token governance addresses
            this.tokensConfig.tokens.forEach(token => {
                token.governance.roles.owner.address = operatorAddress;
                token.governance.roles.minter.address = operatorAddress;
                token.governance.roles.pauser.address = operatorAddress;
            });
        }
        
        this.tokensConfig.meta.updatedAt = new Date().toISOString();
        this.saveConfig();
        console.log(`✓ Updated faucet addresses - AtomicMultiSend: ${atomicMultiSendAddress}, Operator: ${operatorAddress}`);
    }

    // Update network configuration
    updateNetworkConfig(chainId, cosmosChainId, networkName) {
        this.tokensConfig.meta.network.chainId = chainId;
        this.tokensConfig.meta.network.cosmosChainId = cosmosChainId;
        if (networkName) {
            this.tokensConfig.meta.network.name = networkName;
        }
        
        this.tokensConfig.meta.updatedAt = new Date().toISOString();
        this.saveConfig();
        console.log(`✓ Updated network config - Chain ID: ${chainId}, Cosmos Chain ID: ${cosmosChainId}`);
    }

    // Save configuration back to file
    saveConfig() {
        try {
            const tokensPath = path.join(process.cwd(), 'tokens.json');
            fs.writeFileSync(tokensPath, JSON.stringify(this.tokensConfig, null, 2));
        } catch (error) {
            console.error('Failed to save tokens.json:', error.message);
            throw error;
        }
    }

    // Validate configuration
    validateConfig() {
        const issues = [];
        
        // Check required fields
        if (!this.tokensConfig.meta?.network?.chainId) {
            issues.push('Missing network.chainId');
        }
        
        if (!this.tokensConfig.meta?.faucet?.atomicMultiSend) {
            issues.push('Missing faucet.atomicMultiSend address');
        }
        
        // Check tokens have required fields
        this.tokensConfig.tokens.forEach((token, index) => {
            if (!token.contract?.address) {
                issues.push(`Token ${token.symbol} missing contract address`);
            }
            
            if (!token.faucet?.configuration?.amountPerRequest) {
                issues.push(`Token ${token.symbol} missing faucet amount configuration`);
            }
        });
        
        return {
            valid: issues.length === 0,
            issues
        };
    }

    // Generate summary for debugging
    generateSummary() {
        const network = this.getNetworkConfig();
        const faucet = this.getFaucetConfig();
        const erc20Tokens = this.getErc20Tokens();
        const nativeTokens = this.getNativeTokens();
        
        return {
            network,
            faucet,
            tokens: {
                erc20Count: erc20Tokens.length,
                nativeCount: nativeTokens.length,
                erc20Tokens: erc20Tokens.map(t => ({ symbol: t.symbol, address: t.erc20_contract })),
                nativeTokens: nativeTokens.map(t => ({ symbol: t.symbol, denom: t.denom }))
            }
        };
    }
}

export default TokenConfigLoader;
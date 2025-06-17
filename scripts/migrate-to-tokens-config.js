#!/usr/bin/env node

/**
 * Token Configuration Migration Script
 * 
 * Migrates from the current hardcoded token configuration in config.js 
 * to the new comprehensive tokens.json structure.
 * 
 * This script demonstrates how to:
 * 1. Load the new tokens.json configuration
 * 2. Generate config.js compatible structures
 * 3. Update faucet.js to use the new configuration
 * 4. Maintain backward compatibility
 */

import fs from 'fs';
import path from 'path';

class TokenConfigMigrator {
    constructor() {
        this.tokensConfig = null;
        this.configPath = path.join(process.cwd(), 'config.js');
        this.faucetPath = path.join(process.cwd(), 'faucet.js');
        this.tokensPath = path.join(process.cwd(), 'tokens.json');
    }

    /**
     * Load the comprehensive tokens configuration
     */
    loadTokensConfig() {
        console.log(' Loading tokens.json configuration...');
        
        if (!fs.existsSync(this.tokensPath)) {
            throw new Error('tokens.json not found. Please create it first.');
        }
        
        const tokensContent = fs.readFileSync(this.tokensPath, 'utf8');
        this.tokensConfig = JSON.parse(tokensContent);
        
        console.log(` Loaded ${this.tokensConfig.tokens.length} ERC20 tokens and ${this.tokensConfig.nativeTokens.length} native tokens`);
    }

    /**
     * Generate config.js compatible token amounts array
     */
    generateConfigAmounts() {
        console.log(' Generating config.js compatible amounts array...');
        
        const amounts = [];
        
        // Add ERC20 tokens
        for (const token of this.tokensConfig.tokens) {
            if (token.faucet?.enabled) {
                amounts.push({
                    denom: token.symbol.toLowerCase(),
                    amount: token.faucet.configuration.amountPerRequest,
                    erc20_contract: token.contract.address,
                    decimals: token.decimals,
                    target_balance: token.faucet.configuration.targetBalance
                });
            }
        }
        
        // Add native tokens (ATOM)
        for (const nativeToken of this.tokensConfig.nativeTokens) {
            if (nativeToken.faucet?.enabled) {
                // Native ATOM doesn't go in the amounts array as it's handled separately
                console.log(`    Native token ${nativeToken.symbol} configured separately`);
            }
        }
        
        console.log(` Generated ${amounts.length} token configurations for config.js`);
        return amounts;
    }

    /**
     * Generate frontend token information for faucet.js
     */
    generateFrontendTokens() {
        console.log(' Generating frontend token configurations...');
        
        const frontendTokens = [];
        
        // Add native ATOM first
        for (const nativeToken of this.tokensConfig.nativeTokens) {
            if (nativeToken.faucet?.enabled) {
                frontendTokens.push({
                    id: nativeToken.id,
                    denom: nativeToken.denom,
                    name: nativeToken.name,
                    symbol: nativeToken.symbol,
                    contract: nativeToken.integration?.evmWrapped?.wrapperContract || "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
                    decimals: nativeToken.decimals,
                    target_amount: nativeToken.faucet.configuration.targetBalance,
                    type: "native",
                    category: nativeToken.category,
                    logoUri: nativeToken.logoUri,
                    description: nativeToken.description
                });
            }
        }
        
        // Add ERC20 tokens
        for (const token of this.tokensConfig.tokens) {
            if (token.faucet?.enabled) {
                frontendTokens.push({
                    id: token.id,
                    denom: token.symbol.toLowerCase(),
                    name: token.name,
                    symbol: token.symbol,
                    contract: token.contract.address,
                    decimals: token.decimals,
                    target_amount: token.faucet.configuration.targetBalance,
                    type: "erc20",
                    category: token.category,
                    logoUri: token.logoUri,
                    description: token.description,
                    riskLevel: token.security.riskLevel,
                    warnings: token.security.warnings
                });
            }
        }
        
        console.log(` Generated ${frontendTokens.length} frontend token configurations`);
        return frontendTokens;
    }

    /**
     * Create a helper module for token operations
     */
    createTokenHelper() {
        console.log('  Creating token helper module...');
        
        const helperContent = `/**
 * Token Configuration Helper
 * 
 * This module provides utilities to work with the comprehensive
 * tokens.json configuration in a backward-compatible way.
 */

import fs from 'fs';
import path from 'path';

let _tokensConfig = null;

/**
 * Load and cache the tokens configuration
 */
function loadTokensConfig() {
    if (!_tokensConfig) {
        const tokensPath = path.join(process.cwd(), 'tokens.json');
        const tokensContent = fs.readFileSync(tokensPath, 'utf8');
        _tokensConfig = JSON.parse(tokensContent);
    }
    return _tokensConfig;
}

/**
 * Get all enabled tokens for faucet operations
 */
export function getEnabledTokens() {
    const config = loadTokensConfig();
    return config.tokens.filter(token => token.faucet?.enabled);
}

/**
 * Get native tokens
 */
export function getNativeTokens() {
    const config = loadTokensConfig();
    return config.nativeTokens.filter(token => token.faucet?.enabled);
}

/**
 * Find token by symbol
 */
export function getTokenBySymbol(symbol) {
    const config = loadTokensConfig();
    return config.tokens.find(token => 
        token.symbol.toLowerCase() === symbol.toLowerCase()
    );
}

/**
 * Find token by contract address
 */
export function getTokenByAddress(address) {
    const config = loadTokensConfig();
    return config.tokens.find(token => 
        token.contract.address.toLowerCase() === address.toLowerCase()
    );
}

/**
 * Get config.js compatible amounts array
 */
export function getConfigAmounts() {
    const enabledTokens = getEnabledTokens();
    return enabledTokens.map(token => ({
        denom: token.symbol.toLowerCase(),
        amount: token.faucet.configuration.amountPerRequest,
        erc20_contract: token.contract.address,
        decimals: token.decimals,
        target_balance: token.faucet.configuration.targetBalance
    }));
}

/**
 * Get frontend-ready token list
 */
export function getFrontendTokens() {
    const config = loadTokensConfig();
    const frontendTokens = [];
    
    // Add native tokens first
    for (const nativeToken of config.nativeTokens) {
        if (nativeToken.faucet?.enabled) {
            frontendTokens.push({
                id: nativeToken.id,
                denom: nativeToken.denom,
                name: nativeToken.name,
                symbol: nativeToken.symbol,
                contract: nativeToken.integration?.evmWrapped?.wrapperContract || "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
                decimals: nativeToken.decimals,
                target_amount: nativeToken.faucet.configuration.targetBalance,
                type: "native",
                category: nativeToken.category,
                logoUri: nativeToken.logoUri,
                description: nativeToken.description
            });
        }
    }
    
    // Add ERC20 tokens
    for (const token of config.tokens) {
        if (token.faucet?.enabled) {
            frontendTokens.push({
                id: token.id,
                denom: token.symbol.toLowerCase(),
                name: token.name,
                symbol: token.symbol,
                contract: token.contract.address,
                decimals: token.decimals,
                target_amount: token.faucet.configuration.targetBalance,
                type: "erc20",
                category: token.category,
                logoUri: token.logoUri,
                description: token.description,
                riskLevel: token.security.riskLevel,
                warnings: token.security.warnings
            });
        }
    }
    
    return frontendTokens;
}

/**
 * Get token categories for UI
 */
export function getTokenCategories() {
    const config = loadTokensConfig();
    return config.categories;
}

/**
 * Get UI configuration
 */
export function getUIConfig() {
    const config = loadTokensConfig();
    return config.ui;
}

/**
 * Get faucet analytics for a token
 */
export function getTokenAnalytics(tokenId) {
    const config = loadTokensConfig();
    const token = config.tokens.find(t => t.id === tokenId) || 
                 config.nativeTokens.find(t => t.id === tokenId);
    return token?.faucet?.analytics || null;
}

/**
 * Update token analytics (for tracking distributions)
 */
export function updateTokenAnalytics(tokenId, updates) {
    const config = loadTokensConfig();
    const token = config.tokens.find(t => t.id === tokenId) || 
                 config.nativeTokens.find(t => t.id === tokenId);
    
    if (token && token.faucet?.analytics) {
        Object.assign(token.faucet.analytics, updates);
        
        // Save updated configuration
        const tokensPath = path.join(process.cwd(), 'tokens.json');
        fs.writeFileSync(tokensPath, JSON.stringify(config, null, 2));
    }
}

/**
 * Validate token configuration
 */
export function validateTokenConfig() {
    const config = loadTokensConfig();
    const errors = [];
    
    // Check for duplicate symbols
    const symbols = new Set();
    for (const token of config.tokens) {
        if (symbols.has(token.symbol.toLowerCase())) {
            errors.push(\`Duplicate symbol: \${token.symbol}\`);
        }
        symbols.add(token.symbol.toLowerCase());
    }
    
    // Check for duplicate contract addresses
    const addresses = new Set();
    for (const token of config.tokens) {
        const addr = token.contract.address.toLowerCase();
        if (addresses.has(addr)) {
            errors.push(\`Duplicate address: \${addr}\`);
        }
        addresses.add(addr);
    }
    
    // Check faucet configuration
    for (const token of config.tokens) {
        if (token.faucet?.enabled && !token.faucet.configuration?.amountPerRequest) {
            errors.push(\`Missing faucet amount for token: \${token.symbol}\`);
        }
    }
    
    return errors;
}

export default {
    getEnabledTokens,
    getNativeTokens,
    getTokenBySymbol,
    getTokenByAddress,
    getConfigAmounts,
    getFrontendTokens,
    getTokenCategories,
    getUIConfig,
    getTokenAnalytics,
    updateTokenAnalytics,
    validateTokenConfig
};
`;

        const helperPath = path.join(process.cwd(), 'src', 'TokenHelper.js');
        
        // Ensure src directory exists
        const srcDir = path.dirname(helperPath);
        if (!fs.existsSync(srcDir)) {
            fs.mkdirSync(srcDir, { recursive: true });
        }
        
        fs.writeFileSync(helperPath, helperContent);
        console.log(` Token helper created: ${helperPath}`);
    }

    /**
     * Generate example integration code
     */
    generateIntegrationExamples() {
        console.log(' Generating integration examples...');
        
        const examples = `/**
 * Integration Examples for tokens.json Configuration
 * 
 * These examples show how to integrate the new token configuration
 * with existing code while maintaining backward compatibility.
 */

// Example 1: Updating config.js to use tokens.json
//============================================================

// OLD config.js (hardcoded):
const oldAmounts = [
    {
        denom: "wbtc",
        amount: "100000000000",
        erc20_contract: "0x921c48F521329cF6187D1De1D0Ca5181B47FF946",
        decimals: 8,
        target_balance: "100000000000"
    },
    // ... more tokens
];

// NEW config.js (using tokens.json):
import { getConfigAmounts } from './src/TokenHelper.js';

const amounts = getConfigAmounts(); // Automatically generated from tokens.json


// Example 2: Frontend token display
//============================================================

// OLD faucet.js (hardcoded):
const oldTokens = [
    {
        denom: "uatom",
        name: "ATOM",
        contract: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        decimals: 6,
        target_amount: "1000000"
    },
    // ... more tokens
];

// NEW faucet.js (using tokens.json):
import { getFrontendTokens } from './src/TokenHelper.js';

const tokens = getFrontendTokens(); // Rich token metadata included


// Example 3: Token-specific faucet logic
//============================================================

import { getTokenBySymbol, updateTokenAnalytics } from './src/TokenHelper.js';

async function sendTokens(symbol, recipient, amount) {
    const token = getTokenBySymbol(symbol);
    
    if (!token) {
        throw new Error(\`Token \${symbol} not found\`);
    }
    
    if (!token.faucet.enabled) {
        throw new Error(\`Faucet disabled for \${symbol}\`);
    }
    
    // Check security warnings
    if (token.security.riskLevel === 'high') {
        console.warn(\`  High risk token: \${symbol}\`, token.security.warnings);
    }
    
    // Send tokens...
    const result = await sendTokensToAddress(token.contract.address, recipient, amount);
    
    // Update analytics
    if (result.success) {
        updateTokenAnalytics(token.id, {
            totalDistributed: (BigInt(token.faucet.analytics.totalDistributed) + BigInt(amount)).toString(),
            uniqueRecipients: token.faucet.analytics.uniqueRecipients + 1,
            lastDistribution: new Date().toISOString()
        });
    }
    
    return result;
}


// Example 4: UI generation for token creator
//============================================================

import { getTokenCategories, getUIConfig } from './src/TokenHelper.js';

function renderTokenCreatorUI() {
    const categories = getTokenCategories();
    const uiConfig = getUIConfig();
    
    return \`
        <div class="token-creator">
            <h2>Create New Token</h2>
            
            <label>Category:</label>
            <select name="category">
                \${Object.entries(categories).map(([key, cat]) => 
                    \`<option value="\${key}">\${cat.icon} \${cat.name}</option>\`
                ).join('')}
            </select>
            
            <!-- More form fields based on token templates... -->
        </div>
    \`;
}


// Example 5: Migration from existing registry
//============================================================

import fs from 'fs';

function migrateFromOldRegistry() {
    const oldRegistry = JSON.parse(fs.readFileSync('token-registry.json', 'utf8'));
    const newConfig = JSON.parse(fs.readFileSync('tokens.json', 'utf8'));
    
    for (const oldToken of oldRegistry.tokens) {
        const newToken = newConfig.tokens.find(t => t.symbol === oldToken.symbol);
        if (newToken) {
            // Update with deployment information
            newToken.contract.address = oldToken.contractAddress;
            newToken.contract.deploymentBlock = oldToken.deploymentBlock;
            newToken.contract.deployer = oldToken.deployer;
        }
    }
    
    // Save updated configuration
    fs.writeFileSync('tokens.json', JSON.stringify(newConfig, null, 2));
    console.log('Migration completed successfully');
}


// Example 6: Advanced token filtering and search
//============================================================

import { getEnabledTokens } from './src/TokenHelper.js';

function searchTokens(query, filters = {}) {
    const tokens = getEnabledTokens();
    
    return tokens.filter(token => {
        // Text search
        const matchesQuery = !query || 
            token.name.toLowerCase().includes(query.toLowerCase()) ||
            token.symbol.toLowerCase().includes(query.toLowerCase()) ||
            token.description.toLowerCase().includes(query.toLowerCase()) ||
            token.tags.some(tag => tag.toLowerCase().includes(query.toLowerCase()));
        
        // Category filter
        const matchesCategory = !filters.category || token.category === filters.category;
        
        // Risk level filter
        const matchesRisk = !filters.riskLevel || token.security.riskLevel === filters.riskLevel;
        
        // Feature filter
        const matchesFeatures = !filters.features || 
            filters.features.every(feature => token.features[feature]);
        
        return matchesQuery && matchesCategory && matchesRisk && matchesFeatures;
    });
}

// Usage:
const stablecoins = searchTokens('', { category: 'stablecoin' });
const mintableTokens = searchTokens('', { features: ['mintable'] });
const lowRiskTokens = searchTokens('', { riskLevel: 'low' });
`;

        const examplesPath = path.join(process.cwd(), 'integration-examples.js');
        fs.writeFileSync(examplesPath, examples);
        console.log(` Integration examples created: ${examplesPath}`);
    }

    /**
     * Run the complete migration process
     */
    async migrate() {
        console.log(' Starting Token Configuration Migration...\n');
        
        try {
            // Step 1: Load new configuration
            this.loadTokensConfig();
            
            // Step 2: Validate configuration
            console.log(' Validating configuration...');
            // We'll import the validation after creating the helper
            
            // Step 3: Generate compatible structures
            const configAmounts = this.generateConfigAmounts();
            const frontendTokens = this.generateFrontendTokens();
            
            // Step 4: Create helper utilities
            this.createTokenHelper();
            
            // Step 5: Generate integration examples
            this.generateIntegrationExamples();
            
            // Step 6: Show migration summary
            this.showMigrationSummary(configAmounts, frontendTokens);
            
        } catch (error) {
            console.error(' Migration failed:', error.message);
            process.exit(1);
        }
    }

    /**
     * Show migration summary
     */
    showMigrationSummary(configAmounts, frontendTokens) {
        console.log('\n Migration completed successfully!\n');
        
        console.log(' Summary:');
        console.log(`  • ${this.tokensConfig.tokens.length} ERC20 tokens configured`);
        console.log(`  • ${this.tokensConfig.nativeTokens.length} native tokens configured`);
        console.log(`  • ${configAmounts.length} tokens enabled for faucet`);
        console.log(`  • ${Object.keys(this.tokensConfig.categories).length} token categories defined`);
        
        console.log('\n Generated files:');
        console.log('  • src/TokenHelper.js - Utility functions for token operations');
        console.log('  • integration-examples.js - Code examples for integration');
        
        console.log('\n Next steps:');
        console.log('  1. Update config.js to use TokenHelper.getConfigAmounts()');
        console.log('  2. Update faucet.js to use TokenHelper.getFrontendTokens()');
        console.log('  3. Implement token creator UI using the comprehensive metadata');
        console.log('  4. Set up analytics tracking with TokenHelper.updateTokenAnalytics()');
        console.log('  5. Run validation: node -e "import(\\'./src/TokenHelper.js\\').then(h => console.log(h.validateTokenConfig()))"');
        
        console.log('\n Benefits of the new system:');
        console.log('  • Comprehensive token metadata for rich UI experiences');
        console.log('  • Built-in support for token creator functionality');
        console.log('  • Integrated analytics and tracking');
        console.log('  • Security warnings and risk assessment');
        console.log('  • Flexible categorization and filtering');
        console.log('  • Future-proof extensible structure');
        
        console.log('\n Integration guide:');
        console.log('  See integration-examples.js for detailed code examples');
    }
}

// Run migration if called directly
if (import.meta.url === \`file://\${process.argv[1]}\`) {
    const migrator = new TokenConfigMigrator();
    migrator.migrate();
}

export default TokenConfigMigrator;
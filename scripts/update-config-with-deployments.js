#!/usr/bin/env node

/**
 * Configuration Updater
 * 
 * Automatically updates the faucet configuration with newly deployed
 * contract addresses from the deployment artifacts.
 */

import fs from 'fs/promises';
import path from 'path';

class ConfigUpdater {
    constructor() {
        this.configPath = './config.js';
        this.deploymentsDir = './deployments';
    }

    async updateConfigWithDeployments() {
        console.log(' Updating configuration with deployment addresses...');
        
        try {
            // Read latest deployment
            const latestDeployment = await this.readLatestDeployment();
            if (!latestDeployment) {
                throw new Error('No deployment data found');
            }
            
            // Read current config
            const configContent = await fs.readFile(this.configPath, 'utf8');
            
            // Generate new config
            const updatedConfig = this.updateConfigAddresses(configContent, latestDeployment);
            
            // Write updated config
            await fs.writeFile(this.configPath, updatedConfig);
            
            console.log(' Configuration updated successfully');
            console.log('   Contract addresses updated with latest deployments');
            
            return true;
            
        } catch (error) {
            console.error(' Failed to update configuration:', error.message);
            return false;
        }
    }

    async readLatestDeployment() {
        try {
            const latestPath = path.join(this.deploymentsDir, 'latest.json');
            const content = await fs.readFile(latestPath, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            console.error(' Failed to read deployment data:', error.message);
            return null;
        }
    }

    updateConfigAddresses(configContent, deployment) {
        console.log(' Updating contract addresses in configuration...');
        
        // Map of token symbols to config field mapping
        const tokenMapping = {
            'WBTC': { field: 'wbtc', name: 'wbtc' },
            'PEPE': { field: 'pepe', name: 'pepe' },
            'USDT': { field: 'usdt', name: 'usdt' }
        };
        
        let updatedConfig = configContent;
        
        // Update each token's contract address
        for (const [symbol, tokenInfo] of Object.entries(tokenMapping)) {
            const deploymentData = deployment.deployments[symbol];
            if (deploymentData && deploymentData.contractAddress) {
                const oldAddressPattern = new RegExp(
                    `(denom:\\s*"${tokenInfo.name}"[\\s\\S]*?erc20_contract:\\s*)"[^"]*"`,
                    'g'
                );
                
                updatedConfig = updatedConfig.replace(
                    oldAddressPattern,
                    `$1"${deploymentData.contractAddress}"`
                );
                
                console.log(`    Updated ${symbol}: ${deploymentData.contractAddress}`);
            }
        }
        
        // Add deployment timestamp comment
        const timestamp = new Date().toISOString();
        const deploymentComment = `// Configuration updated with deployments on ${timestamp}\n`;
        
        if (!updatedConfig.includes('// Configuration updated with deployments')) {
            updatedConfig = deploymentComment + updatedConfig;
        } else {
            updatedConfig = updatedConfig.replace(
                /\/\/ Configuration updated with deployments on [^\n]+\n/,
                deploymentComment
            );
        }
        
        return updatedConfig;
    }

    async printCurrentConfig() {
        try {
            console.log(' Current Configuration:');
            
            // Import the config dynamically to get current values
            const config = await import('../config.js');
            
            console.log('   Native token:');
            console.log(`   - ${config.default.blockchain.tx.amounts[0].denom}: ${config.default.blockchain.tx.amounts[0].erc20_contract}`);
            
            console.log('   ERC20 tokens:');
            for (let i = 1; i < config.default.blockchain.tx.amounts.length; i++) {
                const token = config.default.blockchain.tx.amounts[i];
                console.log(`   - ${token.denom}: ${token.erc20_contract}`);
            }
            
        } catch (error) {
            console.error(' Failed to read current config:', error.message);
        }
    }
}

async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    
    const updater = new ConfigUpdater();
    
    try {
        switch (command) {
            case 'update':
                await updater.updateConfigWithDeployments();
                await updater.printCurrentConfig();
                break;
                
            case 'show':
                await updater.printCurrentConfig();
                break;
                
            default:
                console.log(' Configuration Updater');
                console.log('');
                console.log('Usage:');
                console.log('  node scripts/update-config-with-deployments.js update  - Update config with latest deployments');
                console.log('  node scripts/update-config-with-deployments.js show    - Show current configuration');
                console.log('');
                break;
        }
        
    } catch (error) {
        console.error(' Config updater failed:', error.message);
        process.exit(1);
    }
}

// Export for module use
export { ConfigUpdater };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}
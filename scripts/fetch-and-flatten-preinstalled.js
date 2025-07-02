#!/usr/bin/env node

/**
 * Script to fetch and flatten preinstalled contracts with their dependencies
 */

import fs from 'fs/promises';
import path from 'path';
import fetch from 'node-fetch';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCES_DIR = path.join(__dirname, '../preinstalled-sources');
const FLATTENED_DIR = path.join(__dirname, '../flattened');

// Contract configurations with their GitHub repos and paths
const CONTRACTS = {
    'Create2': {
        repo: 'OpenZeppelin/openzeppelin-contracts',
        tag: 'v5.1.0',
        path: 'contracts/utils/Create2.sol',
        dependencies: [
            'contracts/utils/Errors.sol'
        ]
    },
    'Multicall3': {
        repo: 'mds1/multicall',
        tag: 'v3.1.0',
        path: 'src/Multicall3.sol',
        dependencies: []
    },
    'Permit2': {
        repo: 'Uniswap/permit2',
        tag: 'main',
        path: 'src/Permit2.sol',
        dependencies: [
            'src/SignatureTransfer.sol',
            'src/PermitErrors.sol',
            'src/AllowanceTransfer.sol',
            'src/EIP712.sol',
            'src/interfaces/IPermit2.sol',
            'src/interfaces/ISignatureTransfer.sol',
            'src/interfaces/IAllowanceTransfer.sol',
            'src/interfaces/IERC1271.sol',
            'src/interfaces/IDAIPermit.sol',
            'src/libraries/SignatureVerification.sol',
            'src/libraries/PermitHash.sol',
            'src/libraries/SafeCast160.sol',
            'src/libraries/Allowance.sol'
        ]
    },
    'SafeSingletonFactory': {
        repo: 'safe-global/safe-singleton-factory',
        tag: 'main',
        path: 'contracts/SafeSingletonFactory.sol',
        dependencies: []
    }
};

class ContractFetcher {
    async initialize() {
        console.log('Fetching and Flattening Preinstalled Contracts');
        console.log('=============================================');
        
        // Create directories
        await fs.mkdir(SOURCES_DIR, { recursive: true });
        await fs.mkdir(FLATTENED_DIR, { recursive: true });
    }

    async fetchFile(repo, tag, filePath) {
        const url = `https://raw.githubusercontent.com/${repo}/${tag}/${filePath}`;
        console.log(`  Fetching: ${filePath}`);
        
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return await response.text();
        } catch (error) {
            console.error(`    Failed: ${error.message}`);
            return null;
        }
    }

    async downloadContract(name, config) {
        console.log(`\nProcessing ${name}...`);
        
        const contractDir = path.join(SOURCES_DIR, name);
        await fs.mkdir(contractDir, { recursive: true });
        
        // Download main contract
        const mainContent = await this.fetchFile(config.repo, config.tag, config.path);
        if (!mainContent) {
            return false;
        }
        
        const mainFile = path.join(contractDir, config.path);
        await fs.mkdir(path.dirname(mainFile), { recursive: true });
        await fs.writeFile(mainFile, mainContent);
        
        // Download dependencies with directory structure
        for (const dep of config.dependencies) {
            const depContent = await this.fetchFile(config.repo, config.tag, dep);
            if (depContent) {
                const depPath = path.join(contractDir, dep);
                await fs.mkdir(path.dirname(depPath), { recursive: true });
                await fs.writeFile(depPath, depContent);
            }
        }
        
        console.log(`  Downloaded ${1 + config.dependencies.length} files`);
        
        // Try to flatten
        return await this.flattenContract(name, contractDir, config.path);
    }

    async flattenContract(name, contractDir, mainFile) {
        console.log(`  Flattening ${name}...`);
        
        const outputPath = path.join(FLATTENED_DIR, `${name}_flat.sol`);
        
        try {
            // Check if forge is available
            try {
                execSync('forge --version', { stdio: 'ignore' });
                
                // Use forge flatten
                const mainPath = path.join(contractDir, mainFile);
                const result = execSync(`forge flatten ${mainPath}`, { 
                    encoding: 'utf8',
                    cwd: contractDir
                });
                
                await fs.writeFile(outputPath, result);
                console.log(`  Flattened successfully`);
                return true;
            } catch {
                console.log(`  Forge not available, attempting manual flatten...`);
                return await this.manualFlatten(name, contractDir, mainFile, outputPath);
            }
        } catch (error) {
            console.error(`  Failed to flatten: ${error.message}`);
            return false;
        }
    }

    async manualFlatten(name, contractDir, mainFile, outputPath) {
        // For simple contracts without imports, just copy
        const mainPath = path.join(contractDir, mainFile);
        const content = await fs.readFile(mainPath, 'utf8');
        
        if (!content.includes('import ')) {
            await fs.writeFile(outputPath, content);
            console.log(`  No imports, using source as-is`);
            return true;
        }
        
        console.log(`  Contract has imports, manual flattening not implemented`);
        return false;
    }

    async run() {
        await this.initialize();
        
        const results = [];
        
        for (const [name, config] of Object.entries(CONTRACTS)) {
            const success = await this.downloadContract(name, config);
            results.push({ name, success });
        }
        
        // Summary
        console.log('\n=============================================');
        console.log('Summary');
        console.log('=============================================');
        
        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);
        
        if (successful.length > 0) {
            console.log(`Successful: ${successful.map(r => r.name).join(', ')}`);
        }
        if (failed.length > 0) {
            console.log(`Failed: ${failed.map(r => r.name).join(', ')}`);
        }
        
        console.log(`\nFlattened contracts saved to: ${FLATTENED_DIR}`);
        
        return results;
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const fetcher = new ContractFetcher();
    fetcher.run().catch(error => {
        console.error('\nFetch failed:', error.message);
        process.exit(1);
    });
}

export default ContractFetcher;
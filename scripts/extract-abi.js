#!/usr/bin/env node

/**
 * Extract ABI from Foundry build artifacts
 * Usage: node scripts/extract-abi.js
 */

import fs from 'fs';
import path from 'path';

const FOUNDRY_OUT_DIR = 'out';
const DEPLOYMENTS_DIR = 'deployments';
const CONTRACT_NAME = 'AtomicMultiSend';

async function extractABI() {
    try {
        console.log('🔧 Extracting ABI from Foundry artifacts...');
        
        // Read the Foundry build artifact
        const artifactPath = path.join(FOUNDRY_OUT_DIR, `${CONTRACT_NAME}.sol`, `${CONTRACT_NAME}.json`);
        if (!fs.existsSync(artifactPath)) {
            throw new Error(`Artifact not found: ${artifactPath}`);
        }
        
        const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
        
        // Extract just the ABI
        const abi = artifact.abi;
        if (!abi || !Array.isArray(abi)) {
            throw new Error('Invalid ABI in artifact');
        }
        
        // Ensure deployments directory exists
        if (!fs.existsSync(DEPLOYMENTS_DIR)) {
            fs.mkdirSync(DEPLOYMENTS_DIR, { recursive: true });
        }
        
        // Write ABI to deployments directory
        const abiPath = path.join(DEPLOYMENTS_DIR, `${CONTRACT_NAME}.abi.json`);
        fs.writeFileSync(abiPath, JSON.stringify(abi, null, 2));
        
        console.log(`✅ ABI extracted to: ${abiPath}`);
        console.log(`📊 ABI contains ${abi.length} items`);
        
        return abiPath;
    } catch (error) {
        console.error('❌ ABI extraction failed:', error.message);
        process.exit(1);
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    extractABI();
}

export default extractABI;
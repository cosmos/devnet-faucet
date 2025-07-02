#!/usr/bin/env node

/**
 * Verify contracts using forge verify-contract with flattened source
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Add forge to PATH
process.env.PATH = `${process.env.PATH}:/home/cordt/.foundry/bin`;

const CONTRACTS = [
    {
        address: '0xcA11bde05977b3631167028862bE2a173976CA11',
        name: 'Multicall3',
        sourceFile: 'flattened/Multicall3_flat.sol:Multicall3',
        compilerVersion: '0.8.12+commit.f00d7308',
        optimizerRuns: 10000000
    }
];

async function verifyContract(contract) {
    console.log(`\nVerifying ${contract.name} at ${contract.address}...`);
    
    try {
        const cmd = `forge verify-contract \
            --chain-id 4231 \
            --verifier blockscout \
            --verifier-url 'https://evm-devnet-1.cloud.blockscout.com/api/' \
            --compiler-version '${contract.compilerVersion}' \
            --optimizer-runs ${contract.optimizerRuns} \
            ${contract.address} \
            ${contract.sourceFile}`;
        
        console.log('Command:', cmd);
        
        const result = execSync(cmd, { 
            encoding: 'utf8',
            cwd: path.join(__dirname, '..')
        });
        
        console.log(result);
        return true;
    } catch (error) {
        console.error(`Failed to verify ${contract.name}:`, error.message);
        if (error.stdout) console.log('stdout:', error.stdout.toString());
        if (error.stderr) console.log('stderr:', error.stderr.toString());
        return false;
    }
}

async function main() {
    console.log('Verifying Contracts with Forge');
    console.log('==============================');
    
    for (const contract of CONTRACTS) {
        await verifyContract(contract);
        // Wait between verifications
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
}

main().catch(console.error);
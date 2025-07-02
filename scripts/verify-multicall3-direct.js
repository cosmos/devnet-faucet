#!/usr/bin/env node

import fs from 'fs/promises';
import fetch from 'node-fetch';
import { execSync } from 'child_process';

const EXPLORER_API = 'https://evm-devnet-1.cloud.blockscout.com/api/v2';
const ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';

async function verify() {
    console.log('Verifying Multicall3 directly via API...\n');
    
    // Read the source file
    const sourceCode = await fs.readFile('src/preinstalled/Multicall3.sol', 'utf8');
    
    // Flatten it
    console.log('Flattening contract...');
    const flattened = execSync('forge flatten src/preinstalled/Multicall3.sol', { 
        encoding: 'utf8',
        env: { ...process.env, PATH: `${process.env.PATH}:/home/cordt/.foundry/bin` }
    });
    
    const payload = {
        compiler_version: 'v0.8.12+commit.f00d7308',
        license_type: 'mit',
        contract_name: 'Multicall3',
        is_optimization_enabled: true,
        optimization_runs: 10000000,
        evm_version: 'london',
        source_code: flattened,
        autodetect_constructor_args: true
    };
    
    console.log('Submitting verification...');
    console.log(`Address: ${ADDRESS}`);
    console.log(`Compiler: ${payload.compiler_version}`);
    console.log(`Optimization: ${payload.optimization_runs} runs`);
    
    const response = await fetch(
        `${EXPLORER_API}/smart-contracts/${ADDRESS.toLowerCase()}/verification/via/flattened-code`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
        }
    );
    
    const result = await response.text();
    console.log(`\nResponse status: ${response.status}`);
    console.log(`Response: ${result}`);
}

verify().catch(console.error);
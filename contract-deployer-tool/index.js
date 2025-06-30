#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs/promises';

async function main() {
    console.log('Contract Deployer Tool');
    console.log('======================\n');
    
    const args = process.argv.slice(2);
    
    if (args.length === 0 || args[0] === 'help') {
        console.log('Usage:');
        console.log('  node index.js deploy        - Deploy contracts');
        console.log('  node index.js verify        - Verify contracts');
        console.log('  node index.js deploy-verify - Deploy and verify');
        console.log('  node index.js check         - Check contract status');
        console.log('  node index.js help          - Show this help');
        console.log('\nSetup:');
        console.log('  1. Copy .env.example to .env and configure');
        console.log('  2. Place contracts in ./contracts directory');
        console.log('  3. Run desired command');
        return;
    }
    
    const command = args[0];
    
    try {
        switch (command) {
            case 'deploy':
                execSync('node deploy.js', { stdio: 'inherit' });
                break;
                
            case 'verify':
                execSync('node verify.js', { stdio: 'inherit' });
                break;
                
            case 'deploy-verify':
            case 'deploy-and-verify':
                console.log('Running deployment...\n');
                execSync('node deploy.js', { stdio: 'inherit' });
                console.log('\n\nRunning verification...\n');
                execSync('node verify.js', { stdio: 'inherit' });
                break;
                
            case 'check':
                execSync('node check.js', { stdio: 'inherit' });
                break;
                
            default:
                console.error(`Unknown command: ${command}`);
                console.log('Run "node index.js help" for usage');
                process.exit(1);
        }
    } catch (error) {
        console.error(`\nCommand failed: ${error.message}`);
        process.exit(1);
    }
}

main().catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
});
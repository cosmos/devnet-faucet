#!/usr/bin/env node

import fetch from 'node-fetch';

const EXPLORER_API = 'https://evm-devnet-1.cloud.blockscout.com/api/v2';
const PERMIT2_ADDRESS = '0x000000000022d473030f116ddee9f6b43ac78ba3';

async function verifyPermit2() {
    console.log('Attempting to verify Permit2 via Blockscout API...\n');
    
    // First, let's check if it's already verified or in the bytecode DB
    const checkResponse = await fetch(`${EXPLORER_API}/smart-contracts/${PERMIT2_ADDRESS}`);
    const contractData = await checkResponse.json();
    
    console.log('Current status:', JSON.stringify({
        is_verified: contractData.is_verified,
        is_verified_via_eth_bytecode_db: contractData.is_verified_via_eth_bytecode_db,
        name: contractData.name
    }, null, 2));
    
    if (contractData.is_verified) {
        console.log('\nContract is already verified!');
        return;
    }
    
    // Get the deployed bytecode to match against
    const addressResponse = await fetch(`${EXPLORER_API}/addresses/${PERMIT2_ADDRESS}`);
    const addressData = await addressResponse.json();
    
    if (!addressData.is_contract) {
        console.log('Error: Address is not recognized as a contract');
        return;
    }
    
    console.log('\nContract found at address');
    console.log('Creation TX:', addressData.creation_tx_hash || 'Not available (preinstalled)');
    
    // Since we can't flatten due to missing dependencies, 
    // and these are preinstalled contracts without creation transactions,
    // the bytecode database is the best option
    
    console.log('\nFor preinstalled contracts like Permit2:');
    console.log('1. They need to be verified on another chain first');
    console.log('2. Then the bytecode database will match them automatically');
    console.log('3. Or they need exact source code with all dependencies');
    
    console.log('\nPermit2 is a complex contract with dependencies on:');
    console.log('- solmate library (ERC20, SafeTransferLib)');
    console.log('- Multiple internal contracts and libraries');
    console.log('- Specific compiler settings (via-ir, 1M optimizer runs)');
}

verifyPermit2().catch(console.error);
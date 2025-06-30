import dotenv from 'dotenv';
import { ethers } from 'ethers';

dotenv.config();

export const config = {
    // Network settings
    rpcUrl: process.env.RPC_URL || 'http://localhost:8545',
    chainId: parseInt(process.env.CHAIN_ID || '1'),
    
    // Explorer settings
    explorerUrl: process.env.EXPLORER_URL || 'https://etherscan.io',
    explorerApiUrl: process.env.EXPLORER_API_URL || process.env.EXPLORER_URL + '/api/v2',
    
    // Gas settings
    gasPrice: process.env.GAS_PRICE_GWEI ? ethers.parseUnits(process.env.GAS_PRICE_GWEI, 'gwei') : undefined,
    gasLimit: process.env.GAS_LIMIT ? parseInt(process.env.GAS_LIMIT) : 5000000,
    
    // Deployment settings
    confirmations: 1,
    
    // Compiler settings for verification
    compilerVersion: 'v0.8.28+commit.7893614a',
    optimization: true,
    optimizationRuns: 200,
    evmVersion: 'istanbul',
    viaIR: false,
    license: 'mit'
};

export function getWallet() {
    if (!process.env.PRIVATE_KEY && !process.env.MNEMONIC) {
        throw new Error('Either PRIVATE_KEY or MNEMONIC must be set in environment');
    }
    
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    
    if (process.env.PRIVATE_KEY) {
        return new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    } else {
        return ethers.Wallet.fromPhrase(process.env.MNEMONIC, provider);
    }
}

export function getProvider() {
    return new ethers.JsonRpcProvider(config.rpcUrl);
}
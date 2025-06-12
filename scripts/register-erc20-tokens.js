#!/usr/bin/env node

/**
 * ERC20 Token Registration Script for Cosmos EVM Dual Environment
 * This script registers ERC20 tokens directly using the EVM RPC
 * enabling them to be used as native Cosmos tokens
 */

import { ethers } from 'ethers';
import axios from 'axios';

// Configuration
const CONFIG = {
    CHAIN_ID: 262144, // 0x40000
    EVM_RPC_URL: 'https://cevm-01-evmrpc.dev.skip.build',
    REST_URL: 'https://cevm-01-lcd.dev.skip.build',

    // Faucet private key for signing transactions
    PRIVATE_KEY: 'dd138b977ac3248b328b7b65ac30338b1482a17197a175f03fd2df20fb0919c6',
    FAUCET_ADDRESS: '0x42e6047c5780b103e52265f6483c2d0113aa6b87',
    COSMOS_ADDRESS: 'cosmos1gtnqglzhszcs8efzvhmys0pdqyf656u8wmfcuz',

    // Token contracts (deployed addresses)
    TOKENS: {
        WBTC: '0x0312040979E0d6333F537A39b23a5DD6F574dBd8',
        PEPE: '0xE43bdb38aF42C9D61a258ED1c0DE28c82f00BA61',
        USDT: '0x6ba2828b31Dff02B1424B1321B580C7F9D0FbC61'
    },

    // ERC20 Module Precompile Address (standard Cosmos EVM precompile)
    ERC20_PRECOMPILE_ADDRESS: '0x0000000000000000000000000000000000000802',

    // Gas settings
    GAS_LIMIT: 300000,
    GAS_PRICE: ethers.parseUnits('20', 'gwei')
};

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

// Utility functions
const log = {
    info: (msg) => console.log(`${colors.blue}ℹ ${msg}${colors.reset}`),
    success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
    warning: (msg) => console.log(`${colors.yellow}⚠ ${msg}${colors.reset}`),
    error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
    header: (msg) => console.log(`${colors.cyan}${colors.bright}\n========================================\n  ${msg}\n========================================${colors.reset}`)
};

// ERC20 Module Precompile ABI (simplified for registration)
const ERC20_PRECOMPILE_ABI = [
    // Register ERC20 token
    "function registerERC20(address erc20Address) external returns (bool)",

    // Convert ERC20 to Cosmos coin
    "function convertERC20ToCoin(address erc20Address, uint256 amount, address receiver) external returns (bool)",

    // Convert Cosmos coin to ERC20
    "function convertCoinToERC20(string memory denom, uint256 amount, address receiver) external returns (bool)",

    // Query functions
    "function getTokenPair(address erc20Address) external view returns (string memory denom, bool enabled)",
    "function isRegistered(address erc20Address) external view returns (bool)"
];

// Standard ERC20 ABI for token info
const ERC20_ABI = [
    "function name() external view returns (string)",
    "function symbol() external view returns (string)",
    "function decimals() external view returns (uint8)",
    "function totalSupply() external view returns (uint256)",
    "function balanceOf(address account) external view returns (uint256)"
];

class TokenRegistrar {
    constructor() {
        this.provider = new ethers.JsonRpcProvider(CONFIG.EVM_RPC_URL);
        this.wallet = new ethers.Wallet(CONFIG.PRIVATE_KEY, this.provider);
        this.precompile = new ethers.Contract(
            CONFIG.ERC20_PRECOMPILE_ADDRESS,
            ERC20_PRECOMPILE_ABI,
            this.wallet
        );
    }

    async init() {
        log.header('ERC20 Token Registration Tool');
        log.info(`Connected to EVM RPC: ${CONFIG.EVM_RPC_URL}`);
        log.info(`Using wallet: ${this.wallet.address}`);

        // Verify connection
        try {
            const network = await this.provider.getNetwork();
            log.success(`Connected to chain ID: ${network.chainId}`);

            const balance = await this.provider.getBalance(this.wallet.address);
            log.info(`Wallet balance: ${ethers.formatEther(balance)} ETH`);

            if (balance === 0n) {
                log.warning('Wallet has no balance for gas fees');
            }
        } catch (error) {
            log.error(`Failed to connect: ${error.message}`);
            throw error;
        }
    }

    async getTokenInfo(tokenAddress) {
        try {
            const token = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);

            const [name, symbol, decimals, totalSupply] = await Promise.all([
                token.name(),
                token.symbol(),
                token.decimals(),
                token.totalSupply()
            ]);

            return {
                address: tokenAddress,
                name,
                symbol,
                decimals,
                totalSupply: ethers.formatUnits(totalSupply, decimals)
            };
        } catch (error) {
            log.error(`Failed to get token info for ${tokenAddress}: ${error.message}`);
            return null;
        }
    }

    async checkRegistrationStatus(tokenAddress) {
        try {
            log.info(`Checking registration status for ${tokenAddress}...`);

            // Check via precompile
            const isRegistered = await this.precompile.isRegistered(tokenAddress);

            if (isRegistered) {
                const [denom, enabled] = await this.precompile.getTokenPair(tokenAddress);
                log.success(`Token is registered as: ${denom} (enabled: ${enabled})`);
                return { registered: true, denom, enabled };
            } else {
                log.warning('Token is not registered');
                return { registered: false };
            }
        } catch (error) {
            log.error(`Failed to check registration status: ${error.message}`);
            // Fallback to REST API check
            return await this.checkRegistrationViaRest(tokenAddress);
        }
    }

    async checkRegistrationViaRest(tokenAddress) {
        try {
            const response = await axios.get(
                `${CONFIG.REST_URL}/cosmos/erc20/v1/token_pairs/${tokenAddress}`,
                { timeout: 5000 }
            );

            if (response.data && response.data.token_pair) {
                const { denom, enabled } = response.data.token_pair;
                log.success(`Token is registered as: ${denom} (enabled: ${enabled})`);
                return { registered: true, denom, enabled };
            }
        } catch (error) {
            if (error.response && error.response.status === 404) {
                log.warning('Token is not registered');
                return { registered: false };
            }
            log.error(`REST API check failed: ${error.message}`);
        }

        return { registered: false };
    }

    async registerToken(tokenAddress, tokenName) {
        log.info(`Registering ${tokenName} (${tokenAddress})...`);

        try {
            // Get token info first
            const tokenInfo = await this.getTokenInfo(tokenAddress);
            if (tokenInfo) {
                log.info(`Token Info: ${tokenInfo.name} (${tokenInfo.symbol}) - ${tokenInfo.decimals} decimals`);
                log.info(`Total Supply: ${tokenInfo.totalSupply}`);
            }

            // Check if already registered
            const status = await this.checkRegistrationStatus(tokenAddress);
            if (status.registered) {
                log.warning(`Token ${tokenName} is already registered as ${status.denom}`);
                return true;
            }

            // Prepare transaction
            log.info('Preparing registration transaction...');

            const tx = await this.precompile.registerERC20(tokenAddress, {
                gasLimit: CONFIG.GAS_LIMIT,
                gasPrice: CONFIG.GAS_PRICE
            });

            log.info(`Transaction sent: ${tx.hash}`);
            log.info('Waiting for confirmation...');

            const receipt = await tx.wait();

            if (receipt.status === 1) {
                log.success(`Successfully registered ${tokenName}!`);
                log.info(`Block: ${receipt.blockNumber}, Gas used: ${receipt.gasUsed}`);

                // Wait a moment then verify
                await new Promise(resolve => setTimeout(resolve, 3000));
                await this.checkRegistrationStatus(tokenAddress);

                return true;
            } else {
                log.error(`Transaction failed for ${tokenName}`);
                return false;
            }

        } catch (error) {
            log.error(`Failed to register ${tokenName}: ${error.message}`);

            // Parse revert reason if available
            if (error.reason) {
                log.error(`Revert reason: ${error.reason}`);
            }

            return false;
        }
    }

    async registerAllTokens() {
        log.header('Registering All Tokens');

        const results = {};

        for (const [name, address] of Object.entries(CONFIG.TOKENS)) {
            log.info(`\n--- Processing ${name} ---`);
            results[name] = await this.registerToken(address, name);
        }

        // Summary
        log.header('Registration Summary');
        for (const [name, success] of Object.entries(results)) {
            if (success) {
                log.success(`${name}: Successfully registered`);
            } else {
                log.error(`${name}: Registration failed`);
            }
        }

        return results;
    }

    async checkAllTokensStatus() {
        log.header('Checking Token Registration Status');

        for (const [name, address] of Object.entries(CONFIG.TOKENS)) {
            log.info(`\n--- ${name} (${address}) ---`);
            await this.checkRegistrationStatus(address);
        }
    }

    async showUsageExamples() {
        log.header('Usage Examples');

        console.log(`${colors.yellow}Query token registration status:${colors.reset}`);
        console.log(`curl -s "${CONFIG.REST_URL}/cosmos/erc20/v1/token_pairs" | jq .`);
        console.log();

        console.log(`${colors.yellow}Check specific token:${colors.reset}`);
        console.log(`curl -s "${CONFIG.REST_URL}/cosmos/erc20/v1/token_pairs/${CONFIG.TOKENS.WBTC}" | jq .`);
        console.log();

        console.log(`${colors.yellow}Check balances:${colors.reset}`);
        console.log(`# Cosmos balances:`);
        console.log(`curl -s "${CONFIG.REST_URL}/cosmos/bank/v1beta1/balances/${CONFIG.COSMOS_ADDRESS}" | jq .`);
        console.log();
        console.log(`# EVM balances:`);
        console.log(`cast balance ${CONFIG.FAUCET_ADDRESS} --rpc-url ${CONFIG.EVM_RPC_URL}`);
        console.log();

        console.log(`${colors.yellow}Token conversion (programmatic):${colors.reset}`);
        console.log(`// Convert ERC20 to Cosmos coin`);
        console.log(`await precompile.convertERC20ToCoin(tokenAddress, amount, receiverAddress);`);
        console.log();
        console.log(`// Convert Cosmos coin to ERC20`);
        console.log(`await precompile.convertCoinToERC20(denom, amount, receiverAddress);`);
        console.log();
    }
}

// Main execution
async function main() {
    const registrar = new TokenRegistrar();

    try {
        await registrar.init();

        // Parse command line arguments
        const args = process.argv.slice(2);
        const command = args[0];

        switch (command) {
            case 'check':
                await registrar.checkAllTokensStatus();
                break;

            case 'register':
                if (args[1] === 'all') {
                    await registrar.registerAllTokens();
                } else if (args[1] && CONFIG.TOKENS[args[1].toUpperCase()]) {
                    const tokenName = args[1].toUpperCase();
                    const tokenAddress = CONFIG.TOKENS[tokenName];
                    await registrar.registerToken(tokenAddress, tokenName);
                } else {
                    log.error('Invalid token name. Available: WBTC, PEPE, USDT');
                    process.exit(1);
                }
                break;

            case 'examples':
                await registrar.showUsageExamples();
                break;

            default:
                console.log(`${colors.cyan}ERC20 Token Registration Tool${colors.reset}`);
                console.log();
                console.log('Usage:');
                console.log('  node register-erc20-tokens.js check           - Check registration status');
                console.log('  node register-erc20-tokens.js register all    - Register all tokens');
                console.log('  node register-erc20-tokens.js register WBTC   - Register specific token');
                console.log('  node register-erc20-tokens.js examples        - Show usage examples');
                console.log();
                console.log('Available tokens: WBTC, PEPE, USDT');
                break;
        }

    } catch (error) {
        log.error(`Script failed: ${error.message}`);
        process.exit(1);
    }
}

// Export for use as module
export { TokenRegistrar, CONFIG };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}
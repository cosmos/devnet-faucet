import { ethers } from 'ethers';
import { bech32 } from 'bech32';
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { SigningStargateClient } from "@cosmjs/stargate";
import { stringToPath } from '@cosmjs/crypto';
import fs from 'fs/promises';
import path from 'path';
import fetch from 'node-fetch';

/**
 * Core Faucet System
 * Handles dual-environment (Cosmos + EVM) token distribution
 * with comprehensive logging and management
 */
export class FaucetCore {
    constructor(config) {
        this.config = config;
        this.logger = new FaucetLogger(config.logging || {});
        this.state = new FaucetState(config.db);
        this.rateLimiter = new RateLimiter(config.limits || config.blockchain.limit);

        // Initialize providers
        this.evmProvider = null;
        this.cosmosClient = null;
        this.wallets = {
            evm: null,
            cosmos: null
        };

        // Token configurations
        this.tokens = new Map();
        this.precompiles = new Map();

        // Initialize system
        this.initialize();
    }

    async initialize() {
        this.logger.info('Initializing FaucetCore system...');

        try {
            // Initialize providers
            await this.initializeProviders();

            // Initialize wallets
            await this.initializeWallets();

            // Load precompile interfaces
            await this.loadPrecompiles();

            // Load token configurations
            await this.loadTokenConfigurations();

            // Verify system health
            await this.verifySystemHealth();

            this.logger.info('FaucetCore system initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize FaucetCore', error);
            throw error;
        }
    }

    async initializeProviders() {
        // EVM Provider
        this.evmProvider = new ethers.JsonRpcProvider(this.config.blockchain.endpoints.evm_endpoint);

        // Cosmos Provider
        this.cosmosClient = await SigningStargateClient.connectWithSigner(
            this.config.blockchain.endpoints.rpc_endpoint,
            null // Will be set when wallet is created
        );

        this.logger.info('Providers initialized', {
            evm_endpoint: this.config.blockchain.endpoints.evm_endpoint,
            cosmos_endpoint: this.config.blockchain.endpoints.rpc_endpoint
        });
    }

        async initializeWallets() {
        const mnemonic = this.config.blockchain.sender.mnemonic;
        const hdPaths = this.config.blockchain.sender.option.hdPaths;
        const prefix = this.config.blockchain.sender.option.prefix;

        // Create EVM wallet (canonical source)
        const evmWallet = ethers.Wallet.fromPhrase(mnemonic, this.evmProvider);

        // Create Cosmos wallet for signing
        const cosmosWallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
            prefix: prefix,
            hdPaths: this.config.blockchain.sender.option.hdPaths
        });

        // Get the cosmos account info
        const [cosmosAccount] = await cosmosWallet.getAccounts();

        // Create unified wallet object with all formats
        this.wallet = {
            name: 'faucet',
            type: 'local',

            // Private key info
            private_key: evmWallet.privateKey,
            mnemonic: mnemonic,
            derivation_path: this.config.blockchain.sender.option.hdPaths[0],

            // Public key in different formats
            pubkey: {
                hex: evmWallet.publicKey,
                compressed_hex: evmWallet.signingKey.compressedPublicKey,
                bytes: Buffer.from(evmWallet.publicKey.slice(2), 'hex'),
                base64: Buffer.from(evmWallet.publicKey.slice(2), 'hex').toString('base64'),
                cosmos_format: JSON.stringify({
                    "@type": "/cosmos.crypto.secp256k1.PubKey",
                    "key": Buffer.from(evmWallet.signingKey.compressedPublicKey.slice(2), 'hex').toString('base64')
                }),
                evm_format: JSON.stringify({
                    "@type": "/cosmos.evm.crypto.v1.ethsecp256k1.PubKey",
                    "key": Buffer.from(evmWallet.signingKey.compressedPublicKey.slice(2), 'hex').toString('base64')
                })
            },

            // Addresses in different formats
            addresses: {
                hex: evmWallet.address.toLowerCase(),
                evm: evmWallet.address,
                cosmos: this.convertEvmToCosmos(evmWallet.address),
                cosmos_derived: cosmosAccount.address, // From separate derivation
                bytes: Buffer.from(evmWallet.address.slice(2), 'hex')
            },

            // Signing objects
            signers: {
                evm: evmWallet,
                cosmos: cosmosWallet
            }
        };

        // Store legacy references for compatibility
        this.wallets = {
            evm: evmWallet,
            cosmos: cosmosWallet
        };

        // Create cosmos client
        this.cosmosClient = await SigningStargateClient.connectWithSigner(
            this.config.blockchain.endpoints.rpc_endpoint,
            cosmosWallet
        );

        this.logger.info('Unified wallet initialized', {
            name: this.wallet.name,
            evm_address: this.wallet.addresses.evm,
            cosmos_address: this.wallet.addresses.cosmos,
            cosmos_derived: this.wallet.addresses.cosmos_derived,
            addresses_match: this.wallet.addresses.cosmos === this.wallet.addresses.cosmos_derived,
            pubkey_base64: this.wallet.pubkey.base64,
            pubkey_cosmos: this.wallet.pubkey.cosmos_format
        });
    }

    async loadPrecompiles() {
        // Bank precompile for balance queries
        this.precompiles.set('bank', {
            address: '0x0000000000000000000000000000000000000804',
            abi: [
                "function balances(address account) external view returns (tuple(address contractAddress, uint256 amount)[] memory)",
                "function totalSupply() external view returns (tuple(address contractAddress, uint256 amount)[] memory)",
                "function supplyOf(address erc20Address) external view returns (uint256)"
            ],
            contract: null
        });

        // Bech32 precompile for address conversion
        this.precompiles.set('bech32', {
            address: '0x0000000000000000000000000000000000000400',
            abi: [
                "function bech32ToHex(string bech32Address) external returns (address addr)",
                "function hexToBech32(address addr, string prefix) external returns (string bech32Address)"
            ],
            contract: null
        });

        // Initialize precompile contracts
        for (const [name, precompile] of this.precompiles) {
            precompile.contract = new ethers.Contract(
                precompile.address,
                precompile.abi,
                this.wallets.evm
            );
        }

        this.logger.info('Precompiles loaded', {
            count: this.precompiles.size,
            precompiles: Array.from(this.precompiles.keys())
        });
    }

    async loadTokenConfigurations() {
        for (const tokenConfig of this.config.blockchain.tx.amounts) {
            const token = new TokenConfiguration(tokenConfig, this.evmProvider);
            await token.initialize();
            this.tokens.set(token.denom, token);
        }

        this.logger.info('Token configurations loaded', {
            count: this.tokens.size,
            tokens: Array.from(this.tokens.keys())
        });
    }

    async verifySystemHealth() {
        const health = {
            evm_provider: false,
            cosmos_client: false,
            faucet_balance: false,
            precompiles: false,
            tokens: false
        };

                try {
            // Check EVM provider
            const network = await this.evmProvider.getNetwork();
            health.evm_provider = true;
            this.logger.debug('EVM provider healthy', { chainId: network.chainId });

            // Check Cosmos client
            const height = await this.cosmosClient.getHeight();
            health.cosmos_client = true;
            this.logger.debug('Cosmos client healthy', { height });

            // Check faucet balance
            const evmBalance = await this.evmProvider.getBalance(this.wallet.addresses.evm);
            health.faucet_balance = evmBalance > 0n;
            this.logger.debug('Faucet balance', {
                evm_balance: ethers.formatEther(evmBalance)
            });

            // Check precompiles
            const bankContract = this.precompiles.get('bank').contract;
            await bankContract.balances(this.wallet.addresses.evm);
            health.precompiles = true;
            this.logger.debug('Precompiles healthy');

            // Check tokens
            health.tokens = this.tokens.size > 0;
            this.logger.debug('Tokens healthy', { count: this.tokens.size });

        } catch (error) {
            this.logger.error('System health check failed', error);
        }

        const healthScore = Object.values(health).filter(Boolean).length;
        const totalChecks = Object.keys(health).length;

        this.logger.info('System health verified', {
            health_score: `${healthScore}/${totalChecks}`,
            details: health
        });

        // Don't throw error for testing - just warn if health is poor
        if (healthScore < totalChecks) {
            this.logger.warn(`System health degraded: ${healthScore}/${totalChecks} checks passed`);
        }

        return { health, healthScore, totalChecks };
    }

    /**
     * Main faucet function - distributes tokens to recipient
     */
    async dispenseFunds(recipientAddress, requestId = null) {
        const startTime = Date.now();
        requestId = requestId || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        this.logger.info('Processing faucet request', {
            request_id: requestId,
            recipient: recipientAddress,
            timestamp: new Date().toISOString()
        });

        try {
            // 1. Validate and determine address type
            const addressInfo = this.analyzeAddress(recipientAddress);
            this.logger.debug('Address analyzed', { ...addressInfo, request_id: requestId });

            // 2. Check rate limits
            await this.rateLimiter.checkLimits(addressInfo.normalizedAddress, requestId);

            // 3. Check current balances
            const currentBalances = await this.checkRecipientBalances(addressInfo);
            this.logger.debug('Current balances checked', {
                balances: Object.fromEntries(currentBalances),
                request_id: requestId
            });

            // 4. Calculate needed amounts
            const neededAmounts = this.calculateNeededAmounts(currentBalances);

            if (neededAmounts.length === 0) {
                this.logger.info('No tokens needed', { request_id: requestId });
                return {
                    success: true,
                    message: 'Account already has sufficient balance',
                    request_id: requestId,
                    transactions: []
                };
            }

            this.logger.info('Calculated needed amounts', {
                needed: neededAmounts,
                request_id: requestId
            });

            // 5. Execute appropriate transfer method
            let result;
            if (addressInfo.type === 'cosmos') {
                result = await this.sendCosmosTokens(addressInfo, neededAmounts, requestId);
            } else {
                result = await this.sendEvmTokens(addressInfo, neededAmounts, requestId);
            }

            // 6. Update rate limiter
            await this.rateLimiter.recordRequest(addressInfo.normalizedAddress, requestId);

            // 7. Log final result
            const duration = Date.now() - startTime;
            this.logger.info('Faucet request completed', {
                request_id: requestId,
                success: result.success,
                duration_ms: duration,
                transaction_count: result.transactions?.length || 0
            });

            return result;

        } catch (error) {
            const duration = Date.now() - startTime;
            this.logger.error('Faucet request failed', {
                request_id: requestId,
                error: error.message,
                duration_ms: duration
            });
            throw error;
        }
    }

    analyzeAddress(address) {
        // Determine if address is hex (EVM) or bech32 (Cosmos)
        if (address.match(/^0x[a-fA-F0-9]{40}$/)) {
            return {
                type: 'evm',
                original: address,
                normalizedAddress: address.toLowerCase(),
                evmAddress: address,
                cosmosAddress: this.convertEvmToCosmos(address)
            };
        } else if (address.startsWith(this.config.blockchain.sender.option.prefix)) {
            return {
                type: 'cosmos',
                original: address,
                normalizedAddress: address,
                cosmosAddress: address,
                evmAddress: this.convertCosmosToEvm(address)
            };
        } else {
            throw new Error(`Invalid address format: ${address}`);
        }
    }

    convertEvmToCosmos(evmAddress) {
        // Convert 0x address to bech32 - direct conversion of the same address bytes
        const hexBytes = evmAddress.slice(2); // Remove 0x prefix
        const addressBytes = Buffer.from(hexBytes, 'hex');
        return bech32.encode(this.config.blockchain.sender.option.prefix, bech32.toWords(addressBytes));
    }

    convertCosmosToEvm(cosmosAddress) {
        // Convert bech32 to 0x address - direct conversion back to hex
        const decoded = bech32.decode(cosmosAddress);
        const addressBytes = Buffer.from(bech32.fromWords(decoded.words));
        return '0x' + addressBytes.toString('hex');
    }

    async checkRecipientBalances(addressInfo) {
        const balances = new Map();

        try {
            if (addressInfo.type === 'evm') {
                // Use bank precompile to check all token balances
                const bankContract = this.precompiles.get('bank').contract;
                const bankBalances = await bankContract.balances(addressInfo.evmAddress);

                for (const balance of bankBalances) {
                    const tokenAddress = balance.contractAddress;
                    const amount = balance.amount;

                    // Find token by contract address
                    for (const [denom, token] of this.tokens) {
                        if (token.erc20_contract.toLowerCase() === tokenAddress.toLowerCase()) {
                            balances.set(denom, {
                                current: amount,
                                target: BigInt(token.target_balance),
                                decimals: token.decimals
                            });
                            break;
                        }
                    }
                }
            } else {
                // Query Cosmos balances via REST API
                const cosmosBalances = await this.queryCosmosBalances(addressInfo.cosmosAddress);

                for (const [denom, token] of this.tokens) {
                    const cosmosBalance = cosmosBalances.find(b => b.denom === denom);
                    balances.set(denom, {
                        current: cosmosBalance ? BigInt(cosmosBalance.amount) : 0n,
                        target: BigInt(token.target_balance),
                        decimals: token.decimals
                    });
                }
            }
        } catch (error) {
            this.logger.error('Failed to check recipient balances', error);
            throw new Error(`Balance check failed: ${error.message}`);
        }

        return balances;
    }

    calculateNeededAmounts(currentBalances) {
        const needed = [];

        for (const [denom, balance] of currentBalances) {
            if (balance.current < balance.target) {
                const neededAmount = balance.target - balance.current;
                needed.push({
                    denom,
                    amount: neededAmount.toString(),
                    token: this.tokens.get(denom)
                });
            }
        }

        return needed;
    }

        async sendCosmosTokens(addressInfo, neededAmounts, requestId) {
        // Use Cosmos SDK multisend for multiple tokens
        const senderAddress = this.wallet.addresses.cosmos_derived; // Use the derived cosmos address for signing

        const messages = [];
        for (const needed of neededAmounts) {
            messages.push({
                typeUrl: "/cosmos.bank.v1beta1.MsgSend",
                value: {
                    fromAddress: senderAddress,
                    toAddress: addressInfo.cosmosAddress,
                    amount: [{
                        denom: needed.denom,
                        amount: needed.amount
                    }]
                }
            });
        }

        const fee = this.config.blockchain.tx.fee.cosmos;
        const result = await this.cosmosClient.signAndBroadcast(
            senderAddress,
            messages,
            fee
        );

        this.logger.info('Cosmos transaction broadcasted', {
            request_id: requestId,
            tx_hash: result.transactionHash,
            height: result.height,
            gas_used: result.gasUsed
        });

        return {
            success: result.code === 0,
            transactions: [{
                hash: result.transactionHash,
                type: 'cosmos',
                tokens: neededAmounts.map(n => n.denom)
            }],
            request_id: requestId
        };
    }

    async sendEvmTokens(addressInfo, neededAmounts, requestId) {
        // Use individual ERC20 transfers or multisend contract
        const transactions = [];

        for (const needed of neededAmounts) {
            const token = needed.token;

                        if (token.erc20_contract === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE") {
                // Native token transfer
                const tx = await this.wallet.signers.evm.sendTransaction({
                    to: addressInfo.evmAddress,
                    value: needed.amount,
                    gasLimit: 21000
                });

                await tx.wait();
                transactions.push({
                    hash: tx.hash,
                    type: 'native',
                    token: needed.denom
                });
            } else {
                // ERC20 token transfer
                const tokenContract = new ethers.Contract(
                    token.erc20_contract,
                    ["function transfer(address to, uint256 amount) external returns (bool)"],
                    this.wallet.signers.evm
                );

                const tx = await tokenContract.transfer(addressInfo.evmAddress, needed.amount);
                await tx.wait();

                transactions.push({
                    hash: tx.hash,
                    type: 'erc20',
                    token: needed.denom
                });
            }
        }

        this.logger.info('EVM transactions completed', {
            request_id: requestId,
            transaction_count: transactions.length,
            transactions: transactions.map(t => ({ hash: t.hash, token: t.token }))
        });

        return {
            success: true,
            transactions,
            request_id: requestId
        };
    }

    async queryCosmosBalances(address) {
        const url = `${this.config.blockchain.endpoints.rest_endpoint}/cosmos/bank/v1beta1/balances/${address}`;
        const response = await fetch(url);
        const data = await response.json();
        return data.balances || [];
    }

    // Generate deployment report
    async generateDeploymentReport() {
        const report = {
            timestamp: new Date().toISOString(),
            network: {
                chain_id: this.config.blockchain.ids.chainId,
                cosmos_chain_id: this.config.blockchain.ids.cosmosChainId,
                endpoints: this.config.blockchain.endpoints
            },
            faucet_wallet: {
                name: this.wallet.name,
                evm_address: this.wallet.addresses.evm,
                cosmos_address: this.wallet.addresses.cosmos,
                cosmos_derived: this.wallet.addresses.cosmos_derived,
                pubkey: this.wallet.pubkey.evm_format
            },
            tokens: {},
            precompiles: {},
            system_health: await this.getSystemHealth()
        };

        // Add token information
        for (const [denom, token] of this.tokens) {
            report.tokens[denom] = {
                name: token.name || denom,
                symbol: denom,
                decimals: token.decimals,
                erc20_contract: token.erc20_contract,
                amount_per_request: token.amount,
                target_balance: token.target_balance
            };
        }

        // Add precompile information
        for (const [name, precompile] of this.precompiles) {
            report.precompiles[name] = {
                address: precompile.address,
                functions: precompile.abi.map(a => a.split('function ')[1]?.split('(')[0]).filter(Boolean)
            };
        }

        // Save report
        const reportPath = `reports/deployment_${Date.now()}.json`;
        await fs.mkdir('reports', { recursive: true });
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

        this.logger.info('Deployment report generated', { path: reportPath });
        return report;
    }

    async getSystemHealth() {
        const { health, healthScore, totalChecks } = await this.verifySystemHealth();
        return {
            status: healthScore === totalChecks ? 'healthy' : 'degraded',
            checks: health,
            score: `${healthScore}/${totalChecks}`
        };
    }
}

/**
 * Token Configuration Class
 */
class TokenConfiguration {
    constructor(config, provider) {
        this.denom = config.denom;
        this.amount = config.amount;
        this.erc20_contract = config.erc20_contract;
        this.decimals = config.decimals;
        this.target_balance = config.target_balance;
        this.provider = provider;
        this.contract = null;
    }

    async initialize() {
        if (this.erc20_contract !== "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE") {
            this.contract = new ethers.Contract(
                this.erc20_contract,
                [
                    "function name() view returns (string)",
                    "function symbol() view returns (string)",
                    "function decimals() view returns (uint8)",
                    "function transfer(address to, uint256 amount) external returns (bool)"
                ],
                this.provider
            );
        }
    }
}

/**
 * Logging System
 */
class FaucetLogger {
    constructor(config) {
        this.config = config;
        this.logFile = config.file || 'logs/faucet.log';
        this.ensureLogDirectory();
    }

    async ensureLogDirectory() {
        await fs.mkdir(path.dirname(this.logFile), { recursive: true });
    }

    log(level, message, data = {}) {
        const sanitizedData = this.sanitizeData(data);
        const logEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            ...sanitizedData
        };

        console.log(`[${level.toUpperCase()}] ${message}`, sanitizedData);

        // Also write to file
        fs.appendFile(this.logFile, JSON.stringify(logEntry) + '\n').catch(console.error);
    }

    sanitizeData(data) {
        return JSON.parse(JSON.stringify(data, (key, value) =>
            typeof value === 'bigint' ? value.toString() : value
        ));
    }

    info(message, data) { this.log('info', message, data); }
    debug(message, data) { this.log('debug', message, data); }
    warn(message, data) { this.log('warn', message, data); }
    error(message, error) {
        this.log('error', message, {
            error: error?.message || error,
            stack: error?.stack
        });
    }
}

/**
 * Rate Limiting System
 */
class RateLimiter {
    constructor(config) {
        this.config = config;
        this.requests = new Map(); // address -> timestamp[]
    }

    async checkLimits(address, requestId) {
        const now = Date.now();
        const windowMs = 12 * 60 * 60 * 1000; // 12 hours

        if (!this.requests.has(address)) {
            this.requests.set(address, []);
        }

        const addressRequests = this.requests.get(address);
        const recentRequests = addressRequests.filter(time => now - time < windowMs);

        if (recentRequests.length >= this.config.address) {
            throw new Error(`Rate limit exceeded: Only ${this.config.address} request per 12 hours allowed`);
        }
    }

    async recordRequest(address, requestId) {
        if (!this.requests.has(address)) {
            this.requests.set(address, []);
        }
        this.requests.get(address).push(Date.now());
    }
}

/**
 * State Management
 */
class FaucetState {
    constructor(config) {
        this.config = config;
    }

    // Implementation for persistent state management
}

export default FaucetCore;
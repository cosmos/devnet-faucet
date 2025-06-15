#!/usr/bin/env node

/**
 * Comprehensive Token Registration System for Cosmos EVM
 * 
 * Handles both directions of token registration:
 * 1. ERC20 tokens needing cosmos/native representation (werc20 precompile)
 * 2. Native cosmos tokens needing ERC20 representation (erc20 module/precompile)
 * 
 * This system provides automated token registration with proper validation
 * and integration into deployment workflows.
 */

import { ethers } from 'ethers';
import { DirectSecp256k1Wallet, DirectSecp256k1HdWallet, Registry } from '@cosmjs/proto-signing';
import { SigningStargateClient, GasPrice } from '@cosmjs/stargate';
import { fromHex, toBase64, toHex } from '@cosmjs/encoding';
import { bech32 } from 'bech32';
import fetch from 'node-fetch';
import config from '../config.js';

// Registration system configuration
const REGISTRATION_CONFIG = {
    cosmos_rpc: config.blockchain.endpoints.rpc_endpoint,
    cosmos_rest: config.blockchain.endpoints.rest_endpoint,
    evm_rpc: config.blockchain.endpoints.evm_endpoint,
    chain_id: config.blockchain.ids.cosmosChainId,
    gas_price: '20000000000uatom',
    
    // Precompile addresses
    precompiles: {
        erc20: '0x0000000000000000000000000000000000000802',  // ERC20 module precompile
        werc20: '0x0000000000000000000000000000000000000803', // WERC20 precompile
        bank: '0x0000000000000000000000000000000000000804'    // Bank precompile
    },
    
    // Message types for registration
    message_types: {
        register_erc20: '/cosmos.evm.erc20.v1.MsgRegisterERC20',
        register_coin: '/cosmos.evm.erc20.v1.MsgRegisterCoin'
    }
};

/**
 * Token Registration Manager
 */
class TokenRegistrationManager {
    constructor() {
        this.evmProvider = new ethers.JsonRpcProvider(REGISTRATION_CONFIG.evm_rpc);
        this.cosmosClient = null;
        this.wallet = null;
        this.registry = new Registry();
        
        // Track registration status
        this.registrationStatus = {
            erc20_to_cosmos: new Map(),
            cosmos_to_erc20: new Map()
        };
    }

    async initialize() {
        console.log(' Initializing Token Registration Manager...');
        
        // Initialize cosmos wallet
        await this.initializeWallet();
        
        // Initialize cosmos client
        await this.initializeCosmosClient();
        
        // Register message types
        this.registerMessageTypes();
        
        console.log(' Token Registration Manager initialized');
    }

    async initializeWallet() {
        const mnemonic = config.blockchain.sender.mnemonic.trim();
        const prefix = config.blockchain.sender.option.prefix;
        const hdPaths = config.blockchain.sender.option.hdPaths;

        // Use the same ETH-compatible derivation as the faucet
        const { HDNodeWallet } = await import('ethers');
        const { pathToString } = await import('@cosmjs/crypto');
        
        // Create EVM wallet first (canonical source)
        const evmWallet = HDNodeWallet.fromPhrase(mnemonic, undefined, pathToString(hdPaths[0]));
        
        // Convert to cosmos address using the same method as faucet
        const cosmosAddress = this.evmToCosmosAddress(evmWallet, prefix);
        
        // Get private key for cosmos wallet
        const privateKeyBytes = Buffer.from(evmWallet.privateKey.slice(2), 'hex');
        
        // Create cosmos wallet with the same private key
        this.wallet = await DirectSecp256k1Wallet.fromKey(privateKeyBytes, prefix);
        
        // Override getAccounts to return the ETH-compatible address
        const originalGetAccounts = this.wallet.getAccounts.bind(this.wallet);
        this.wallet.getAccounts = async () => {
            const accounts = await originalGetAccounts();
            accounts[0].address = cosmosAddress;
            return accounts;
        };

        console.log('💼 Wallet initialized:', cosmosAddress);
        console.log('   EVM address:', evmWallet.address);
    }

    evmToCosmosAddress(evmWallet, prefix) {
        // Same method as faucet - convert hex to bech32 directly (ETH-compatible)
        const hex = evmWallet.address.replace('0x', '');
        const addressBytes = Buffer.from(hex, 'hex');
        return bech32.encode(prefix, bech32.toWords(addressBytes));
    }

    async initializeCosmosClient() {
        this.cosmosClient = await SigningStargateClient.connectWithSigner(
            REGISTRATION_CONFIG.cosmos_rpc,
            this.wallet,
            {
                registry: this.registry,
                gasPrice: GasPrice.fromString(REGISTRATION_CONFIG.gas_price)
            }
        );
        
        console.log('🌐 Cosmos client connected');
    }

    registerMessageTypes() {
        // Register ERC20 message type
        this.registry.register(REGISTRATION_CONFIG.message_types.register_erc20, {
            encode: (message) => {
                const writer = new Uint8Array(1024);
                let offset = 0;

                // Field 1: signer (string)
                if (message.signer) {
                    const signerBytes = new TextEncoder().encode(message.signer);
                    writer[offset++] = 0x0a;
                    writer[offset++] = signerBytes.length;
                    writer.set(signerBytes, offset);
                    offset += signerBytes.length;
                }

                // Field 2: erc20addresses (repeated string)
                if (message.erc20addresses) {
                    for (const address of message.erc20addresses) {
                        const addressBytes = new TextEncoder().encode(address);
                        writer[offset++] = 0x12;
                        writer[offset++] = addressBytes.length;
                        writer.set(addressBytes, offset);
                        offset += addressBytes.length;
                    }
                }

                return { finish: () => writer.slice(0, offset) };
            }
        });

        // Register Coin message type
        this.registry.register(REGISTRATION_CONFIG.message_types.register_coin, {
            encode: (message) => {
                const writer = new Uint8Array(1024);
                let offset = 0;

                // Field 1: signer (string)
                if (message.signer) {
                    const signerBytes = new TextEncoder().encode(message.signer);
                    writer[offset++] = 0x0a;
                    writer[offset++] = signerBytes.length;
                    writer.set(signerBytes, offset);
                    offset += signerBytes.length;
                }

                // Field 2: metadata (Coin metadata)
                if (message.metadata) {
                    const metadataBytes = this.encodeCoinMetadata(message.metadata);
                    writer[offset++] = 0x12;
                    writer[offset++] = metadataBytes.length;
                    writer.set(metadataBytes, offset);
                    offset += metadataBytes.length;
                }

                return { finish: () => writer.slice(0, offset) };
            }
        });

        console.log(' Message types registered');
    }

    encodeCoinMetadata(metadata) {
        const writer = new Uint8Array(512);
        let offset = 0;

        // Basic coin metadata encoding
        if (metadata.description) {
            const descBytes = new TextEncoder().encode(metadata.description);
            writer[offset++] = 0x0a;
            writer[offset++] = descBytes.length;
            writer.set(descBytes, offset);
            offset += descBytes.length;
        }

        if (metadata.base) {
            const baseBytes = new TextEncoder().encode(metadata.base);
            writer[offset++] = 0x12;
            writer[offset++] = baseBytes.length;
            writer.set(baseBytes, offset);
            offset += baseBytes.length;
        }

        if (metadata.display) {
            const displayBytes = new TextEncoder().encode(metadata.display);
            writer[offset++] = 0x1a;
            writer[offset++] = displayBytes.length;
            writer.set(displayBytes, offset);
            offset += displayBytes.length;
        }

        return writer.slice(0, offset);
    }

    /**
     * Register ERC20 tokens for cosmos representation (werc20 precompile)
     */
    async registerERC20TokensForCosmos(erc20Contracts) {
        console.log(' Registering ERC20 tokens for cosmos representation...');
        console.log('   Using werc20 precompile at:', REGISTRATION_CONFIG.precompiles.werc20);
        
        const [account] = await this.wallet.getAccounts();
        
        // Create registration message
        const registerMsg = {
            typeUrl: REGISTRATION_CONFIG.message_types.register_erc20,
            value: {
                signer: account.address,
                erc20addresses: erc20Contracts
            }
        };

        const fee = {
            amount: [{ denom: 'uatom', amount: '10000' }],
            gas: '300000'
        };

        try {
            console.log('📤 Submitting ERC20 registration transaction...');
            const result = await this.cosmosClient.signAndBroadcast(
                account.address,
                [registerMsg],
                fee,
                'Register ERC20 tokens for cosmos representation'
            );

            if (result.code === 0) {
                console.log(' ERC20 tokens registered successfully!');
                console.log('   Transaction hash:', result.transactionHash);
                console.log('   Gas used:', result.gasUsed);
                
                // Update status tracking
                for (const contract of erc20Contracts) {
                    this.registrationStatus.erc20_to_cosmos.set(contract, {
                        status: 'registered',
                        tx_hash: result.transactionHash,
                        timestamp: new Date().toISOString()
                    });
                }
                
                return {
                    success: true,
                    tx_hash: result.transactionHash,
                    gas_used: result.gasUsed,
                    registered_contracts: erc20Contracts
                };
            } else {
                throw new Error(`Registration failed with code ${result.code}: ${result.rawLog}`);
            }
        } catch (error) {
            console.error(' ERC20 registration failed:', error.message);
            throw error;
        }
    }

    /**
     * Register native cosmos tokens for ERC20 representation (erc20 module)
     */
    async registerNativeTokensForERC20(coinMetadata) {
        console.log(' Registering native tokens for ERC20 representation...');
        console.log('   Using erc20 module precompile at:', REGISTRATION_CONFIG.precompiles.erc20);
        
        const [account] = await this.wallet.getAccounts();
        
        const registerMsg = {
            typeUrl: REGISTRATION_CONFIG.message_types.register_coin,
            value: {
                signer: account.address,
                metadata: coinMetadata
            }
        };

        const fee = {
            amount: [{ denom: 'uatom', amount: '10000' }],
            gas: '300000'
        };

        try {
            console.log('📤 Submitting native token registration transaction...');
            const result = await this.cosmosClient.signAndBroadcast(
                account.address,
                [registerMsg],
                fee,
                'Register native token for ERC20 representation'
            );

            if (result.code === 0) {
                console.log(' Native token registered successfully!');
                console.log('   Transaction hash:', result.transactionHash);
                console.log('   Gas used:', result.gasUsed);
                
                // Update status tracking
                this.registrationStatus.cosmos_to_erc20.set(coinMetadata.base, {
                    status: 'registered',
                    tx_hash: result.transactionHash,
                    timestamp: new Date().toISOString()
                });
                
                return {
                    success: true,
                    tx_hash: result.transactionHash,
                    gas_used: result.gasUsed,
                    registered_coin: coinMetadata.base
                };
            } else {
                throw new Error(`Registration failed with code ${result.code}: ${result.rawLog}`);
            }
        } catch (error) {
            console.error(' Native token registration failed:', error.message);
            throw error;
        }
    }

    /**
     * Check registration status and query token pairs
     */
    async checkTokenPairs() {
        try {
            console.log(' Checking current token pairs...');
            
            const response = await fetch(`${REGISTRATION_CONFIG.cosmos_rest}/cosmos/evm/erc20/v1/token_pairs`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            console.log(`📊 Found ${data.token_pairs?.length || 0} token pairs:`);
            if (data.token_pairs) {
                data.token_pairs.forEach((pair, index) => {
                    console.log(`   ${index + 1}. ${pair.denom} ↔ ${pair.erc20_address} (enabled: ${pair.enabled})`);
                });
            }
            
            return data.token_pairs || [];
        } catch (error) {
            console.error(' Error checking token pairs:', error.message);
            return [];
        }
    }

    /**
     * Comprehensive registration for all configured tokens
     */
    async registerAllConfiguredTokens() {
        console.log(' Starting comprehensive token registration...');
        
        const results = {
            erc20_registrations: [],
            native_registrations: [],
            errors: []
        };

        // Extract ERC20 contracts from config
        const erc20Contracts = config.blockchain.tx.amounts
            .filter(token => token.erc20_contract && token.erc20_contract !== "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE")
            .map(token => token.erc20_contract);

        // Register ERC20 tokens for cosmos representation
        if (erc20Contracts.length > 0) {
            try {
                console.log('\n Registering ERC20 tokens:', erc20Contracts);
                const erc20Result = await this.registerERC20TokensForCosmos(erc20Contracts);
                results.erc20_registrations.push(erc20Result);
            } catch (error) {
                results.errors.push({
                    type: 'erc20_registration',
                    error: error.message,
                    contracts: erc20Contracts
                });
            }
        }

        // Register native tokens for ERC20 representation  
        const nativeTokens = config.blockchain.tx.amounts
            .filter(token => token.erc20_contract === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE");

        for (const token of nativeTokens) {
            try {
                console.log(`\n Registering native token: ${token.denom}`);
                const coinMetadata = {
                    description: `${token.denom} native token`,
                    base: token.denom,
                    display: token.denom,
                    name: token.denom.toUpperCase(),
                    symbol: token.denom.toUpperCase(),
                    denom_units: [
                        {
                            denom: token.denom,
                            exponent: 0,
                            aliases: []
                        },
                        {
                            denom: token.denom.slice(1), // Remove 'u' prefix
                            exponent: token.decimals,
                            aliases: []
                        }
                    ]
                };
                
                const nativeResult = await this.registerNativeTokensForERC20(coinMetadata);
                results.native_registrations.push(nativeResult);
            } catch (error) {
                results.errors.push({
                    type: 'native_registration',
                    error: error.message,
                    token: token.denom
                });
            }
        }

        // Wait for registration to be processed
        console.log('\n⏳ Waiting for registrations to be processed...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Check final token pairs status
        const tokenPairs = await this.checkTokenPairs();
        results.final_token_pairs = tokenPairs;

        return results;
    }

    /**
     * Generate registration report
     */
    generateReport(results) {
        console.log('\n📊 Token Registration Report');
        console.log('=' .repeat(50));
        
        console.log(` ERC20 Registrations: ${results.erc20_registrations.length}`);
        results.erc20_registrations.forEach((reg, i) => {
            console.log(`   ${i + 1}. ${reg.registered_contracts.length} contracts registered`);
            console.log(`      TX: ${reg.tx_hash}`);
            console.log(`      Gas: ${reg.gas_used}`);
        });
        
        console.log(` Native Registrations: ${results.native_registrations.length}`);
        results.native_registrations.forEach((reg, i) => {
            console.log(`   ${i + 1}. ${reg.registered_coin} registered`);
            console.log(`      TX: ${reg.tx_hash}`);
            console.log(`      Gas: ${reg.gas_used}`);
        });
        
        if (results.errors.length > 0) {
            console.log(` Errors: ${results.errors.length}`);
            results.errors.forEach((error, i) => {
                console.log(`   ${i + 1}. ${error.type}: ${error.error}`);
            });
        }
        
        console.log(` Final Token Pairs: ${results.final_token_pairs?.length || 0}`);
        
        return results;
    }
}

/**
 * Command line interface
 */
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    
    const manager = new TokenRegistrationManager();
    
    try {
        await manager.initialize();
        
        switch (command) {
            case 'register-all':
                console.log(' Registering all configured tokens...');
                const results = await manager.registerAllConfiguredTokens();
                manager.generateReport(results);
                break;
                
            case 'register-erc20':
                const contracts = args.slice(1);
                if (contracts.length === 0) {
                    console.error(' Please provide ERC20 contract addresses');
                    process.exit(1);
                }
                await manager.registerERC20TokensForCosmos(contracts);
                break;
                
            case 'check':
                await manager.checkTokenPairs();
                break;
                
            case 'status':
                const pairs = await manager.checkTokenPairs();
                console.log('\n📊 Token Registration Status:');
                if (pairs.length === 0) {
                    console.log('   No token pairs found. Run registration first.');
                } else {
                    console.log(`   ${pairs.length} token pairs active`);
                }
                break;
                
            default:
                console.log('🔧 Token Registration System');
                console.log('');
                console.log('Usage:');
                console.log('  node scripts/token-registration-system.js register-all     - Register all configured tokens');
                console.log('  node scripts/token-registration-system.js register-erc20 <addresses...> - Register specific ERC20 contracts');
                console.log('  node scripts/token-registration-system.js check            - Check current token pairs');
                console.log('  node scripts/token-registration-system.js status          - Show registration status');
                console.log('');
                console.log('Examples:');
                console.log('  node scripts/token-registration-system.js register-all');
                console.log('  node scripts/token-registration-system.js register-erc20 0x123... 0x456...');
                break;
        }
        
    } catch (error) {
        console.error(' Registration system failed:', error.message);
        process.exit(1);
    }
}

// Export for module use
export { TokenRegistrationManager, REGISTRATION_CONFIG };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}
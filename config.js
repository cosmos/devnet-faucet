import { stringToPath } from '@cosmjs/crypto'
import fs from 'fs'
import secureKeyManager from './src/SecureKeyManager.js';

const config = {
    port: 8088, 
    // http port
    db: {
        path: ".faucet/history.db" // save request states
    },
    project: {
        name: "Cosmos-EVM Devnet Faucet",
        logo: "https://raw.githubusercontent.com/cosmos/chain-registry/master/cosmoshub/images/atom.svg",
        deployer: `<a href="https://cosmos.network">Cosmos Network</a>`
    },
    // Single chain with dual environments (Cosmos + EVM)
    blockchain: {
        name: "cosmos-evm-chain",
        type: "DualEnvironment", // New type for dual environment support
        ids: {
            chainId: 4231, // EVM chain ID 
            cosmosChainId: '4321', // Cosmos chain ID
        },
        endpoints: {
            // Cosmos environment
            rpc_endpoint: "https://devnet-1-rpc.ib.skip.build",
            grpc_endpoint: "devnet-1-grpc.ib.skip.build:443",
            rest_endpoint: "https://devnet-1-lcd.ib.skip.build",
            // EVM environment
            evm_endpoint: "https://devnet-1-evmrpc.ib.skip.build",
            evm_websocket: "wss://devnet-1-evmws.ib.skip.build",
            evm_explorer: "https://evm-devnet-1.cloud.blockscout.com",
        },
        // Contract addresses - will be set after deployment
        contracts: {
            atomicMultiSend: "0x3c084F35C6c183b4F6ae56681BBbFEfcE5DD8d32", // Will be set after deployment - conflicted with PEPE token
        },
        sender: {
            // Using eth_secp256k1 derivation path for both environments
            option: {
                hdPaths: [stringToPath("m/44'/60'/0'/0/0")], // Ethereum derivation path
                prefix: "cosmos" // Cosmos address prefix - updated to use cosmos prefix
            }
        },
        tx: {
            // Multi-token amounts - target balance of 1000 tokens each
            amounts: [
                // Note: Removed WATOM due to precompile issues
                // Will send 1 ATOM via cosmos for gas fees separately
                {
                    denom: "wbtc", // Wrapped Bitcoin
                    amount: "100000000000", // 1000 WBTC (8 decimals)
                    erc20_contract: "0x89244Ac15bE3F556d5a1C9eFb657D660DCf72a8F", // Will be set after token deployment
                    decimals: 8,
                    target_balance: "100000000000" // 1000 tokens target
                },
                {
                    denom: "pepe", // Pepe Token
                    amount: "1000000000000000000000", // 1000 PEPE (18 decimals)
                    erc20_contract: "0xc85FBf1a2f54227d64dAa9f13dA74367dA7f3462", // Will be set after token deployment
                    decimals: 18,
                    target_balance: "1000000000000000000000" // 1000 tokens target
                },
                {
                    denom: "usdt", // Tether USD
                    amount: "1000000000", // 1000 USDT (6 decimals)
                    erc20_contract: "0x1B942C0f5C4EE2728C35ddB32313026583F92437", // Will be set after token deployment
                    decimals: 6,
                    target_balance: "1000000000" // 1000 tokens target
                }
            ],
            fee: {
                // Cosmos fee
                cosmos: {
                    amount: [
                        {
                            amount: "5000",
                            denom: "uatom" // Use native token for fees - changed from uatom to uatom
                        }
                    ],
                    gas: "200000"
                },
                // EVM fee (gas settings)
                evm: {
                    gasLimit: "100000",
                    gasPrice: "20000000000" // 20 gwei
                }
            },
        },
        limit: {
            // how many times each wallet address is allowed in a window(24h)
            address: 1,
            // how many times each ip is allowed in a window(24h)
            ip: 10
        }
    }
}

// Secure key management functions
export const initializeSecureKeys = async () => {
    await secureKeyManager.initialize();
    
    // Update config with derived addresses for caching
    const addresses = secureKeyManager.getAddresses();
    config.derivedAddresses = addresses;
    
    console.log(' Secure keys initialized and cached in config');
};

// Secure private key access - only accessible within application
export const getPrivateKey = () => secureKeyManager.getPrivateKeyHex();
export const getPrivateKeyBytes = () => secureKeyManager.getPrivateKeyBytes();
export const getPublicKeyBytes = () => secureKeyManager.getPublicKeyBytes();

// Address getters
export const getEvmAddress = () => secureKeyManager.getEvmAddress();
export const getCosmosAddress = () => secureKeyManager.getCosmosAddress();
export const getEvmPublicKey = () => secureKeyManager.getEvmPublicKey();

// Validation function for startup checks
export const validateDerivedAddresses = (expectedAddresses) => {
    return secureKeyManager.validateAddresses(expectedAddresses);
};

// Legacy exports for backward compatibility - deprecated, use getEvmAddress() instead
export const DERIVED_ADDRESS = null; // Deprecated: use getEvmAddress()
export const DERIVED_PUBLIC_KEY = null; // Deprecated: use getEvmPublicKey()  
export const DERIVED_COSMOS_ADDRESS = null; // Deprecated: use getCosmosAddress()

export default config;

// Configuration auto-updated on 2025-06-17T21:40:00.000Z
import { stringToPath } from '@cosmjs/crypto'
import fs from 'fs'
import secureKeyManager from './src/SecureKeyManager.js';
import TokenConfigLoader from './src/TokenConfigLoader.js';

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
            atomicMultiSend: "0x8dfFd28aB4B62cee9f210C55ced53f418c20fDb6", // AtomicMultiSend contract
        },
        sender: {
            // Using eth_secp256k1 derivation path for both environments
            option: {
                hdPaths: [stringToPath("m/44'/60'/0'/0/0")], // Ethereum derivation path
                prefix: "cosmos" // Cosmos address prefix - updated to use cosmos prefix
            }
        },
        tx: {
            // Multi-token amounts - will be loaded from tokens.json below
            amounts: [], // Will be populated after TokenConfigLoader initialization
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

// Initialize TokenConfigLoader with network config from above
const networkConfig = {
    name: config.blockchain.name,
    chainId: config.blockchain.ids.chainId,
    cosmosChainId: config.blockchain.ids.cosmosChainId,
    type: config.blockchain.type
};

const tokenLoader = new TokenConfigLoader(networkConfig);

// Populate token amounts from tokens.json
config.blockchain.tx.amounts = tokenLoader.getAllTokensForConfig();

// Update contract addresses from tokens.json
const faucetConfig = tokenLoader.getFaucetConfig();
config.blockchain.contracts.atomicMultiSend = faucetConfig.atomicMultiSend;

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

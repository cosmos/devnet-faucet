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
            chainId: 262144, // EVM chain ID (0x40000)
            cosmosChainId: 'cosmos_262144-1', // Cosmos chain ID
        },
        endpoints: {
            // Cosmos environment
            rpc_endpoint: "https://cevm-01-rpc.dev.skip.build",
            grpc_endpoint: "https://cevm-01-grpc.dev.skip.build",
            rest_endpoint: "https://cevm-01-lcd.dev.skip.build",
            // EVM environment
            evm_endpoint: "https://cevm-01-evmrpc.dev.skip.build",
            evm_websocket: "wss://cevm-01-evmws.dev.skip.build",
        },
        // Contract addresses - loaded from environment variables for security
        contracts: {
            atomicMultiSend: "0xbd6D34F5B21bbF706b99fC7AD1d7a936125A4f0c", // Will be set after deployment
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
                    erc20_contract: "0xa9f2644d613a1466fb06d84Be03EDD04EC98b5C4", // Will be set after token deployment
                    decimals: 8,
                    target_balance: "100000000000" // 1000 tokens target
                },
                {
                    denom: "pepe", // Pepe Token
                    amount: "1000000000000000000000", // 1000 PEPE (18 decimals)
                    erc20_contract: "0xEd2278587974d0dF4049b1Fe23d30FA9A35Ee282", // Will be set after token deployment
                    decimals: 18,
                    target_balance: "1000000000000000000000" // 1000 tokens target
                },
                {
                    denom: "usdt", // Tether USD
                    amount: "1000000000", // 1000 USDT (6 decimals)
                    erc20_contract: "0x814500eB7ab9BA14e829915D8A7973E2492C1750", // Will be set after token deployment
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

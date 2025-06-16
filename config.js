import { stringToPath } from '@cosmjs/crypto'
import fs from 'fs'
import { Wallet, HDNodeWallet, randomBytes } from 'ethers';

// Load mnemonic from environment variable for security
const mnemonic = process.env.MNEMONIC || (() => {
    console.error('❌ MNEMONIC environment variable not set');
    console.error('For Vercel: Add MNEMONIC to environment variables');
    console.error('For local: export MNEMONIC="your twelve word mnemonic phrase here"');
    process.exit(1);
})()

const config = {
    port: 8088, 
    derivedAddresses: {
            "evm": {
                    "address": "0x42e6047c5780B103E52265F6483C2d0113aA6B87",
                    "privateKey": "0xdd138b977ac3248b328b7b65ac30338b1482a17197a175f03fd2df20fb0919c6",
                    "publicKey": "0x031574a63348311b1d3e7738a1a2d1328404368b34fd99b4ab656625c0943c2d16"
            },
            "cosmos": {
                    "address": "cosmos1f2nl9zt6qxuxqu30mqlpgxrxhlq77r7gkm3syp",
                    "publicKey": "AxV0pjNIMRsdPnc4oaLRMoQENos0/Zm0q2VmJcCUPC0W",
                    "publicKeyHex": "031574a63348311b1d3e7738a1a2d1328404368b34fd99b4ab656625c0943c2d16"
            },
            "derivation": {
                    "path": "m/44'/60'/0'/0/0",
                    "prefix": "cosmos",
                    "derivedAt": "2025-06-16T19:59:13.319Z"
            }
    },
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
        // Contract addresses - centralized for all components
        contracts: {
            atomicMultiSend: "0x7526f84B6dEcAb19ad1523a0011325C13Bdf7085", // New AtomicMultiSend contract for reliable token distribution
        },
        sender: {
            mnemonic,
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
                    erc20_contract: "0x921c48F521329cF6187D1De1D0Ca5181B47FF946", // New deployed WBTC contract
                    decimals: 8,
                    target_balance: "100000000000" // 1000 tokens target
                },
                {
                    denom: "pepe", // Pepe Token
                    amount: "1000000000000000000000", // 1000 PEPE (18 decimals)
                    erc20_contract: "0xD15E993afA1ee82FF0B47dc8Bb601C2747f24Be9", // New deployed PEPE contract
                    decimals: 18,
                    target_balance: "1000000000000000000000" // 1000 tokens target
                },
                {
                    denom: "usdt", // Tether USD
                    amount: "1000000000", // 1000 USDT (6 decimals)
                    erc20_contract: "0x480f8F25d13D523e89E9aaC518A5674A305ff687", // New deployed USDT contract
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

// Function to get cached addresses or derive if missing
const getWalletAddresses = () => {
    if (config.derivedAddresses) {
        console.log('✅ Using cached wallet addresses');
        return {
            privateKey: config.derivedAddresses.evm.privateKey,
            address: config.derivedAddresses.evm.address,
            publicKey: config.derivedAddresses.evm.publicKey,
            cosmosAddress: config.derivedAddresses.cosmos.address
        };
    } else {
        console.log('⚠️  No cached addresses found - deriving from mnemonic...');
        console.log('   This should only happen once during initial setup');
        const hdPath = "m/44'/60'/0'/0/0"; // Ethereum derivation path
        const wallet = HDNodeWallet.fromPhrase(mnemonic, undefined, hdPath);
        return {
            privateKey: wallet.privateKey,
            address: wallet.address,
            publicKey: wallet.publicKey,
            cosmosAddress: null // Will need to be derived separately
        };
    }
}

// Get wallet addresses (cached or derived)
const WALLET_ADDRESSES = getWalletAddresses();

// Export derived values for use throughout the application
export const DERIVED_PRIVATE_KEY = WALLET_ADDRESSES.privateKey;
export const DERIVED_ADDRESS = WALLET_ADDRESSES.address;
export const DERIVED_PUBLIC_KEY = WALLET_ADDRESSES.publicKey;
export const DERIVED_COSMOS_ADDRESS = WALLET_ADDRESSES.cosmosAddress;

export default config;

import { stringToPath } from '@cosmjs/crypto'
import fs from 'fs'
import { Wallet, HDNodeWallet, randomBytes } from 'ethers';

// Use the specific faucet mnemonic
const mnemonic = "mosquito peanut thought width car cushion salt matter trouble census win tribe leisure truth install basic april direct indicate eyebrow liar afraid street trip"
// Mnemonic loaded for wallet initialization

export default {
    port: 8088, // http port
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
            atomicMultiSend: "0x247CA16B2Fc5c9ae031e83c317c6DC6933Db7246", // New AtomicMultiSend contract for reliable token distribution
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
                    erc20_contract: "0xC52cB914767C076919Dc4245D4B005c8865a2f1F", // Deployed WBTC contract
                    decimals: 8,
                    target_balance: "100000000000" // 1000 tokens target
                },
                {
                    denom: "pepe", // Pepe Token
                    amount: "1000000000000000000000", // 1000 PEPE (18 decimals)
                    erc20_contract: "0xD0C124828bF8648E8681d1eD3117f20Ab989e7a1", // Deployed PEPE contract
                    decimals: 18,
                    target_balance: "1000000000000000000000" // 1000 tokens target
                },
                {
                    denom: "usdt", // Tether USD
                    amount: "1000000000", // 1000 USDT (6 decimals)
                    erc20_contract: "0xf66bB908fa291EE1Fd78b09937b14700839E7c80", // Deployed USDT contract
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

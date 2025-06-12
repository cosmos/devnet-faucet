import { stringToPath } from '@cosmjs/crypto'
import fs from 'fs'
import { Wallet, HDNodeWallet, randomBytes } from 'ethers';

const HOME = ".faucet";
const mnemonic_path= `${HOME}/mnemonic.txt`
if (!fs.existsSync(mnemonic_path)) {
    fs.mkdirSync(HOME, { recursive: true })
    const randomWallet = HDNodeWallet.fromEntropy(randomBytes(32))
    fs.writeFileSync(mnemonic_path, randomWallet.mnemonic.phrase)
}

const mnemonic = fs.readFileSync(mnemonic_path, 'utf8')
console.log("======================== faucet mnemonic =========================")
console.log(mnemonic)
console.log("==================================================================")

export default {
    port: 8088, // http port
    db: {
        path: `${HOME}/history.db` // save request states
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
                {
                    denom: "uatom", // Native cosmos denom (native token like ETH)
                    amount: "1000000000", // 1000 tokens (6 decimals)
                    erc20_contract: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", // Native token representation
                    decimals: 6,
                    target_balance: "1000000000" // 1000 tokens target
                },
                {
                    denom: "wbtc", // Wrapped Bitcoin
                    amount: "100000000000", // 1000 WBTC (8 decimals)
                    erc20_contract: "0x0312040979E0d6333F537A39b23a5DD6F574dBd8", // Deployed WBTC contract
                    decimals: 8,
                    target_balance: "100000000000" // 1000 tokens target
                },
                {
                    denom: "pepe", // Pepe Token
                    amount: "1000000000000000000000", // 1000 PEPE (18 decimals)
                    erc20_contract: "0xE43bdb38aF42C9D61a258ED1c0DE28c82f00BA61", // Deployed PEPE contract
                    decimals: 18,
                    target_balance: "1000000000000000000000" // 1000 tokens target
                },
                {
                    denom: "usdt", // Tether USD
                    amount: "1000000000", // 1000 USDT (6 decimals)
                    erc20_contract: "0x6ba2828b31Dff02B1424B1321B580C7F9D0FbC61", // Deployed USDT contract
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

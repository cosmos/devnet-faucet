# Cosmos EVM Faucet

A multi-token faucet for Cosmos EVM networks that supports both Cosmos and EVM address formats, with atomic token distribution and WATOM wrapping functionality.

## Features

- **Multi-Token Distribution**: Supports ERC20 tokens (WBTC, PEPE, USDT) via atomic transfers
- **Dual Address Support**: Works with both Cosmos (`cosmos1...`) and EVM (`0x...`) addresses  
- **Atomic Transfers**: All-or-nothing token distribution using custom AtomicMultiSend contract
- **WATOM Wrapping**: Built-in interface for wrapping/unwrapping native ATOM tokens
- **Approval-Based**: Uses ERC20 allowances instead of pre-funding contracts
- **Rate Limiting**: IP and address-based request limits
- **Transaction History**: Tracks and displays recent transactions

## Architecture

### Contracts
- **AtomicMultiSend**: Custom contract for reliable multi-token distribution
- **WERC20 Precompile**: Native wrapped ATOM token at `0x0000000000000000000000000000000000000802`

### Components
- **Backend**: Node.js Express server with CosmJS integration
- **Frontend**: Vue.js 3 SPA with Bootstrap UI
- **Database**: SQLite for request tracking

## Prerequisites

- Node.js v18+
- Foundry (for contract deployment)
- Access to Cosmos EVM RPC endpoints

## Deployment

### Automated Deployment (Recommended)

```bash
# 1. Set environment variable (private key derived automatically)
export MNEMONIC="your twelve word mnemonic phrase here"

# 2. Validate environment
npm run validate

# 3. Deploy (choose one)
npm run deploy         # Deploy only
npm run deploy:test    # Deploy + integration tests

# 4. Start faucet
npm start
```

### Vercel Deployment (Production)

For production deployment on Vercel:

1. **Set Environment Variable** in Vercel dashboard:
   - `MNEMONIC` = "your twelve word mnemonic phrase here"

2. **Deploy**: Connect GitHub repo to Vercel - auto-deploys on push

See [VERCEL-DEPLOYMENT.md](./VERCEL-DEPLOYMENT.md) for detailed instructions.

The automated deployment handles:
- Environment validation
- Clean build artifacts
- Contract compilation & deployment
- ABI extraction
- Configuration updates
- Token approvals
- Deployment verification
- Optional integration testing

### Manual Deployment (Legacy)

<details>
<summary>Click to expand manual steps</summary>

#### 1. Clean Environment
```bash
# Remove any existing compiled artifacts
rm -rf out cache broadcast deployments/*.json
forge clean
```

#### 2. Deploy AtomicMultiSend Contract
```bash
# Set environment variable (private key derived from mnemonic)
export MNEMONIC="your twelve word mnemonic phrase here"

# Deploy the contract
npm run deploy
```

#### 3. Extract Contract ABI
```bash
# Extract ABI from Foundry artifacts
npm run extract-abi
```

#### 4. Configure Application
Update `config.js` with the deployed contract address:
```javascript
contracts: {
    atomicMultiSend: "0x28B4f61f63fB60D7e1a6784fF52B2FB6F56D6ccA"
}
```

#### 5. Set Token Approvals
```bash
# Approve AtomicMultiSend to spend tokens on behalf of faucet wallet
npm run approve-tokens
```

#### 6. Install Dependencies
```bash
npm install
```

#### 7. Start Faucet
```bash
npm start
```

</details>

## Configuration

### Network Settings
```javascript
blockchain: {
    endpoints: {
        rpc_endpoint: "https://cevm-01-rpc.dev.skip.build",
        grpc_endpoint: "https://cevm-01-grpc.dev.skip.build", 
        rest_endpoint: "https://cevm-01-lcd.dev.skip.build",
        evm_endpoint: "https://cevm-01-evmrpc.dev.skip.build"
    },
    ids: {
        chainId: 262144,
        cosmosChainId: 'cosmos_262144-1'
    }
}
```

### Token Configuration
```javascript
tx: {
    amounts: [
        {
            denom: "wbtc",
            amount: "100000000000", // 1000 WBTC (8 decimals)
            erc20_contract: "0xC52cB914767C076919Dc4245D4B005c8865a2f1F",
            decimals: 8,
            target_balance: "100000000000"
        }
        // ... more tokens
    ]
}
```

## Operation

### Faucet Workflow
1. User enters Cosmos or EVM address
2. System checks current balances for all configured tokens
3. Calculates needed amounts to reach target balances
4. Executes atomic transfer via AtomicMultiSend contract
5. All transfers succeed or entire transaction reverts

### WATOM Operations
- **Wrap**: Send native ATOM to WERC20 precompile to receive WATOM ERC20 tokens
- **Unwrap**: Call withdraw on WERC20 precompile to convert WATOM back to native ATOM
- **Rate**: 1 ATOM = 1 WATOM (always)

### Rate Limiting
- 1 request per address per 24 hours
- 10 requests per IP per 24 hours

## Testing

### Test Token Distribution
```bash
# Test with a new address
curl "http://localhost:8088/send/0x56Ce23593fFFd265f9B002EAe4FeAd5935B00350"
```

### Verify Balances
```bash
# Check token balances were transferred correctly
node -e "
// Script to check token balances
// (implementation details in deployment log)
"
```

## Troubleshooting

### Common Issues

**Contract deployment fails**
- Ensure PRIVATE_KEY is set correctly
- Check RPC endpoint is accessible
- Verify sufficient native token balance for gas

**Token transfers fail**
- Confirm token approvals are set: `node scripts/approve-tokens.js`
- Check faucet wallet has sufficient token balances
- Verify contract address in config.js

**Native token transfers fail**
- Native token transfers to non-existent addresses will fail
- Use real wallet addresses for testing
- Consider disabling native tokens for testing ERC20-only functionality

**Frontend issues**
- WATOM functionality requires MetaMask
- Ensure correct network is selected in MetaMask
- Check browser console for connection errors

### Deployment Log Analysis

**✅ Successful Operations:**
- Contract compilation and deployment
- ERC20 token approvals (WBTC, PEPE, USDT)
- Multi-token atomic transfers
- Frontend tab integration
- WATOM wrapping UI implementation

**⚠️ Known Limitations:**
- Native token transfers require recipient addresses to be real accounts
- WATOM functionality needs user wallet connection
- Rate limiting resets every 24 hours

## Security Considerations

- Private keys are loaded from config but not exposed in logs
- Token approvals use large amounts (1M tokens) for operational efficiency
- AtomicMultiSend contract uses OpenZeppelin's Ownable and ReentrancyGuard
- Only faucet wallet can execute atomic transfers

## API Endpoints

- `GET /` - Frontend interface
- `GET /config.json` - Network and token configuration
- `GET /balance/cosmos` - Cosmos environment balances
- `GET /balance/evm` - EVM environment balances  
- `GET /send/:address` - Request tokens for address

## Contract Addresses

- **AtomicMultiSend**: `0x247CA16B2Fc5c9ae031e83c317c6DC6933Db7246`
- **WERC20 (WATOM)**: `0x0000000000000000000000000000000000000802`
- **WBTC**: `0xC52cB914767C076919Dc4245D4B005c8865a2f1F`
- **PEPE**: `0xD0C124828bF8648E8681d1eD3117f20Ab989e7a1`
- **USDT**: `0xf66bB908fa291EE1Fd78b09937b14700839E7c80`

## Credits

This faucet was built upon the excellent foundation provided by the **[Ping.pub](https://ping.pub)** team. Their original faucet implementation provided the core architecture and user interface that made this dual-environment Cosmos EVM faucet possible.

**Original Foundation**: [ping-pub/faucet](https://github.com/ping-pub/faucet)

## License

MIT
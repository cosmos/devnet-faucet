# Cosmos EVM Devnet Faucet

A dual-chain faucet system for distributing both Cosmos native tokens (ATOM) and ERC-20 tokens on the Cosmos EVM environment. Built for frequently-resetting devnets with flexible, centralized configuration management.

## Features

- **Dual Environment Support**: Cosmos SDK + EVM compatibility layer
- **Multi-Token Distribution**: Distributes ATOM, WBTC, PEPE, and USDT tokens
- **Centralized Configuration**: Network settings in `config.js`, token details in `tokens.json`
- **Secure Key Management**: Mnemonic-based address derivation with caching
- **Contract Validation**: Automatic validation and deployment on startup
- **Rate Limiting**: Per-address and per-IP limits with persistent storage
- **Modern UI**: Vue.js interface with MetaMask integration and transaction history

## Prerequisites

**Required Software:**
- Node.js >= 18.0.0
- Foundry (latest version)

**Installation:**
```bash
# Install Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Verify installations
node --version
forge --version
```

## Setup

### 1. Install Dependencies
```bash
git clone <repository-url>
cd devnet-faucet
npm install
```

### 2. Configure Environment Variables
```bash
cp .env.example .env
```

Edit `.env` - only mnemonic is required:
```bash
# Required: 12-word mnemonic phrase for address derivation
MNEMONIC="your twelve word mnemonic phrase here"

# Optional: Override network endpoints (defaults in config.js)
# RPC_URL="https://your-custom-rpc.example.com"
```

### 3. Network Configuration

**Primary Configuration**: Edit `config.js` for network settings:
```javascript
blockchain: {
    name: "cosmos-evm-chain",
    ids: {
        chainId: 4231,              // EVM chain ID (current: devnet-1)
        cosmosChainId: '4321',      // Cosmos chain ID
    },
    endpoints: {
        rpc_endpoint: "https://devnet-1-rpc.ib.skip.build",
        rest_endpoint: "https://devnet-1-lcd.ib.skip.build", 
        evm_endpoint: "https://devnet-1-evmrpc.ib.skip.build",
        evm_explorer: "https://evm-devnet-1.cloud.blockscout.com",
    }
}
```

**Token Configuration**: `tokens.json` contains comprehensive token metadata:
- Contract addresses and deployment info
- Faucet distribution amounts and limits
- Token features (mintable, burnable, etc.)
- Governance roles and permissions
- UI metadata (logos, descriptions, categories)

## Deployment

### Automated (Recommended)
```bash
# Complete deployment pipeline
npm run deploy     # Deploy contracts, set approvals, validate
npm start          # Start faucet server
```

This will:
1. Validate environment and dependencies
2. Deploy ERC-20 tokens from `tokens.json` configuration
3. Deploy AtomicMultiSend contract for batch transfers
4. Set token approvals for the faucet wallet
5. Verify all contracts are accessible
6. Update configuration files with deployed addresses

### Manual Steps
```bash
npm run validate                    # Environment validation
forge build                        # Compile Solidity contracts
node scripts/deploy-token-registry.js  # Deploy tokens
node scripts/automated-deploy.js   # Deploy & configure system
```

### Custom Token Deployment

To add new tokens, edit `tokens.json`:
```json
{
  "tokens": [
    {
      "symbol": "NEWTOKEN",
      "name": "New Token",
      "decimals": 18,
      "faucet": {
        "enabled": true,
        "configuration": {
          "amountPerRequest": "1000000000000000000000",
          "targetBalance": "1000000000000000000000"
        }
      }
    }
  ]
}
```

## Architecture

### Configuration System
- **`config.js`**: Central authority for network parameters (chain IDs, RPC endpoints, gas settings)
- **`tokens.json`**: Token-specific configuration (contracts, amounts, metadata)
- **`TokenConfigLoader`**: Bridges configuration files and validates consistency

### Contract System
- **AtomicMultiSend**: Batch ERC-20 token distribution contract
- **ERC-20 Tokens**: Auto-generated from `tokens.json` with custom features
- **ContractValidator**: Validates contract addresses on startup

### Key Management
- **SecureKeyManager**: Derives addresses from mnemonic with caching
- **Address Validation**: Ensures consistency between deployments
- **Multi-Environment**: Same private key for both Cosmos and EVM

## API Reference

### Endpoints
- `GET /` - Web interface with Vue.js frontend
- `GET /send/:address` - Request tokens (accepts Cosmos or EVM addresses)
- `GET /config.json` - Network configuration for frontend
- `GET /balance/cosmos` - Cosmos token balances
- `GET /balance/evm` - EVM token balances

### Address Formats
- **Cosmos**: `cosmos1...` (bech32 format)
- **EVM**: `0x...` (40 hex characters)

### Rate Limiting
- **Per Address**: 1 request per 24 hours
- **Per IP**: 10 requests per 24 hours  
- **Database**: SQLite at `.faucet/history.db`

## Token Distribution

### Current Tokens (Devnet-1)
| Token | Symbol | Decimals | Amount/Request | Contract |
|-------|---------|-----------|----------------|----------|
| Wrapped Bitcoin | WBTC | 8 | 1,000 | `0xB259846bb...` |
| Pepe Token | PEPE | 18 | 1,000 | `0xe2D7606B6...` |
| Tether USD | USDT | 6 | 1,000 | `0x21065d53D...` |
| Cosmos Atom | ATOM | 6 | 1 | Native transfer |

### Distribution Process
1. **Address Type Detection**: Automatically detects Cosmos vs EVM format
2. **EVM Distribution**: Uses AtomicMultiSend for batch ERC-20 transfers
3. **Cosmos Distribution**: Direct bank send for native ATOM
4. **Transaction Tracking**: Full transaction history with explorer links

## Production Deployment

### Vercel Configuration
```bash
# Environment Variables
MNEMONIC=<mnemonic_phrase>
NODE_ENV=production

# Optional overrides
RPC_URL=<custom_rpc_endpoint>
```

### Server Requirements
- Node.js 18+ runtime
- Persistent storage for rate limiting database
- Funded faucet wallet (native tokens for gas + ERC-20 tokens)

## Monitoring & Maintenance

### Health Checks
```bash
# Validate all systems
npm run validate

# Check contract addresses
node scripts/validate-contracts.js

# View faucet balances
curl localhost:8088/balance/evm
```

### Required Monitoring
- **Faucet Balances**: Monitor token levels for distribution
- **Gas Balance**: Ensure native tokens for transaction fees
- **RPC Connectivity**: Validate endpoint accessibility
- **Contract Validity**: Verify contracts after network resets

### Devnet Reset Recovery
Since devnets reset frequently:
1. Update network endpoints in `config.js` if changed
2. Run `npm run deploy` to redeploy contracts
3. Update `tokens.json` with new contract addresses
4. Restart faucet service

## Troubleshooting

### Common Issues

**Contract Validation Failed**
```bash
# Redeploy contracts
npm run deploy

# Or manually validate
node scripts/validate-contracts.js --interactive
```

**Address Derivation Mismatch**
```bash
# Verify mnemonic is correct
echo $MNEMONIC

# Clear cached addresses (forces re-derivation)
rm -rf .faucet/cached-addresses.json
```

**Token Transfer Failures**
```bash
# Check approvals
node scripts/approve-tokens.js

# Verify faucet has tokens
curl localhost:8088/balance/evm
```

**Network Connection Issues**
- Verify RPC endpoints in `config.js`
- Check if devnet has reset
- Validate chain IDs match network

### Log Analysis
- **Server logs**: Console output with sanitized sensitive data
- **Transaction history**: Stored in browser localStorage
- **Rate limiting**: SQLite database in `.faucet/history.db`

## Development

### File Structure
```
├── config.js                 # Central network configuration
├── tokens.json               # Token definitions and metadata
├── faucet.js                 # Main server application
├── src/
│   ├── TokenConfigLoader.js  # Configuration bridge
│   ├── SecureKeyManager.js   # Key derivation and caching
│   ├── ContractValidator.js  # Contract validation
│   └── tokens/               # Generated token contracts
├── scripts/
│   ├── automated-deploy.js   # Full deployment pipeline
│   ├── deploy-token-registry.js # Token deployment
│   └── validate-*.js         # Validation utilities
└── views/
    └── index.ejs             # Vue.js frontend
```

### Adding Features
1. **New Tokens**: Add to `tokens.json` with full metadata
2. **Network Support**: Update endpoints in `config.js`
3. **UI Changes**: Modify `views/index.ejs` Vue components
4. **Validation**: Add checks to `ContractValidator.js`
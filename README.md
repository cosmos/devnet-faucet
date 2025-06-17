# Cosmos EVM Faucet - Setup & Operations

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
cd cdev-faucet
npm install
```

### 2. Configure Environment Variables
```bash
cp .env.example .env
```

Edit `.env`:
```bash
# Required
MNEMONIC="your twelve word mnemonic phrase here"

# Contract addresses (set after deployment)
ATOMIC_MULTISEND_CONTRACT="0x..."
WBTC_CONTRACT="0x..."
PEPE_CONTRACT="0x..."
USDT_CONTRACT="0x..."
```

### 3. Network Configuration
Edit `config.js`:
```javascript
blockchain: {
    ids: {
        chainId: 262144,
        cosmosChainId: 'cosmos_262144-1',
    },
    endpoints: {
        rpc_endpoint: "https://cevm-01-rpc.dev.skip.build",
        grpc_endpoint: "https://cevm-01-grpc.dev.skip.build", 
        rest_endpoint: "https://cevm-01-lcd.dev.skip.build",
        evm_endpoint: "https://cevm-01-evmrpc.dev.skip.build",
        evm_websocket: "wss://cevm-01-evmws.dev.skip.build",
    }
}
```

## Deployment

### Automated (Recommended)
```bash
npm run deploy  # Deploy contracts and configure system
npm start       # Start faucet server
```

### Manual Steps
```bash
npm run validate              # Validate environment
forge build                   # Compile contracts
npm run approve-tokens        # Set token approvals
```

## Token Configuration

**Current Tokens:**
| Token | Symbol | Decimals | Target Balance |
|-------|---------|-----------|----------------|
| Wrapped Bitcoin | WBTC | 8 | 1,000 |
| Pepe Token | PEPE | 18 | 1,000 |
| Tether USD | USDT | 6 | 1,000 |

**Adding Tokens:**
1. Create contract in `src/tokens/`
2. Add to `script/DeployAll.s.sol`
3. Update `config.js` amounts array
4. Add environment variable

## Operations

### Server Startup
1. Derives addresses from mnemonic
2. Validates cached addresses
3. Connects to contracts
4. Initializes rate limiting database

### API Endpoints
- `GET /` - Web interface
- `GET /send/:address` - Request tokens (Cosmos or EVM address)
- `GET /config.json` - Network configuration
- `GET /balance/:type` - Balance queries

### Rate Limiting
- 1 request per address per 24 hours
- 10 requests per IP per 24 hours
- Database: `.faucet/history.db`

## Production Deployment

### Vercel
1. Connect repository to Vercel
2. Set environment variables:
   ```
   MNEMONIC=<mnemonic_phrase>
   ATOMIC_MULTISEND_CONTRACT=0x...
   WBTC_CONTRACT=0x...
   PEPE_CONTRACT=0x...
   USDT_CONTRACT=0x...
   NODE_ENV=production
   ```
3. Deploy

## Troubleshooting

### Deployment Issues
```bash
npm run validate                    # Check environment
export MNEMONIC="valid phrase"      # Set mnemonic
forge install && forge build       # Rebuild contracts
```

### Runtime Issues
- **Address Validation Failed**: Mnemonic changed since deployment
- **Contract Not Found**: Update environment variables
- **RPC Connection**: Verify endpoint URLs
- **Gas Issues**: Fund faucet wallet with native tokens

### Token Transfer Issues
- **Insufficient Allowance**: Run `npm run approve-tokens`
- **Insufficient Balance**: Fund faucet wallet
- **Network Issues**: Check RPC connectivity

## Monitoring

**Required Checks:**
- Faucet token balances
- RPC endpoint connectivity
- Rate limit database size
- Log files for errors

**Log Locations:**
- Server logs: console output
- Rate limiting: `.faucet/history.db`
- All sensitive data sanitized from logs
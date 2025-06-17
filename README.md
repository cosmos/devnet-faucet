# Cosmos EVM Faucet - Technical Setup & Operations Guide

A production-ready, automated multi-token faucet for Cosmos EVM networks with secure key management, dual address support, and fully automated deployment pipeline.

## Prerequisites & Dependencies

### Required Software
- **Node.js** >= 18.0.0
- **Foundry** (latest version)
- **Git** for repository management

### Installation Commands
```bash
# Install Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Verify installations
node --version
forge --version
```

## Environment Setup

### 1. Clone and Install Dependencies
```bash
git clone <repository-url>
cd cdev-faucet
npm install
```

### 2. Configure Environment Variables
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```bash
# CRITICAL: Set mnemonic as environment variable, never commit to git
export MNEMONIC="your twelve word mnemonic phrase here"

# Contract addresses (auto-populated during deployment)
ATOMIC_MULTISEND_CONTRACT="0x..."
WBTC_CONTRACT="0x..."
PEPE_CONTRACT="0x..."
USDT_CONTRACT="0x..."
```

### 3. Network Configuration
Edit `config.js` for your target network:
```javascript
blockchain: {
    ids: {
        chainId: 262144,                    // EVM chain ID
        cosmosChainId: 'cosmos_262144-1',   // Cosmos chain ID
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

## Automated Deployment Process

### Quick Deployment (Recommended)
```bash
# Complete automated deployment
npm run deploy

# Start faucet server
npm start
```

### Deployment Pipeline Overview
The automated deployment script (`scripts/automated-deploy.js`) executes:

1. **Environment Validation**
   - Verifies Node.js and Foundry versions
   - Tests RPC connectivity
   - Validates mnemonic format

2. **Secure Key Derivation**
   - Derives EVM and Cosmos addresses using eth_secp256k1
   - Caches addresses in config (public keys only)
   - Never writes private keys to disk

3. **Contract Compilation & Deployment**
   - Uses pure Foundry workflow (optimized for minimal dependencies)
   - Deploys ERC20 tokens with faucet as initial owner
   - Deploys AtomicMultiSend contract for atomic transfers

4. **Configuration Updates**
   - Updates config.js with deployed contract addresses
   - Sets appropriate token approvals
   - Generates deployment report

### Manual Deployment Steps (if needed)
```bash
# Validate environment only
npm run validate

# Compile contracts only
forge build

# Deploy tokens with Foundry
forge script script/DeployAll.s.sol --rpc-url $RPC_URL --broadcast

# Set token approvals
npm run approve-tokens
```

## Token Configuration System

### Current Token Setup
The faucet deploys three ERC20 tokens with the following configuration:

| Token | Symbol | Decimals | Initial Supply | Target Balance |
|-------|---------|-----------|---------------|----------------|
| Wrapped Bitcoin | WBTC | 8 | 1,000,000 | 1,000 |
| Pepe Token | PEPE | 18 | 100,000,000 | 1,000 |
| Tether USD | USDT | 6 | 1,000,000 | 1,000 |

### Adding/Modifying Tokens
1. Create new token contract in `src/tokens/`
2. Add to deployment script in `script/DeployAll.s.sol`
3. Update `config.js` amounts array
4. Add environment variable for contract address

Example token configuration:
```javascript
{
    denom: "newtoken",
    amount: "1000000000000000000000", // 1000 tokens (18 decimals)
    erc20_contract: process.env.NEWTOKEN_CONTRACT,
    decimals: 18,
    target_balance: "1000000000000000000000"
}
```

## Security Implementation

### Key Management
- **Mnemonic Security**: Never stored in files, only environment variables
- **Key Derivation**: Uses standard eth_secp256k1 path `m/44'/60'/0'/0/0`
- **Runtime Security**: Private keys exist only in memory during operation
- **Address Validation**: Startup validation ensures derived addresses match cached values

### Contract Security
- **ReentrancyGuard**: Protects against reentrancy attacks
- **Atomic Transfers**: All token transfers are atomic (all succeed or all fail)
- **Access Controls**: Faucet wallet owns all deployed tokens
- **Rate Limiting**: IP and address-based limits prevent abuse

## Foundry Optimization

### Minimal Dependencies
The project uses an optimized Foundry setup that:
- Only includes required OpenZeppelin contracts
- Uses pure Foundry workflow (no Hardhat/Node.js mixing)
- Optimized compilation settings for production
- Minimal library dependencies stored in git

### Build Configuration (`foundry.toml`)
```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
remappings = [
    "@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/",
    "forge-std/=lib/forge-std/src/",
]
optimizer = true
optimizer_runs = 200
```

## Operation & Monitoring

### Startup Process
1. **Secure Key Initialization**: Derives addresses from mnemonic
2. **Address Validation**: Compares derived vs cached addresses
3. **Contract Connection**: Validates contract addresses and connectivity
4. **Rate Limit Database**: Initializes SQLite database for request tracking

### API Endpoints
- `GET /` - Web interface for manual token requests
- `GET /send/:address` - Programmatic token request (Cosmos or EVM address)
- `GET /config.json` - Network configuration for wallet setup
- `GET /balance/:type` - Balance queries for monitoring

### Smart Distribution Logic
1. Query recipient's current token balances
2. Calculate needed amounts to reach target balances
3. Execute atomic multi-token transfer for only needed amounts
4. Skip tokens where recipient already has sufficient balance

### Rate Limiting
- **Per Address**: 1 request per 24 hours
- **Per IP**: 10 requests per 24 hours
- **Database**: SQLite stored in `.faucet/history.db`

## Production Deployment

### Vercel Deployment
1. Connect repository to Vercel
2. Set environment variables in Vercel dashboard:
   ```
   MNEMONIC=<your_mnemonic_phrase>
   ATOMIC_MULTISEND_CONTRACT=0x...
   WBTC_CONTRACT=0x...
   PEPE_CONTRACT=0x...
   USDT_CONTRACT=0x...
   ```
3. Deploy using `vercel.json` configuration

### Environment Variables for Production
```bash
# Required
MNEMONIC="twelve word mnemonic phrase"

# Contract addresses (set after deployment)
ATOMIC_MULTISEND_CONTRACT="0x..."
WBTC_CONTRACT="0x..."
PEPE_CONTRACT="0x..."
USDT_CONTRACT="0x..."

# Optional
NODE_ENV=production
PORT=8088
```

## Troubleshooting

### Common Issues

#### Deployment Failures
```bash
# Check environment
npm run validate

# Common fixes
export MNEMONIC="valid twelve word phrase"
forge install
forge build
```

#### Runtime Issues
- **Address Validation Failed**: Mnemonic changed since deployment
- **Contract Not Found**: Update contract addresses in environment variables
- **RPC Connection**: Verify endpoint URLs and network connectivity
- **Gas Estimation**: Ensure faucet wallet has native tokens for gas

#### Token Transfer Failures
- **Insufficient Allowance**: Run `npm run approve-tokens`
- **Insufficient Balance**: Fund faucet wallet with tokens
- **Network Issues**: Check RPC endpoint connectivity

### Monitoring & Maintenance
- **Log Monitoring**: All sensitive data is sanitized from logs
- **Balance Monitoring**: Regularly check faucet token balances
- **Rate Limit Database**: Stored in `.faucet/history.db`, auto-resets
- **Address Derivation**: Validate cached addresses on startup

## File Structure
```
├── config.js                     # Main configuration with environment variables
├── faucet.js                     # Main server with secure key management
├── src/
│   ├── SecureKeyManager.js       # Secure key derivation and management
│   ├── tokens/                   # ERC20 token contracts
│   └── AtomicMultiSend.sol       # Multi-token transfer contract
├── scripts/
│   ├── automated-deploy.js       # Complete deployment automation
│   ├── derive-and-cache-addresses.js  # Address derivation utility
│   └── deployment/               # Foundry deployment modules
├── script/                       # Foundry deployment scripts
├── views/                        # Web interface templates
├── .env.example                  # Environment variable template
└── deployments/                  # Contract ABIs and deployment records
```

## License
MIT
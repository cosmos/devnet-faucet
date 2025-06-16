# Cosmos EVM Faucet

Automated multi-token faucet for Cosmos EVM networks with dual address support and configurable deployment.

## Quick Start

```bash
# Set environment
export MNEMONIC="your twelve word mnemonic phrase here"

# Deploy everything
yarn deploy

# Start faucet
yarn start
```

## Required Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MNEMONIC` | Yes | 12-word mnemonic phrase for wallet derivation |

### Network Configuration

Edit `config.js` before deployment:

```javascript
blockchain: {
    name: "cosmos-evm-chain",
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

## Token Configuration

### Adding/Removing Tokens

Edit the `tx.amounts` array in `config.js`:

```javascript
tx: {
    amounts: [
        {
            denom: "wbtc",                    // Token identifier
            amount: "100000000000",           // Amount to send (in smallest unit)
            decimals: 8,                      // Token decimals
            target_balance: "100000000000"    // Target balance for smart distribution
        }
    ]
}
```

### Token Contract Parameters

Before deployment, edit token contracts in `src/tokens/`:

```solidity
// src/tokens/WBTC.sol
constructor(address initialOwner) 
    ERC20("Wrapped Bitcoin", "WBTC")  // Name and symbol
    Ownable()
{
    _mint(initialOwner, 100000000000000);  // Initial supply to faucet
}
```

**Configurable Parameters:**
- Token name and symbol
- Initial supply minted to faucet
- Decimals (inherited from ERC20 standard: 18 for most, 8 for WBTC, 6 for USDT)

## Automated Deployment

The deployment script handles:

1. **Environment Validation** - Checks Node.js, Foundry, RPC connectivity, MNEMONIC
2. **Address Derivation** - Generates EVM and Cosmos addresses from mnemonic
3. **Contract Compilation** - Builds all Solidity contracts with Foundry
4. **Token Deployment** - Deploys ERC20 tokens with dynamic faucet address
5. **AtomicMultiSend Deployment** - Deploys multi-token transfer contract
6. **Configuration Update** - Updates config.js with contract addresses
7. **Token Approvals** - Approves AtomicMultiSend to spend faucet tokens

### Deployment Commands

```bash
# Validate environment only
yarn validate

# Deploy without tests
yarn deploy

# Deploy with integration tests
yarn deploy:test
```

### Manual Steps (if needed)

```bash
# Compile contracts only
node scripts/deployment/deploy-tokens-foundry.js compile

# Deploy contracts only
node scripts/deployment/deploy-tokens-foundry.js deploy

# Set token approvals
yarn approve-tokens
```

## Faucet Configuration

### Rate Limiting

```javascript
limit: {
    address: 1,    // Requests per address per 24h
    ip: 10         // Requests per IP per 24h
}
```

### Port and Database

```javascript
port: 8088,
db: {
    path: ".faucet/history.db"  // SQLite database path
}
```

### Branding

```javascript
project: {
    name: "Cosmos-EVM Devnet Faucet",
    logo: "https://example.com/logo.svg",
    deployer: `<a href="https://cosmos.network">Cosmos Network</a>`
}
```

## Deployment Architecture

### Automatic Address Management

- **Wallet Derivation**: Faucet wallet derived from MNEMONIC using path `m/44'/60'/0'/0/0`
- **Dual Addresses**: Same private key generates both EVM (`0x...`) and Cosmos (`cosmos...`) addresses
- **Dynamic Deployment**: All contracts receive faucet address as constructor parameter

### Contract Dependencies

- **OpenZeppelin v4.9.3**: ERC20, Ownable, AccessControl, ReentrancyGuard
- **Foundry**: Contract compilation and deployment
- **AtomicMultiSend**: Custom contract for reliable multi-token distribution

### File Structure

```
├── config.js                 # Main configuration
├── src/
│   ├── tokens/               # ERC20 token contracts
│   └── AtomicMultiSend.sol   # Multi-token transfer contract
├── scripts/
│   ├── automated-deploy.js   # Main deployment script
│   └── deployment/           # Individual deployment modules
└── deployments/              # Deployment artifacts and ABIs
```

## Operation

### Smart Distribution

The faucet checks recipient balances and only sends tokens needed to reach target amounts:

1. Query current balances for all configured tokens
2. Calculate shortfall for each token vs target balance
3. Execute atomic transfer for only needed amounts
4. Skip tokens that already meet target balance

### API Endpoints

- `GET /` - Web interface
- `GET /send/:address` - Request tokens (Cosmos or EVM address)
- `GET /config.json` - Network configuration
- `GET /balance/:type` - Balance information

### Response Format

```json
{
  "result": {
    "message": "Tokens sent successfully",
    "current_balances": [...],
    "tokens_sent": [...],
    "transactions": [...]
  }
}
```

## Troubleshooting

### Environment Issues

```bash
# Check prerequisites
yarn validate

# Common fixes
export MNEMONIC="your mnemonic here"
forge --version
node --version
```

### Deployment Failures

- **Contract compilation**: Check OpenZeppelin dependencies in `lib/`
- **Gas estimation**: Ensure faucet wallet has native tokens for gas
- **RPC connectivity**: Verify endpoint URLs in config.js
- **Address derivation**: Confirm MNEMONIC is valid 12-word phrase

### Runtime Issues

- **Token transfers fail**: Check token approvals and faucet balances
- **Rate limiting**: Database in `.faucet/history.db`, resets every 24h
- **Frontend errors**: Ensure MetaMask connected to correct network

## Production Deployment

### Vercel Configuration

1. Set `MNEMONIC` environment variable in Vercel dashboard
2. Push to connected GitHub repository
3. Vercel auto-deploys using `vercel.json` configuration

### Security Considerations

- MNEMONIC stored as environment variable (not in code)
- Private keys derived at runtime, never logged
- Rate limiting prevents abuse
- AtomicMultiSend contract uses ReentrancyGuard
- Token approvals use reasonable amounts

## License

MIT
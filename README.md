# Cosmos EVM Dual Environment Faucet

Faucet system for Cosmos EVM networks. Supports both Cosmos and EVM wallets enabling seamless dual-environment token distribution and testing.

## Overview

Faucet with support for both Cosmos and Ethereum Virtual Machine (EVM) wallets on Cosmos EVM chains.
Request tokens using either:
- **Cosmos addresses** (bech32 format): `cosmos1...`
- **EVM addresses** (hex format): `0x...`

The faucet will determine which type of transaction to use based on the address type given.

## Features

- Full support across both environments
- Detects and validates wallet addresses
- Automatic token registration through ERC20 precompile
- Parameterized token deployment system with detailed reporting
- Displays network information and endpoints

## Network Configuration

### Cosmos EVM Testnet
- **Chain ID**: `cosmos_262144-1` (Cosmos) / `262144` (EVM)
- **RPC Endpoints**:
  - *Cosmos*: `https://cevm-01-rpc.dev.skip.build`
  - *EVM*: `https://cevm-01-evmrpc.dev.skip.build`
- **REST API**: `https://cevm-01-lcd.dev.skip.build`
- **WebSocket**: `wss://cevm-01-evmws.dev.skip.build`

### Faucet Wallet
- **EVM**: `0x42e6047c5780b103e52265f6483c2d0113aa6b87`
- **Cosmos**: `cosmos1gtnqglzhszcs8efzvhmys0pdqyf656u8wmfcuz`

## Supported Tokens

The faucet distributes the following test tokens:

| Token | Name | Symbol | Decimals | Initial Supply |
|-------|------|--------|----------|----------------|
| WBTC | Wrapped Bitcoin | WBTC | 8 | 1,000,000,000 |
| PEPE | Pepe Token | PEPE | 18 | 1,000,000,000 |
| USDT | Tether USD | USDT | 6 | 1,000,000,000 |

## Quick Start

### Prerequisites
- Node.js 18+
- Foundry (for contract deployment)
- Sufficient *ETH* (ATOM) balance for gas fees

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd faucet

# Install dependencies
yarn install

# Start the faucet server
yarn start
```

The faucet will be available at `http://localhost:3000`

### Configuration

Update `config.js` with your network settings:

```javascript
export default {
  project: {
    name: "Cosmos EVM Dual Environment Faucet",
    deployer: "Your Organization"
  },
  chains: {
    // ... chain configurations
  }
}
```

## Deployment Scripts

The project includes modernized deployment scripts with comprehensive reporting:

### Deploy Tokens

```bash
# Preview token configurations
node scripts/deploy-foundry.js

# Deploy all tokens (requires compiled contracts)
node scripts/deploy-foundry.js deploy
```

### Register ERC20 Tokens

```bash
# Check registration status
node scripts/register-erc20-tokens.js check

# Register all tokens with ERC20 precompile
node scripts/register-erc20-tokens.js register all

# Register specific token
node scripts/register-erc20-tokens.js register WBTC
```

### Deployment Reports

Deployment script generates summary reports in `./deployments/`:
- `deployment-TIMESTAMP.json` - Full details
- `latest.json` - Latest deployment details
- `addresses.json` - Deployed contract addresses for quick reference

## Development

### Project Structure

```
├── contracts/          # Smart contract source files
├── scripts/            # Deployment and utility scripts
├── deployments/        # Deployment reports and artifacts
├── views/              # Frontend templates
├── src/                # Foundry contract sources
├── test/               # Contract tests
├── config.js           # Faucet configuration
├── faucet.js           # Main faucet server
└── README.md           # You're reading it
```

### Contract Deployment

```bash
# Compile contracts
forge build

# Run tests
forge test

# Deploy contracts
node scripts/deploy-foundry.js deploy
```

### Adding New Tokens

1. **Update Token Configuration** in `scripts/deploy-foundry.js`:
   ```javascript
   MYNEWTOKEN: {
       name: 'My New Token',
       symbol: 'MNT',
       decimals: 18,
       initialSupply: '1000000000',
       mintTo: CONFIG.DEPLOYER.address,
       description: 'Custom token for testing'
   }
   ```

2. **Create Contract** in `src/tokens/` directory

3. **Deploy**: `node scripts/deploy-foundry.js deploy`

4. **Register**: `node scripts/register-erc20-tokens.js register MYNEWTOKEN`

## API Endpoints

### Faucet Endpoints
- `GET /` - Faucet web interface
- `GET /send/:address` - Request tokens for address
- `GET /balance/cosmos` - Get Cosmos environment balances
- `GET /balance/evm` - Get EVM environment balances
- `GET /config.json` - Get faucet configuration

### Address Support
Both bech32 and hex addresses supported:
- **Cosmos**: `cosmos1gtnqglzhszcs8efzvhmys0pdqyf656u8wmfcuz`
- **EVM**: `0x42e6047c5780b103e52265f6483c2d0113aa6b87`

## Token Conversion

After ERC20 registration, tokens can be converted between environments:

```bash
# Convert ERC20 to Cosmos coin
cosmos-evmd tx erc20 convert-erc20 <token-address> <amount> \
  --from <key> --chain-id cosmos_262144-1

# Convert Cosmos coin to ERC20
cosmos-evmd tx erc20 convert-coin <amount><denom> \
  --from <key> --chain-id cosmos_262144-1
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## Credits

This faucet was built upon the excellent foundation provided by the **[Ping.pub](https://ping.pub)** team. Their original faucet implementation provided the core architecture and user interface that made this dual-environment Cosmos EVM faucet possible.

**Original Foundation**: [ping-pub/faucet](https://github.com/ping-pub/faucet)

Special thanks to the Ping.pub team for:
- The initial faucet server implementation
- The responsive web interface design
- The configuration management system
- The foundational codebase that enabled this Cosmos EVM adaptation

## License

This project maintains the same MIT license as the original Ping.pub faucet. See the [LICENCE](./LICENCE) file for details.

## Support

For issues and questions:
- Check the [scripts/README.md](./scripts/README.md) for deployment documentation
- Review existing deployment reports in `./deployments/`
- Open an issue for bugs or feature requests

---

**Cosmos EVM Dual Environment Faucet** - Bridging Cosmos and Ethereum ecosystems with seamless token distribution.
>>>>>>> cosmos-evm

# Cosmos EVM Token Deployment Scripts

This directory contains modernized deployment scripts for the Cosmos EVM faucet project.

## Overview

The scripts have been consolidated and updated to use Ethers.js v6 with comprehensive reporting and parameterized configurations.

## Scripts

### 1. `deploy-foundry.js` - Main Deployment Script
Modern, parameterized token deployment with comprehensive reporting.

**Features:**
- Ethers.js v6 compatibility
- Parameterized token configurations
- Comprehensive deployment reporting
- Transaction tracking with block numbers
- Automatic deployment logging
- Support for arbitrary token configurations

**Usage:**
```bash
# Preview configurations
node scripts/deploy-foundry.js

# Actual deployment (requires compiled contracts)
node scripts/deploy-foundry.js deploy
```

### 2. `register-erc20-tokens.js` - Token Registration
Registers deployed ERC20 tokens with the Cosmos EVM precompile for dual-environment functionality.

**Usage:**
```bash
# Check registration status
node scripts/register-erc20-tokens.js check

# Register all tokens
node scripts/register-erc20-tokens.js register all

# Register specific token
node scripts/register-erc20-tokens.js register WBTC
```

### 3. `deploy.js` - Hardhat Integration (Legacy)
Updated for Ethers v6 but primarily for reference.

## Token Configurations

All token configurations are centralized and easily modifiable:

```javascript
const TOKEN_CONFIGS = {
    WBTC: {
        name: 'Wrapped Bitcoin',
        symbol: 'WBTC',
        decimals: 8,
        initialSupply: '1000000000', // 1 billion
        mintTo: CONFIG.DEPLOYER.address,
        description: 'Wrapped Bitcoin for Cosmos EVM'
    },
    PEPE: {
        name: 'Pepe Token',
        symbol: 'PEPE',
        decimals: 18,
        initialSupply: '1000000000',
        mintTo: CONFIG.DEPLOYER.address,
        description: 'Pepe meme token for Cosmos EVM'
    },
    USDT: {
        name: 'Tether USD',
        symbol: 'USDT',
        decimals: 6,
        initialSupply: '1000000000',
        mintTo: CONFIG.DEPLOYER.address,
        description: 'USDT stablecoin for Cosmos EVM'
    }
};
```

## Deployment Process

### Prerequisites
1. **Foundry installed**: `curl -L https://foundry.paradigm.xyz | bash`
2. **Node.js dependencies**: `npm install`
3. **Sufficient ETH balance** for gas fees
4. **Contract source files** in appropriate directories

### Complete Deployment Workflow

1. **Compile Contracts** (if using Foundry):
   ```bash
   forge build
   ```

2. **Deploy Tokens**:
   ```bash
   node scripts/deploy-foundry.js deploy
   ```

3. **Register with ERC20 Precompile**:
   ```bash
   node scripts/register-erc20-tokens.js register all
   ```

4. **Update Faucet Configuration** with new addresses

## Deployment Reports

Each deployment generates comprehensive reports saved to `./deployments/`:

- `deployment-TIMESTAMP.json` - Full deployment report
- `latest.json` - Latest deployment (symlink)
- `addresses.json` - Contract addresses only (for easy import)

### Report Structure
```json
{
  "network": "cosmos_evm",
  "chainId": 262144,
  "timestamp": "2024-01-01T00:00:00.000Z",
  "deployer": "0x42e6047c5780b103e52265f6483c2d0113aa6b87",
  "deployments": {
    "WBTC": {
      "contractName": "WBTC",
      "name": "Wrapped Bitcoin",
      "symbol": "WBTC",
      "decimals": 8,
      "totalSupply": "100000000000000000",
      "totalSupplyFormatted": "1000000000.0",
      "contractAddress": "0x...",
      "deploymentTx": "0x...",
      "blockNumber": 123456,
      "gasUsed": "500000",
      "timestamp": "2024-01-01T00:00:00.000Z",
      "status": "deployed"
    }
  },
  "totalGasUsed": "2000000"
}
```

## Network Configuration

### Cosmos EVM Testnet
- **Chain ID**: 262144 (0x40000)
- **RPC URL**: https://cevm-01-evmrpc.dev.skip.build
- **REST URL**: https://cevm-01-lcd.dev.skip.build
- **WebSocket**: wss://cevm-01-evmws.dev.skip.build

### Faucet Address
- **EVM**: 0x42e6047c5780b103e52265f6483c2d0113aa6b87
- **Cosmos**: cosmos1gtnqglzhszcs8efzvhmys0pdqyf656u8wmfcuz

## Customization

### Adding New Tokens

1. **Add to TOKEN_CONFIGS**:
   ```javascript
   MYNEWTOKEN: {
       name: 'My New Token',
       symbol: 'MNT',
       decimals: 18,
       initialSupply: '1000000',
       mintTo: CONFIG.DEPLOYER.address,
       description: 'Custom token for testing'
   }
   ```

2. **Create Contract** in `src/` directory
3. **Deploy**: `node scripts/deploy-foundry.js deploy`
4. **Register**: `node scripts/register-erc20-tokens.js register MYNEWTOKEN`

### Modifying Supply/Decimals

Simply update the configuration object - no code changes needed:

```javascript
WBTC: {
    // ... other config
    decimals: 8,                    // Modify decimals
    initialSupply: '2000000000',    // Modify supply
    mintTo: 'custom_address',       // Modify mint destination
}
```

## Error Handling

All scripts include comprehensive error handling and logging:

- **Connection issues**: Automatic network verification
- **Insufficient balance**: Balance checks before deployment
- **Compilation errors**: Clear error messages with resolution steps
- **Transaction failures**: Detailed transaction and gas information

## Future Enhancements

- **Multi-network support**: Easy configuration for additional networks
- **Batch operations**: Deploy multiple token sets simultaneously
- **Verification integration**: Automatic contract verification
- **Governance integration**: Automatic proposal creation for registrations

## Troubleshooting

### Common Issues

1. **"Insufficient balance"**: Fund the deployer address with ETH
2. **"Chain ID mismatch"**: Verify RPC URL and network configuration
3. **"Artifact not found"**: Run `forge build` to compile contracts
4. **"Registration failed"**: Ensure tokens are deployed and accessible

### Debug Mode

Enable detailed logging by setting environment variable:
```bash
DEBUG=1 node scripts/deploy-foundry.js deploy
```

---

For more information, see the main project README or contact the development team.
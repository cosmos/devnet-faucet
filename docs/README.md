# Cosmos EVM Faucet

A comprehensive smart faucet system that supports both Cosmos and EVM environments on the same blockchain, featuring intelligent token distribution, balance checking, and upgradeable smart contracts.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Key Concepts](#key-concepts)
4. [Smart Contracts](#smart-contracts)
5. [Frontend Implementation](#frontend-implementation)
6. [Backend Implementation](#backend-implementation)
7. [Deployment Guide](#deployment-guide)
8. [Configuration](#configuration)
9. [Smart Faucet Logic](#smart-faucet-logic)
10. [Upgrade System](#upgrade-system)
11. [Troubleshooting](#troubleshooting)
12. [Development History](#development-history)

## Overview

This faucet system is designed for Cosmos EVM dual environment chains, where users can interact with both Cosmos SDK modules and Ethereum Virtual Machine (EVM) using the same cryptographic keys. The system intelligently distributes tokens based on current balances and implements sophisticated rate limiting.

### Key Features

- **Dual Environment Support**: Works with both Cosmos (bech32) and EVM (hex) addresses
- **Smart Distribution**: Only sends tokens needed to reach target balance (1000 tokens each)
- **Rate Limiting**: 12-hour cooldown per wallet address
- **Balance Checking**: Real-time balance verification before sending
- **Upgradeable Contracts**: Proxy pattern for seamless contract upgrades
- **Multi-Token Support**: Native tokens and multiple ERC20 tokens
- **Modern UI**: Responsive, glassmorphism-styled frontend

## Architecture

The system consists of multiple interconnected components:

- **Frontend**: Vue.js interface with real-time balance display
- **Backend**: Node.js server with smart distribution logic
- **Smart Contracts**: Upgradeable MultiSend contract with ERC20 tokens
- **Blockchain**: Cosmos EVM dual environment chain

## Key Concepts

### Dual Environment Blockchain

The system operates on a Cosmos EVM chain that supports both:

1. **Cosmos Environment**:
   - Uses Cosmos SDK modules
   - Bech32 address format (`cosmos1...`)
   - Bank module for token transfers
   - gRPC/REST API access

2. **EVM Environment**:
   - Ethereum Virtual Machine compatibility
   - Hex address format (`0x...`)
   - ERC20 token standards
   - JSON-RPC API access

### Address Derivation

Both environments use the same private key with different derivation methods:

```javascript
// EVM address (standard Ethereum derivation)
const evmWallet = Wallet.fromMnemonic(mnemonic, "m/44'/60'/0'/0/0");

// Cosmos address (derived from EVM address)
function pubkeyToCosmosAddr(ethWallet, prefix) {
  const evmAddress = ethWallet.address;
  const addressBytes = fromHex(evmAddress.slice(2));
  return bech32.encode(prefix, bech32.toWords(addressBytes));
}
```

### Smart Faucet Logic

The faucet implements intelligent distribution:

1. **Balance Check**: Query current token balances
2. **Need Calculation**: Determine what tokens are needed
3. **Smart Send**: Only send required amounts
4. **Rate Limiting**: Enforce 12-hour cooldown
5. **Verification**: Confirm transaction success

## Smart Contracts

### Token Contracts

#### WBTC (Wrapped Bitcoin)
- **Address**: `0x0312040979E0d6333F537A39b23a5DD6F574dBd8`
- **Decimals**: 8
- **Target Balance**: 1000 WBTC (100000000000 wei)

#### PEPE Token
- **Address**: `0xE43bdb38aF42C9D61a258ED1c0DE28c82f00BA61`
- **Decimals**: 18
- **Target Balance**: 1000 PEPE (1000000000000000000000 wei)

#### USDT (Tether USD)
- **Address**: `0x6ba2828b31Dff02B1424B1321B580C7F9D0FbC61`
- **Decimals**: 6
- **Target Balance**: 1000 USDT (1000000000 wei)

### MultiSend Contract System

#### Proxy Pattern Architecture

The system uses an upgradeable proxy pattern:

```solidity
// Proxy Contract
contract MultiSendProxy {
    address public implementation;
    address public admin;

    fallback() external payable {
        // Delegate all calls to implementation
        delegatecall(implementation);
    }
}

// Implementation Contract
contract MultiSendV2 {
    function multiSend(address recipient, TokenTransfer[] transfers) external;
    function initialize(address owner) external;
}
```

#### Key Features

1. **Upgradeable**: Proxy pattern allows seamless upgrades
2. **transferFrom Pattern**: Uses allowances instead of holding tokens
3. **Batch Operations**: Efficient multi-token transfers
4. **Access Control**: Owner-only functions

## Frontend Implementation

### Technology Stack

- **Vue.js 3**: Reactive frontend framework
- **Bootstrap 5**: Responsive CSS framework
- **Font Awesome**: Icon library
- **Custom CSS**: Glassmorphism effects and Cosmos branding

### Key Components

#### Address Validation
```javascript
computed: {
  addressType() {
    if (/^0x[a-fA-F0-9]{40}$/.test(this.address)) return 'EVM';
    if (this.address.startsWith('cosmos')) return 'Cosmos';
    return 'Invalid';
  }
}
```

#### Balance Display
```javascript
formatBalance(amount) {
  const num = parseInt(amount);
  if (num >= 1000000000000000000) {
    return (num / 1000000000000000000).toFixed(2) + ' (18 decimals)';
  } else if (num >= 1000000) {
    return (num / 1000000).toFixed(2) + ' (6 decimals)';
  }
  return num.toLocaleString();
}
```

### Design System

#### Color Palette
```css
:root {
  --cosmos-primary: #2e2e54;
  --cosmos-secondary: #5064fb;
  --cosmos-accent: #00d2ff;
  --cosmos-gradient: linear-gradient(135deg, #2e2e54 0%, #5064fb 50%, #00d2ff 100%);
}
```

## Backend Implementation

### Technology Stack

- **Node.js**: Runtime environment
- **Express.js**: Web framework
- **ethers.js**: Ethereum library
- **@cosmjs**: Cosmos SDK library
- **Level**: Database for rate limiting

### Core Modules

#### Configuration Management
```javascript
export default {
  port: 8088,
  blockchain: {
    name: "cosmos-evm-chain",
    type: "DualEnvironment",
    ids: {
      chainId: 262144,
      cosmosChainId: 'cosmos_262144-1'
    },
    endpoints: {
      rpc_endpoint: "https://cevm-01-rpc.dev.skip.build",
      evm_endpoint: "https://cevm-01-evmrpc.dev.skip.build"
    }
  }
}
```

#### Rate Limiting System
```javascript
class FrequencyChecker {
  constructor(conf) {
    this.db = new Level(conf.db.path, { valueEncoding: 'json' });
  }

  async check(key, limit) {
    const now = Date.now();
    const WINDOW = 43200 * 1000; // 12 hours
    // Check if requests within window < limit
  }
}
```

## Deployment Guide

### Prerequisites

1. **Node.js** (v18+)
2. **Foundry** (for smart contracts)
3. **Access to Cosmos EVM chain**

### Step 1: Environment Setup

```bash
# Clone repository
git clone <repository-url>
cd faucet

# Install dependencies
npm install

# Install Foundry dependencies
forge install
```

### Step 2: Configure Environment

```bash
# Create .env file
echo "PRIVATE_KEY=your_private_key_here" > .env
```

### Step 3: Deploy Smart Contracts

```bash
# Deploy ERC20 tokens
forge script script/Deploy.s.sol --rpc-url https://cevm-01-evmrpc.dev.skip.build --broadcast

# Deploy and upgrade MultiSend
forge script script/UpgradeMultiSend.s.sol --rpc-url https://cevm-01-evmrpc.dev.skip.build --broadcast

# Approve tokens for MultiSend
forge script script/ApproveTokens.s.sol --rpc-url https://cevm-01-evmrpc.dev.skip.build --broadcast
```

### Step 4: Start Faucet

```bash
npm start
```

## Configuration

### Network Configuration

```javascript
blockchain: {
  endpoints: {
    rpc_endpoint: "https://cevm-01-rpc.dev.skip.build",      // Cosmos RPC
    grpc_endpoint: "https://cevm-01-grpc.dev.skip.build",    // Cosmos gRPC
    rest_endpoint: "https://cevm-01-lcd.dev.skip.build",     // Cosmos REST
    evm_endpoint: "https://cevm-01-evmrpc.dev.skip.build",   // EVM JSON-RPC
    evm_websocket: "wss://cevm-01-evmws.dev.skip.build"      // EVM WebSocket
  }
}
```

### Token Configuration

```javascript
tx: {
  amounts: [
    {
      denom: "uatom",
      amount: "1000000000",                                    // 1000 tokens (6 decimals)
      erc20_contract: "0x0000000000000000000000000000000000000000",
      decimals: 6,
      target_balance: "1000000000"
    }
    // ... other tokens
  ]
}
```

## Smart Faucet Logic

### Request Flow

1. User enters address (Cosmos or EVM format)
2. Frontend validates address format
3. Backend checks rate limiting
4. System queries current token balances
5. Calculates needed amounts to reach 1000 tokens each
6. Sends only required tokens via MultiSend contract
7. Verifies transaction success
8. Updates rate limiting database
9. Returns detailed response to user

### Balance Calculation Logic

```javascript
function calculateNeededAmounts(currentBalances, tokenConfigs) {
  const neededAmounts = [];

  for (let i = 0; i < currentBalances.length; i++) {
    const current = ethers.BigNumber.from(currentBalances[i].current_amount);
    const target = ethers.BigNumber.from(tokenConfigs[i].target_balance);

    if (current.lt(target)) {
      const needed = target.sub(current);
      neededAmounts.push({
        denom: tokenConfigs[i].denom,
        amount: needed.toString(),
        erc20_contract: tokenConfigs[i].erc20_contract
      });
    }
  }

  return neededAmounts;
}
```

## Upgrade System

### Proxy Pattern Benefits

1. **Address Preservation**: Same contract address after upgrades
2. **State Preservation**: Storage layout compatibility
3. **Seamless Upgrades**: No downtime or reconfiguration
4. **Future-Proof**: Can upgrade multiple times

### Implementation Differences

#### V1 (Original)
```solidity
contract MultiSend {
    constructor() {
        owner = msg.sender;  // Constructor sets owner
    }

    function multiSend(...) {
        // Uses transfer() - requires tokens in contract
        token.transfer(recipient, amount);
    }
}
```

#### V2 (Upgraded)
```solidity
contract MultiSendV2 {
    function initialize(address _owner) external {
        owner = _owner;  // Initializer sets owner
    }

    function multiSend(...) {
        // Uses transferFrom() - spends from owner wallet
        token.transferFrom(owner, recipient, amount);
    }
}
```

## Troubleshooting

### Common Issues

#### 1. Transaction Reverts
**Symptoms**: EVM transactions fail with status 0
**Causes**:
- Insufficient allowances
- Insufficient balances
- Wrong contract address

**Solutions**:
```bash
# Check allowances
forge script script/ApproveTokens.s.sol --rpc-url <RPC_URL> --broadcast

# Verify contract addresses in config.js
```

#### 2. Address Validation Errors
**Symptoms**: "Address not supported" errors
**Causes**:
- Invalid bech32 format
- Wrong address prefix
- Invalid hex format

#### 3. Rate Limiting Issues
**Symptoms**: "Cannot read properties of undefined" errors
**Causes**:
- Database corruption
- Wrong configuration structure

**Solutions**:
```bash
# Clear rate limiting database
rm -rf .faucet/history.db

# Restart faucet
npm start
```

## Development History

### Phase 1: Initial Setup
- Basic faucet structure
- Single environment support
- Simple token distribution

### Phase 2: Dual Environment
- Added Cosmos SDK support
- Implemented address derivation
- Created dual environment configuration

### Phase 3: Smart Contracts
- Deployed ERC20 tokens (WBTC, PEPE, USDT)
- Created MultiSend contract
- Implemented batch transfers

### Phase 4: Smart Faucet Logic
- Added balance checking
- Implemented intelligent distribution
- Enhanced rate limiting (12-hour window)

### Phase 5: Frontend Enhancement
- Modern UI with glassmorphism effects
- Real-time balance display
- Comprehensive chain configuration display

### Phase 6: Upgrade System
- Implemented proxy pattern
- Created MultiSendV2 with transferFrom
- Seamless contract upgrades

### Phase 7: Documentation
- Comprehensive system documentation
- Deployment guides
- Troubleshooting resources

## API Reference

### Endpoints

#### GET /
Returns the main faucet interface

#### GET /config.json
Returns faucet configuration and sample addresses

#### GET /balance/:type
Returns faucet balance for specified environment
- `type`: 'cosmos' or 'evm'

#### GET /send/:address
Processes token request for specified address
- `address`: Cosmos (bech32) or EVM (hex) address

### Response Formats

#### Successful Token Send
```json
{
  "result": {
    "code": 0,
    "message": "Tokens sent successfully!",
    "transaction_hash": "0x...",
    "current_balances": [...],
    "tokens_sent": [...]
  }
}
```

#### Sufficient Balance
```json
{
  "result": {
    "code": 0,
    "message": "Wallet already has sufficient balance (1000+ tokens each)",
    "current_balances": [...],
    "tokens_sent": []
  }
}
```

#### Rate Limited
```json
{
  "result": "You can only request tokens once every 12 hours"
}
```

## Security Considerations

### Private Key Management
- Store private keys securely
- Use environment variables
- Never commit keys to version control

### Rate Limiting
- 12-hour cooldown per address
- IP-based limiting (10 requests per IP per day)
- Database persistence across restarts

### Smart Contract Security
- Proxy pattern for upgrades
- Owner-only functions
- Allowance-based token transfers

## Future Enhancements

### Planned Features
1. **Multi-chain Support**: Extend to other Cosmos EVM chains
2. **Advanced Analytics**: Transaction history and statistics
3. **Admin Dashboard**: Real-time monitoring and control
4. **API Authentication**: Rate limiting by API key
5. **Automated Refilling**: Smart contract auto-refill mechanisms

### Technical Improvements
1. **Gas Optimization**: Reduce transaction costs
2. **Error Handling**: More detailed error messages
3. **Monitoring**: Health checks and alerting
4. **Testing**: Comprehensive test suite
5. **CI/CD**: Automated deployment pipeline

---

## Contributing

Please read the development history and architecture sections before contributing. All changes should maintain backward compatibility and follow the established patterns.

## License

MIT License - see LICENSE file for details.
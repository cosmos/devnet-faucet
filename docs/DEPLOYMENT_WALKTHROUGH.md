# Complete Deployment Walkthrough: Zero to Production

This document captures the complete process of building and deploying this faucet, including all the concepts, failures, and solutions encountered throughout.

## Table of Contents

1. [Project Overview](#project-overview)
2. [Initial Setup and Environment](#initial-setup-and-environment)
3. [Smart Contract Development](#smart-contract-development)
4. [Deployment Challenges and Solutions](#deployment-challenges-and-solutions)
5. [Proxy Pattern Implementation](#proxy-pattern-implementation)
6. [Frontend Development](#frontend-development)
7. [Backend Integration](#backend-integration)
8. [Common Failures and Fixes](#common-failures-and-fixes)
9. [Production Deployment](#production-deployment)
10. [Lessons Learned](#lessons-learned)

## Project Overview

### Goal
Create a smart faucet system for Cosmos EVM dual environment chains that:
- Supports both Cosmos (bech32) and EVM (hex) addresses
- Intelligently distributes tokens based on current balances
- Implements rate limiting and upgradeable contracts
- Provides a modern, responsive frontend

### Technology Stack
- **Blockchain**: Cosmos EVM (Chain ID: 262144, Cosmos Chain ID: cosmos_262144-1)
- **Smart Contracts**: Solidity with Foundry
- **Backend**: Node.js with Express
- **Frontend**: Vue.js 3 with Bootstrap 5
- **Database**: LevelDB for rate limiting

## Initial Setup and Environment

### 1. Environment Configuration

```bash
# Initial project structure
mkdir faucet && cd faucet
npm init -y

# Install dependencies
npm install express ethers @cosmjs/stargate @cosmjs/crypto level node-fetch

# Initialize Foundry
forge init --force
```

### 2. Network Configuration

**Challenge**: Configuring dual environment endpoints
**Solution**: Comprehensive endpoint mapping

```javascript
// config.js
export default {
  blockchain: {
    name: "cosmos-evm-chain",
    type: "DualEnvironment",
    ids: {
      chainId: 262144,
      cosmosChainId: 'cosmos_262144-1'
    },
    endpoints: {
      rpc_endpoint: "https://cevm-01-rpc.dev.skip.build",      // Cosmos RPC
      grpc_endpoint: "https://cevm-01-grpc.dev.skip.build",    // Cosmos gRPC
      rest_endpoint: "https://cevm-01-lcd.dev.skip.build",     // Cosmos REST
      evm_endpoint: "https://cevm-01-evmrpc.dev.skip.build",   // EVM JSON-RPC
      evm_websocket: "wss://cevm-01-evmws.dev.skip.build"      // EVM WebSocket
    }
  }
}
```

### 3. Foundry Configuration

```toml
# foundry.toml
[profile.default]
src = "contracts"
out = "out"
libs = ["lib"]
remappings = [
    "@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/"
]

[rpc_endpoints]
cosmos_evm = "https://cevm-01-evmrpc.dev.skip.build"

[etherscan]
cosmos_evm = { key = "dummy", url = "https://cevm-01-evmrpc.dev.skip.build" }
```

## Smart Contract Development

### 1. ERC20 Token Contracts

**Initial Approach**: Custom ERC20 implementation
**Problem**: Interface conflicts and compilation errors
**Solution**: Use OpenZeppelin standards

```solidity
// contracts/tokens/WBTC.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract WBTC is ERC20 {
    constructor() ERC20("Wrapped Bitcoin", "WBTC") {
        _mint(msg.sender, 1000000000 * 10**8); // 1B tokens, 8 decimals
    }

    function decimals() public pure override returns (uint8) {
        return 8;
    }
}
```

**Key Learning**: Always use established standards like OpenZeppelin to avoid interface conflicts.

### 2. MultiSend Contract Evolution

#### Version 1: Basic Implementation
```solidity
contract MultiSend {
    constructor() {
        owner = msg.sender;
    }

    function multiSend(address recipient, TokenTransfer[] memory transfers) external onlyOwner {
        for (uint i = 0; i < transfers.length; i++) {
            if (transfers[i].token == address(0)) {
                // Native token
                payable(recipient).transfer(transfers[i].amount);
            } else {
                // ERC20 token - PROBLEM: Uses transfer()
                IERC20(transfers[i].token).transfer(recipient, transfers[i].amount);
            }
        }
    }
}
```

**Problem**: Contract needs to hold tokens, requires manual funding
**Impact**: Transaction reverts due to insufficient contract balance

#### Version 2: transferFrom Implementation
```solidity
contract MultiSendV2 {
    function initialize(address _owner) external {
        require(!initialized, "Already initialized");
        owner = _owner;
        initialized = true;
    }

    function multiSend(address recipient, TokenTransfer[] memory transfers) external onlyOwner {
        for (uint i = 0; i < transfers.length; i++) {
            if (transfers[i].token == address(0)) {
                payable(recipient).transfer(transfers[i].amount);
            } else {
                // SOLUTION: Uses transferFrom() with allowances
                IERC20(transfers[i].token).transferFrom(owner, recipient, transfers[i].amount);
            }
        }
    }
}
```

**Key Learning**: `transferFrom()` pattern is more flexible than `transfer()` for faucet applications.

## Deployment Challenges and Solutions

### 1. Hardhat vs Foundry Decision

**Initial Choice**: Hardhat
**Problems Encountered**:
```bash
npm ERR! peer dep missing: hardhat@^2.0.0, required by @nomiclabs/hardhat-ethers@2.2.3
npm ERR! peer dep missing: @ethersproject/abi@^5.0.0, required by @nomiclabs/hardhat-ethers@2.2.3
```

**Solution**: Switch to Foundry
```bash
# Install Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Install dependencies
forge install OpenZeppelin/openzeppelin-contracts
```

**Key Learning**: Foundry provides better dependency management for Solidity projects.

### 2. Contract Deployment Process

```bash
# Set environment variable
export PRIVATE_KEY="your_private_key_here"

# Deploy contracts
forge script script/Deploy.s.sol \
  --rpc-url https://cevm-01-evmrpc.dev.skip.build \
  --broadcast \
  --verify
```

**Deployment Results**:
```
== Logs ==
  Deploying WBTC...
  WBTC deployed to: 0x0312040979E0d6333F537A39b23a5DD6F574dBd8

  Deploying PEPE...
  PEPE deployed to: 0xE43bdb38aF42C9D61a258ED1c0DE28c82f00BA61

  Deploying USDT...
  USDT deployed to: 0x6ba2828b31Dff02B1424B1321B580C7F9D0FbC61

  Deploying MultiSend...
  MultiSend deployed to: 0xa41dd39233852D9fcc4441eB9Aa3901Df5f67EC4

== Return ==
Total gas used: 4640977
```

## Proxy Pattern Implementation

### 1. Understanding the Need for Upgrades

**Problem**: MultiSend V1 used `transfer()` instead of `transferFrom()`
**Challenge**: How to upgrade without changing contract addresses?
**Solution**: Implement proxy pattern

### 2. Proxy Contract Design

```solidity
// contracts/utils/MultiSendProxy.sol
contract MultiSendProxy {
    address public implementation;
    address public admin;

    event ImplementationUpgraded(address indexed oldImplementation, address indexed newImplementation);

    modifier onlyAdmin() {
        require(msg.sender == admin, "MultiSendProxy: caller is not the admin");
        _;
    }

    constructor(address _implementation) {
        implementation = _implementation;
        admin = msg.sender;
    }

    function upgrade(address newImplementation) external onlyAdmin {
        require(newImplementation != address(0), "MultiSendProxy: new implementation is the zero address");

        address oldImplementation = implementation;
        implementation = newImplementation;

        emit ImplementationUpgraded(oldImplementation, newImplementation);
    }

    fallback() external payable {
        address impl = implementation;
        assembly {
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(gas(), impl, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())

            switch result
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
}
```

### 3. Upgrade Process Implementation

```solidity
// script/UpgradeMultiSend.s.sol
contract UpgradeMultiSendScript is Script {
    address constant CURRENT_MULTISEND = 0xa41dd39233852D9fcc4441eB9Aa3901Df5f67EC4;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        // Step 1: Deploy MultiSendV2 implementation
        MultiSendV2 multiSendV2 = new MultiSendV2();
        console.log("MultiSendV2 implementation deployed to:", address(multiSendV2));

        // Step 2: Deploy proxy pointing to current MultiSend
        MultiSendProxy proxy = new MultiSendProxy(CURRENT_MULTISEND);
        console.log("Proxy deployed to:", address(proxy));

        // Step 3: Upgrade proxy to point to MultiSendV2
        proxy.upgrade(address(multiSendV2));
        console.log("Proxy upgraded to MultiSendV2");

        // Step 4: Initialize the new implementation
        MultiSendV2(address(proxy)).initialize(msg.sender);
        console.log("MultiSendV2 initialized with owner:", msg.sender);

        vm.stopBroadcast();
    }
}
```

**Key Concepts**:
1. **Proxy Pattern**: Separates logic (implementation) from state (proxy)
2. **Delegate Call**: Executes implementation code in proxy's context
3. **Storage Layout**: Must maintain compatibility between versions
4. **Initialization**: Use initializer instead of constructor for upgradeable contracts

## Frontend Development

### 1. Address Derivation Challenge

**Problem**: Supporting both Cosmos and EVM addresses from same private key
**Solution**: Implement dual derivation system

```javascript
// Address derivation functions
function pubkeyToCosmosAddr(ethWallet, prefix) {
  const evmAddress = ethWallet.address;
  const addressBytes = fromHex(evmAddress.slice(2));
  return bech32.encode(prefix, bech32.toWords(addressBytes));
}

async function createEthCompatibleCosmosWallet(mnemonic, options) {
  const ethWallet = Wallet.fromMnemonic(mnemonic, "m/44'/60'/0'/0/0");
  const cosmosAddress = pubkeyToCosmosAddr(ethWallet, options.prefix);

  return DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
    prefix: options.prefix,
    hdPaths: [stringToPath("m/44'/60'/0'/0/0")]
  });
}
```

### 2. Frontend Architecture

**Technology Choices**:
- Vue.js 3 for reactivity
- Bootstrap 5 for responsive design
- Font Awesome for icons
- Custom CSS for Cosmos branding

**Key Features**:
```javascript
// Address validation
computed: {
  addressType() {
    if (/^0x[a-fA-F0-9]{40}$/.test(this.address)) return 'EVM';
    if (this.address.startsWith('cosmos')) return 'Cosmos';
    return 'Invalid';
  }
}

// Balance formatting
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

## Backend Integration

### 1. Smart Faucet Logic Implementation

**Challenge**: Only send tokens needed to reach 1000 token target
**Solution**: Balance checking and calculation system

```javascript
async function checkRecipientBalances(address, addressType) {
  const balances = [];

  if (addressType === 'cosmos') {
    const response = await fetch(`${restEndpoint}/cosmos/bank/v1beta1/balances/${address}`);
    const data = await response.json();

    for (const token of chainConf.tx.amounts) {
      const balance = data.balances?.find(b => b.denom === token.denom);
      balances.push({
        denom: token.denom,
        current_amount: balance ? balance.amount : "0",
        target_amount: token.target_balance,
        erc20_contract: token.erc20_contract
      });
    }
  } else if (addressType === 'evm') {
    // Check native balance
    const nativeBalance = await ethProvider.getBalance(address);
    balances.push({
      denom: "uatom",
      current_amount: nativeBalance.toString(),
      target_amount: chainConf.tx.amounts[0].target_balance,
      erc20_contract: "0x0000000000000000000000000000000000000000"
    });

    // Check ERC20 balances
    for (let i = 1; i < chainConf.tx.amounts.length; i++) {
      const token = chainConf.tx.amounts[i];
      const contract = new ethers.Contract(token.erc20_contract, erc20ABI, ethProvider);
      const balance = await contract.balanceOf(address);

      balances.push({
        denom: token.denom,
        current_amount: balance.toString(),
        target_amount: token.target_balance,
        erc20_contract: token.erc20_contract
      });
    }
  }

  return balances;
}
```

### 2. Rate Limiting System

```javascript
class FrequencyChecker {
  constructor(conf) {
    this.db = new Level(conf.db.path, { valueEncoding: 'json' });
    this.limits = conf.blockchain.limit;
  }

  async checkAddress(address, chain) {
    const now = Date.now();
    const WINDOW = 43200 * 1000; // 12 hours

    try {
      const key = `${chain}:${address}`;
      const data = await this.db.get(key);

      if (data && data.requests) {
        const recentRequests = data.requests.filter(time => now - time < WINDOW);
        if (recentRequests.length >= this.limits.address) {
          return false;
        }
      }
      return true;
    } catch (error) {
      if (error.code === 'LEVEL_NOT_FOUND') {
        return true;
      }
      throw error;
    }
  }
}
```

## Common Failures and Fixes

### 1. Rate Limiting Database Errors

**Error**:
```
TypeError: Cannot read properties of undefined (reading 'find')
    at FrequencyChecker.checkAddress (file:///home/cordt/repos/faucet/checker.js:33:50)
```

**Root Cause**: Configuration structure mismatch
**Fix**: Update checker.js to handle single blockchain config

```javascript
// Before (expected array)
const blockchain = this.conf.blockchains.find(b => b.name === chain);

// After (single object)
const blockchain = this.conf.blockchain;
```

### 2. Transaction Revert Issues

**Error**:
```
Error: transaction failed [ See: https://links.ethers.org/v5-errors-CALL_EXCEPTION ]
status: 0
```

**Root Cause**: MultiSend contract using `transfer()` without sufficient balance
**Fix**: Implement `transferFrom()` pattern with token approvals

```bash
# Approve tokens for MultiSend contract
forge script script/ApproveTokens.s.sol \
  --rpc-url https://cevm-01-evmrpc.dev.skip.build \
  --broadcast
```

### 3. Address Validation Failures

**Error**: Invalid Cosmos addresses not properly detected
**Root Cause**: Incorrect bech32 validation
**Fix**: Implement proper address validation

```javascript
function detectAddressType(address) {
  // EVM address validation
  if (/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return 'evm';
  }

  // Cosmos address validation
  try {
    const decoded = bech32.decode(address);
    if (decoded.prefix === 'cosmos' && decoded.words.length > 0) {
      return 'cosmos';
    }
  } catch (error) {
    // Invalid bech32 format
  }

  return 'unknown';
}
```

### 4. Node.js Module Resolution

**Error**:
```
Error [ERR_MODULE_NOT_FOUND]: Cannot resolve module
```

**Fix**: Add proper ES module configuration
```json
// package.json
{
  "type": "module",
  "scripts": {
    "start": "node --experimental-modules --es-module-specifier-resolution=node faucet.js"
  }
}
```

## Production Deployment

### 1. Environment Variables

```bash
# .env file
PRIVATE_KEY=your_private_key_here
NODE_ENV=production
PORT=8088
```

### 2. Process Management

```bash
# Using PM2 for production
npm install -g pm2
pm2 start faucet.js --name "cosmos-evm-faucet"
pm2 startup
pm2 save
```

### 3. Nginx Configuration

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:8088;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Lessons Learned

### 1. Smart Contract Development

**Key Insights**:
- Always use established standards (OpenZeppelin) over custom implementations
- `transferFrom()` pattern is more flexible than `transfer()` for faucets
- Proxy patterns enable seamless upgrades without address changes
- Initialize functions are crucial for upgradeable contracts

### 2. Dual Environment Challenges

**Key Insights**:
- Address derivation requires careful handling of different formats
- Balance checking needs environment-specific implementations
- Rate limiting must account for address format differences
- Configuration structure impacts all system components

### 3. Development Tools

**Key Insights**:
- Foundry provides better Solidity development experience than Hardhat
- ES modules require specific Node.js configuration
- LevelDB is excellent for simple key-value storage needs
- Vue.js 3 composition API works well for reactive interfaces

### 4. Deployment Strategy

**Key Insights**:
- Environment configuration is critical for multi-network support
- Comprehensive error handling prevents production issues
- Documentation during development saves significant time later
- Proxy patterns future-proof smart contract systems

### 5. Testing and Validation

**Key Insights**:
- Test with real network conditions early and often
- Address validation must be comprehensive and accurate
- Balance checking requires proper decimal handling
- Rate limiting needs persistent storage across restarts

## Boilerplate Templates

### 1. Foundry Project Structure
```
faucet/
├── contracts/
│   ├── tokens/
│   │   ├── WBTC.sol
│   │   ├── PEPE.sol
│   │   └── USDT.sol
│   └── utils/
│       ├── MultiSend.sol
│       ├── MultiSendV2.sol
│       └── MultiSendProxy.sol
├── script/
│   ├── Deploy.s.sol
│   ├── UpgradeMultiSend.s.sol
│   └── ApproveTokens.s.sol
├── test/
├── foundry.toml
└── .env
```

### 2. Essential Scripts

**Deploy Script Template**:
```solidity
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../contracts/tokens/WBTC.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        WBTC wbtc = new WBTC();
        console.log("WBTC deployed to:", address(wbtc));

        vm.stopBroadcast();
    }
}
```

**Approval Script Template**:
```solidity
pragma solidity ^0.8.19;

import "forge-std/Script.sol";

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
}

contract ApproveTokensScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address spender = vm.envAddress("MULTISEND_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        IERC20(TOKEN_ADDRESS).approve(spender, type(uint256).max);
        console.log("Approved tokens for:", spender);

        vm.stopBroadcast();
    }
}
```

This comprehensive walkthrough captures the complete journey from concept to production, including all the failures, solutions, and key learnings that make this deployment experience so valuable for future projects.
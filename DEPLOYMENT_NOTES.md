# Faucet Project Notes


## Deployment

### Contracts Deployed
| Contract | Address | Purpose | Status |
|----------|---------|---------|---------|
| WBTC | `0x0312040979E0d6333F537A39b23a5DD6F574dBd8` | 8-decimal token | Deployed |
| PEPE | `0xE43bdb38aF42C9D61a258ED1c0DE28c82f00BA61` | 18-decimal token | Deployed |
| USDT | `0x6ba2828b31Dff02B1424B1321B580C7F9D0FbC61` | 6-decimal token | Deployed |
| MultiSend | `0xa41dd39233852D9fcc4441eB9Aa3901Df5f67EC4` | Multi-token utility | Deployed |

### Network Configuration
- **Chain ID**: 262144 (0x40000)
- **Cosmos Chain ID**: cosmos_262144-1
- **Total Gas Used**: 4,640,977
- **Deployment Block**: 538963

### Faucet Wallet
- **Cosmos**: `cosmos1gtnqglzhszcs8efzvhmys0pdqyf656u8wmfcuz`
- **EVM**: `0x42e6047c5780B103E52265F6483C2d0113aA6B87`

### Touchpoints for Docs

#### Proxy Pattern Implementation
- **Concept**: Upgradeable contracts using delegatecall
- **Implementation**: MultiSendProxy with upgrade functionality
- **Storage Layout**: Preservation across upgrades
- **Security**: Admin controls and initialization patterns

#### Dual Environment Architecture
- **Address Derivation**: Same private key for Cosmos and EVM
- **Balance Checking**: Unified queries across environments
- **Transaction Patterns**: Bank sends vs contract calls
- **Configuration**: Multi-endpoint setup

#### Smart Contract Evolution
- **V1 Problem**: transfer() pattern requiring contract funding
- **V2 Solution**: transferFrom() pattern with allowances
- **Upgrade Process**: Seamless transition using proxy
- **Testing**: Comprehensive validation strategies

#### Development Tooling
- **Foundry vs Hardhat**: Tool selection and migration
- **Deployment Scripts**: Automated contract deployment
- **Verification**: On-chain contract verification
- **Testing**: Upgradeable contract testing patterns

## Failures and Solutions Documented

### ontract Upgrade Challenge
**Problem**: Original MultiSend used `transfer()` requiring tokens in contract
**Solution**: Implemented proxy pattern with `transferFrom()` in V2
**Learning**: Proxy patterns enable seamless upgrades without address changes

### Tooling Issues
**Problem**: Hardhat dependency conflicts and complexity
**Solution**: Migration to Foundry for better Solidity development
**Learning**: Foundry provides superior developer experience for smart contracts

### Rate Limiting Database Errors
**Problem**: Configuration structure mismatch causing undefined errors
**Solution**: Updated checker logic for single blockchain config
**Learning**: Configuration consistency is critical across all components

### Address Derivation Complexity
**Problem**: Supporting both Cosmos and EVM addresses from same keys
**Solution**: Custom derivation functions and validation logic
**Learning**: Dual environment support requires careful address handling

## 🎓 Relevant Docs Areas

### Smart Contract Dev
- **Proxy Pattern Mastery**: Complete implementation with real-world examples
- **Upgrade Strategies**: Seamless contract evolution without disruption
- **Token Standards**: ERC20 implementation and interaction patterns
- **Testing Approaches**: Comprehensive testing for upgradeable contracts

### Chain Integrators
- **Dual Environment Patterns**: Cosmos SDK + EVM integration
- **Address Systems**: bech32 and hex address handling
- **Balance Queries**: Multi-environment balance checking
- **Configuration Management**: Complex endpoint management

### DevOps
- **Deployment Automation**: Script-based deployment workflows
- **Environment Management**: Multi-network configuration
- **Monitoring**: Health checks and error tracking
- **Security**: Private key management and access control

### Frontend Dev
- **Vue.js Integration**: Reactive UI with blockchain interaction
- **Address Validation**: Multi-format address handling
- **Balance Display**: Real-time balance formatting
- **Error Handling**: User-friendly error management

### Project Structure

```
contracts/
├── tokens/           # ERC20 implementations
├── utils/           # Utility contracts
script/
├── Deploy.s.sol     # Deployment automation
├── Upgrade.s.sol    # Upgrade procedures
└── Approve.s.sol    # Token approvals
```

### Proxy Implementation
- Upgradable proxy contract
- Deployment scripts for easy redeploy

### Dual Environment Deployments
- Endpoint configuration for Cosmos and EVM
- Address derivation functions
- Balance checking implementations
- Rate limiting with persistent storage

### Frontend
- Address Provided determines message type
- Token Balances
- Tx result with error messages
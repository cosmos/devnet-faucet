# Token Configuration System Guide

## Overview

This document describes the comprehensive token configuration system for the Cosmos EVM Testnet Faucet. The new `tokens.json` structure replaces hardcoded token configurations with a flexible, extensible system that supports advanced features like token creator UI, analytics, and rich metadata.

## Architecture

### File Structure

```
├── tokens.json                     # Comprehensive token configuration
├── src/TokenHelper.js              # Utility functions for token operations
├── scripts/migrate-to-tokens-config.js  # Migration helper
├── integration-examples.js         # Code examples
└── TOKEN_CONFIGURATION_GUIDE.md    # This documentation
```

### Migration Path

The new system maintains backward compatibility with the existing:
- `config.js` - Token amounts configuration
- `faucet.js` - Frontend token display
- `token-registry.json` - Basic token registry

## Configuration Structure

### Top Level Structure

```json
{
  "version": "2.0.0",
  "schema_version": "1.0.0",
  "meta": { /* Network and faucet metadata */ },
  "tokens": [ /* ERC20 token configurations */ ],
  "nativeTokens": [ /* Native blockchain tokens */ ],
  "categories": { /* Token categorization */ },
  "ui": { /* Frontend configuration */ },
  "api": { /* API configuration */ },
  "deployment": { /* Deployment scripts */ },
  "migration": { /* Version migration info */ }
}
```

### Token Configuration Schema

Each token in the `tokens` array follows this comprehensive structure:

#### Basic Information
```json
{
  "id": "unique-token-identifier",
  "name": "Human Readable Name",
  "symbol": "TOKEN",
  "decimals": 18,
  "type": "erc20",
  "category": "cryptocurrency",
  "tags": ["tag1", "tag2"],
  "description": "Detailed description",
  "logoUri": "https://...",
  "website": "https://...",
  "coingeckoId": "token-id"
}
```

#### Contract Information
```json
{
  "contract": {
    "address": "0x...",
    "deploymentBlock": "620411",
    "deploymentTransaction": "0x...",
    "deployer": "0x...",
    "implementation": "standard_erc20",
    "verified": true,
    "abi": "standard_erc20_with_mint_burn"
  }
}
```

#### Token Features
```json
{
  "features": {
    "mintable": true,
    "burnable": true,
    "pausable": false,
    "permit": false,
    "snapshots": false,
    "flashMint": false,
    "capped": false,
    "governanceToken": false,
    "rewardToken": false,
    "stableToken": false
  }
}
```

#### Faucet Configuration
```json
{
  "faucet": {
    "enabled": true,
    "configuration": {
      "amountPerRequest": "1000000000000000000000",
      "targetBalance": "1000000000000000000000",
      "maxRequestsPerDay": 1,
      "cooldownPeriod": "24h",
      "eligibility": {
        "addressTypes": ["evm", "cosmos"],
        "minimumBalance": null,
        "maximumBalance": null,
        "blacklist": [],
        "whitelist": null
      }
    },
    "analytics": {
      "totalDistributed": "0",
      "uniqueRecipients": 0,
      "averageRequest": "1000000000000000000000",
      "lastDistribution": null
    }
  }
}
```

## Integration with Current System

### 1. Config.js Integration

Replace the hardcoded `amounts` array:

```javascript
// OLD (hardcoded):
const amounts = [
    {
        denom: "wbtc",
        amount: "100000000000",
        erc20_contract: "0x921c48F521329cF6187D1De1D0Ca5181B47FF946",
        decimals: 8,
        target_balance: "100000000000"
    }
];

// NEW (using tokens.json):
import { getConfigAmounts } from './src/TokenHelper.js';
const amounts = getConfigAmounts();
```

### 2. Faucet.js Integration

Replace the hardcoded token list:

```javascript
// OLD (hardcoded):
project.tokens = [
    {
        denom: "uatom",
        name: "ATOM",
        contract: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        decimals: 6,
        target_amount: "1000000"
    }
];

// NEW (using tokens.json):
import { getFrontendTokens } from './src/TokenHelper.js';
project.tokens = getFrontendTokens();
```

### 3. Token Analytics Integration

Track faucet distributions:

```javascript
import { updateTokenAnalytics } from './src/TokenHelper.js';

// After successful token distribution
updateTokenAnalytics('wbtc-cosmos-evm', {
    totalDistributed: (BigInt(currentTotal) + BigInt(sentAmount)).toString(),
    uniqueRecipients: currentRecipients + 1,
    lastDistribution: new Date().toISOString()
});
```

## Token Creator UI Support

The configuration supports building a comprehensive token creator interface:

### Category-based UI
```javascript
import { getTokenCategories } from './src/TokenHelper.js';

const categories = getTokenCategories();
// Categories include: cryptocurrency, stablecoin, meme, utility
// Each with icon, color, and description
```

### Feature Templates
```javascript
const templates = {
    "basic_token": {
        features: ["mintable", "burnable"],
        category: "cryptocurrency"
    },
    "stablecoin": {
        features: ["mintable", "burnable", "pausable"],
        category: "stablecoin",
        pricing: { pegging: { enabled: true } }
    },
    "governance_token": {
        features: ["mintable", "burnable", "snapshots"],
        category: "utility",
        governanceToken: true
    }
};
```

### Dynamic Contract Generation
The system can generate Solidity contracts based on configuration:

```javascript
// See scripts/deploy-token-registry.js for implementation
const contractCode = generateTokenContract({
    name: "My Token",
    symbol: "MTK",
    features: { mintable: true, burnable: true },
    decimals: 18
});
```

## Security and Risk Management

### Risk Assessment
```json
{
  "security": {
    "audits": [],
    "riskLevel": "medium",
    "warnings": ["testnet_only", "centralized_minting"],
    "emergencyContacts": ["0x..."]
  }
}
```

### Compliance Tracking
```json
{
  "compliance": {
    "jurisdiction": "testnet",
    "regulatoryStatus": "experimental",
    "kycRequired": false,
    "sanctions": false
  }
}
```

## API Integration

### RESTful Endpoints
```javascript
const apiConfig = {
    endpoints: {
        tokens: "/api/v1/tokens",
        token: "/api/v1/tokens/{id}",
        faucet: "/api/v1/faucet/{address}",
        balances: "/api/v1/balances/{address}",
        analytics: "/api/v1/analytics"
    }
};
```

### Rate Limiting
```json
{
  "api": {
    "rateLimit": {
      "faucet": "1/24h",
      "api": "100/min"
    }
  }
}
```

## Deployment and Automation

### Automated Deployment
The system integrates with existing deployment scripts:

```bash
# Generate contracts from tokens.json
node scripts/deploy-token-registry.js

# Deploy using Foundry
node scripts/deployment/deploy-tokens-foundry.js deploy

# Migrate configuration
node scripts/migrate-to-tokens-config.js
```

### Template System
```json
{
  "deployment": {
    "templates": {
      "erc20_basic": {
        "features": ["mintable", "burnable"],
        "baseContract": "ERC20"
      },
      "stablecoin": {
        "features": ["mintable", "burnable", "pausable"],
        "baseContract": "ERC20",
        "additionalFeatures": ["oracle_pricing"]
      }
    }
  }
}
```

## Migration Guide

### Step-by-Step Migration

1. **Install the new configuration:**
   ```bash
   # The tokens.json file is already created
   # Run the migration script
   node scripts/migrate-to-tokens-config.js
   ```

2. **Update config.js:**
   ```javascript
   import { getConfigAmounts } from './src/TokenHelper.js';
   
   // Replace the hardcoded amounts array
   const amounts = getConfigAmounts();
   ```

3. **Update faucet.js:**
   ```javascript
   import { getFrontendTokens } from './src/TokenHelper.js';
   
   // Replace the hardcoded tokens array
   project.tokens = getFrontendTokens();
   ```

4. **Implement analytics tracking:**
   ```javascript
   import { updateTokenAnalytics } from './src/TokenHelper.js';
   
   // Track distributions in your faucet logic
   ```

5. **Test the integration:**
   ```bash
   # Validate configuration
   node -e "import('./src/TokenHelper.js').then(h => console.log(h.validateTokenConfig()))"
   
   # Test faucet functionality
   npm start
   ```

### Backward Compatibility

The new system maintains full backward compatibility:
- Existing API endpoints continue to work
- Current faucet functionality is preserved
- Token registry format is supported
- Migration is non-breaking

## Advanced Features

### Multi-Network Support
The configuration supports future multi-network expansion:

```json
{
  "meta": {
    "network": {
      "name": "cosmos-evm-testnet",
      "chainId": 262144,
      "type": "DualEnvironment"
    }
  }
}
```

### Token Bridging
Integration points for cross-chain functionality:

```json
{
  "integration": {
    "bridges": [],
    "supportedWallets": ["metamask", "keplr"],
    "blockExplorers": [...]
  }
}
```

### Governance Integration
Support for token governance features:

```json
{
  "governance": {
    "model": "centralized",
    "roles": { /* role definitions */ },
    "multisig": null,
    "timelock": null
  }
}
```

## Performance and Caching

### Configuration Caching
The TokenHelper module caches the configuration in memory:

```javascript
let _tokensConfig = null;

function loadTokensConfig() {
    if (!_tokensConfig) {
        // Load and cache configuration
        _tokensConfig = JSON.parse(fs.readFileSync('tokens.json', 'utf8'));
    }
    return _tokensConfig;
}
```

### Lazy Loading
Token operations are optimized for performance:

```javascript
// Efficient token lookup by symbol
export function getTokenBySymbol(symbol) {
    const config = loadTokensConfig();
    return config.tokens.find(token => 
        token.symbol.toLowerCase() === symbol.toLowerCase()
    );
}
```

## Future Roadmap

### Planned Enhancements

1. **Advanced Token Creator UI**
   - Visual contract builder
   - Template marketplace
   - Code generation preview

2. **Enhanced Analytics**
   - Distribution charts
   - Usage patterns
   - Token health metrics

3. **Governance Features**
   - DAO integration
   - Voting mechanisms
   - Proposal systems

4. **Cross-Chain Support**
   - Bridge integration
   - Multi-network deployment
   - Unified token management

5. **Enterprise Features**
   - Audit trails
   - Compliance reporting
   - Multi-tenant support

## Troubleshooting

### Common Issues

1. **Configuration not loading:**
   ```bash
   # Check file exists and has valid JSON
   node -e "console.log(JSON.parse(require('fs').readFileSync('tokens.json', 'utf8')))"
   ```

2. **Migration errors:**
   ```bash
   # Re-run migration with verbose output
   DEBUG=* node scripts/migrate-to-tokens-config.js
   ```

3. **Token not appearing in faucet:**
   ```javascript
   // Check if token is enabled
   import { getTokenBySymbol } from './src/TokenHelper.js';
   const token = getTokenBySymbol('WBTC');
   console.log(token.faucet.enabled);
   ```

### Validation

Use the built-in validation to check configuration integrity:

```javascript
import { validateTokenConfig } from './src/TokenHelper.js';
const errors = validateTokenConfig();
if (errors.length > 0) {
    console.error('Configuration errors:', errors);
}
```

## Conclusion

The new token configuration system provides a robust, extensible foundation for the Cosmos EVM testnet faucet. It supports current functionality while enabling advanced features like token creator UI, comprehensive analytics, and future multi-network expansion.

The migration path is designed to be seamless, maintaining backward compatibility while providing immediate access to enhanced capabilities.

For questions or support, refer to the integration examples or contact the development team.
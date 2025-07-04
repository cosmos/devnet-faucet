# Faucet Scripts

## Core Scripts

### Deployment
- `automated-deploy.js` - Main deployment script with integrated verification
- `deploy-token-registry.js` - Deploy ERC20 token contracts
- `deployment/deploy-atomic-multisend.js` - Deploy AtomicMultiSend contract
- `deployment/deploy-tokens-foundry.js` - Foundry-based token deployment

### Verification
- `verify-contracts.js` - Check contract verification status
- `verify-contracts-blockscout.js` - Verify contracts on Blockscout API
- `verify-contracts-automated.js` - Automated verification for deployment pipeline

### Setup & Configuration
- `setup-approvals.js` - Set up token approvals for AtomicMultiSend
- `extract-abi.js` - Extract contract ABIs from build artifacts
- `derive-and-cache-addresses.js` - Derive wallet addresses from mnemonic

### Testing
- `test-ibc-faucet.js` - Test IBC token distribution
- `test-ibc-faucet-distribution.js` - Test IBC faucet distribution flow
- `test-ibc-tokens.js` - Test IBC token functionality

### Utilities
- `validate-environment.js` - Validate deployment environment
- `validate-contracts.js` - Validate deployed contracts
- `fund-atomic-multisend.js` - Fund the AtomicMultiSend contract
- `mint-tokens-to-faucet.js` - Mint tokens to faucet address
- `transfer-tokens-to-faucet.js` - Transfer tokens to faucet
- `approve-tokens.js` - Approve token spending
- `query-ibc-denoms.js` - Query IBC token denominations
- `register-coins-cosmos.js` - Register coins on Cosmos chain
- `verify-ibc-balance.js` - Verify IBC token balances

### Infrastructure
- `docker-run.sh` - Run faucet in Docker
- `deploy-to-fly.sh` - Deploy to Fly.io

## Usage

### Full Deployment with Verification
```bash
yarn deploy
```

### Verify Latest Deployment
```bash
yarn verify:latest
```

### Check Contract Status
```bash
node scripts/verify-contracts.js
```
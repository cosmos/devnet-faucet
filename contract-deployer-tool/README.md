# Contract Deployer Tool

A simple tool for deploying and verifying smart contracts on EVM chains with Blockscout support.

## Features

- Automatic contract discovery in `./contracts` directory
- Deploy multiple contracts in one run
- Skip already deployed contracts
- Automatic contract verification on Blockscout
- Support for constructor arguments
- Deployment tracking
- Automatic dependency installation (OpenZeppelin, etc.)
- Built-in Foundry detection

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env` and configure:
```bash
cp .env.example .env
```

3. Edit `.env` with your settings:
- `PRIVATE_KEY` or `MNEMONIC` - Deployer wallet
- `RPC_URL` - Your chain's RPC endpoint
- `CHAIN_ID` - Chain ID
- `EXPLORER_URL` - Blockscout instance URL
- `EXPLORER_API_URL` - Blockscout API URL (usually `EXPLORER_URL/api/v2`)

## Usage

### Deploy Contracts

Place your Solidity contracts in the `./contracts` directory. Contracts can be:
- Single files: `./contracts/MyContract.sol`
- In subdirectories: `./contracts/tokens/Token.sol`

To deploy:
```bash
npm run deploy
```

### Verify Contracts

After deployment, verify contracts on Blockscout:
```bash
npm run verify
```

### Deploy and Verify

Run both in sequence:
```bash
npm run deploy-and-verify
```

### Check Contract Status

Check deployment and verification status:
```bash
npm run check
```

## Constructor Arguments

For contracts with constructor arguments, create a JSON file with the same name:
- Contract: `./contracts/MyToken.sol`
- Args file: `./contracts/MyToken.args.json`

Example args file:
```json
["0x1234567890123456789012345678901234567890", 1000000, true]
```

## Deployment Tracking

Deployments are saved in `./deployments/{chainId}.json` with:
- Contract address
- Transaction hash
- Block number
- Constructor arguments
- Timestamp

## Directory Structure

```
contract-deployer-tool/
├── contracts/          # Your Solidity contracts
├── deployments/        # Deployment records
├── flattened/         # Flattened contracts for verification
├── out/               # Foundry build artifacts
├── .env               # Environment configuration
├── deploy.js          # Deployment script
├── verify.js          # Verification script
└── config.js          # Configuration loader
```

## Compiler Settings

Default compiler settings in `config.js`:
- Solidity: v0.8.28
- Optimization: Enabled (200 runs)
- EVM Version: Istanbul

Modify these in `config.js` if needed.

## Preinstalled Contracts

Cosmos EVM chains come with several preinstalled system contracts:

- **Create2** (`0x4e59b44847b379578588920ca78fbf26c0b4956c`) - Deterministic deployment proxy
- **Multicall3** (`0xcA11bde05977b3631167028862bE2a173976CA11`) - Batch contract calls
- **Permit2** (`0x000000000022D473030F116dDEE9F6B43aC78BA3`) - Token permits
- **SafeSingletonFactory** (`0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7`) - Deterministic deployments

These are listed in `deployments/preinstalled.json` and will be detected by the tool.

## Requirements

- Node.js 18+
- Foundry (will be detected automatically, install instructions provided if missing)

## Troubleshooting

1. **"Address is not a smart-contract"**: Blockscout requires lowercase addresses. The tool handles this automatically.

2. **Compilation errors**: Ensure your contracts compile with `forge build`.

3. **Verification fails**: Check that compiler settings match your deployment settings.

4. **No balance**: Ensure deployer wallet has ETH for gas fees.

5. **Foundry not installed**: The tool will detect this and provide installation instructions.
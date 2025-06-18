# Token Approval Management Script

## Overview

The `setup-approvals.js` script provides comprehensive management of ERC20 token approvals for the AtomicMultiSend contract. This script is essential for:

- Initial setup after deployment
- Manual approval management
- Debugging approval issues
- Monitoring token balances and allowances

## Installation

No additional installation required. The script uses the existing project dependencies.

## Usage

```bash
node scripts/setup-approvals.js <command> [token] [amount]
```

### Commands

#### Check Approvals

Check the current approval status for all tokens or a specific token:

```bash
# Check all tokens
node scripts/setup-approvals.js check

# Check specific token by symbol
node scripts/setup-approvals.js check WBTC

# Check specific token by address
node scripts/setup-approvals.js check 0xe2D7606B61B2FA3Be1cf7D3FA5FbCfB1D59d3a45
```

#### Approve Tokens

Approve tokens for the AtomicMultiSend contract to spend:

```bash
# Approve all tokens to default amounts (1M tokens or 1000x faucet amount)
node scripts/setup-approvals.js approve

# Approve specific token to default amount
node scripts/setup-approvals.js approve WBTC

# Approve specific amount for specific token
node scripts/setup-approvals.js approve WBTC 50000

# Approve maximum amount (2^256-1) for all tokens
node scripts/setup-approvals.js approve-max

# Approve maximum amount for specific token
node scripts/setup-approvals.js approve-max USDT
```

#### Revoke Approvals

Revoke approvals by setting allowance to 0:

```bash
# Revoke all token approvals
node scripts/setup-approvals.js revoke

# Revoke specific token approval
node scripts/setup-approvals.js revoke PEPE
```

#### Check Balances

Check token balances in the faucet wallet:

```bash
node scripts/setup-approvals.js balance
```

#### Help

Display help information:

```bash
node scripts/setup-approvals.js help
```

## Features

### Color-Coded Output

The script uses color coding for better readability:
- 🟢 Green: Sufficient balances/allowances
- 🟡 Yellow: Warnings or low balances
- 🔴 Red: Errors or zero balances
- 🔵 Cyan: Token names and headers

### Comprehensive Information

For each token, the script displays:
- Token name and symbol
- Contract address
- Decimals
- Total supply
- Faucet wallet balance
- Current allowance
- Sufficiency for faucet operations

### Automatic Report Generation

After each operation, the script generates a JSON report with:
- Timestamp
- Command executed
- Network information
- Detailed results

Reports are saved as: `approval-report-<command>-<timestamp>.json`

### Smart Defaults

- Default approval: 1 million tokens or 1000x faucet amount (whichever is larger)
- Automatic sufficiency check based on faucet configuration
- Skip approval if current allowance is already sufficient

## Examples

### Initial Setup

After deploying contracts, approve all tokens:

```bash
node scripts/setup-approvals.js approve
```

### Daily Monitoring

Check approval status as part of daily operations:

```bash
node scripts/setup-approvals.js check
```

### Troubleshooting

If a specific token is failing, check and re-approve:

```bash
# Check specific token
node scripts/setup-approvals.js check WBTC

# If insufficient, approve more
node scripts/setup-approvals.js approve WBTC 1000000
```

### Emergency Revocation

If needed, revoke all approvals:

```bash
node scripts/setup-approvals.js revoke
```

## Integration with Faucet

The script integrates with the faucet configuration:

1. Reads token configuration from `tokens.json`
2. Uses secure key management from `config.js`
3. Connects to the configured EVM endpoint
4. Works with the AtomicMultiSend contract address

## Error Handling

The script includes robust error handling:
- Validates token existence in configuration
- Handles contract interaction errors
- Provides detailed error messages
- Continues processing other tokens if one fails

## Security Considerations

1. **Private Key**: Uses secure key management from the main config
2. **Approval Amounts**: Be careful with `approve-max` as it grants unlimited spending
3. **Network**: Always verify you're on the correct network before approving
4. **Reports**: Generated reports may contain sensitive information

## Troubleshooting

### Common Issues

1. **"Token not found"**: Ensure the token symbol matches the configuration in `tokens.json`
2. **"Insufficient balance"**: The faucet wallet needs tokens before approving
3. **"Transaction failed"**: Check gas settings and network connectivity
4. **"Already sufficient"**: The script skips tokens with adequate allowances

### Debug Mode

For more detailed output, check the generated report files which contain:
- Full transaction hashes
- Block numbers
- Exact allowance amounts
- Error stack traces

## Best Practices

1. **Regular Monitoring**: Run `check` command regularly to monitor allowances
2. **Conservative Approvals**: Avoid `approve-max` unless necessary
3. **Backup Reports**: Keep approval reports for audit trails
4. **Balance Checks**: Run `balance` before approving to ensure sufficient funds
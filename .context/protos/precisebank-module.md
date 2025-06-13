# PreciseBank Module Documentation

## Overview
The PreciseBank module provides precise fractional balance tracking for accounts, enabling sub-unit denomination precision beyond standard Cosmos SDK integer coin amounts.

## Transaction Methods
The PreciseBank module does not expose any transaction methods. All operations are handled internally by the module or through other modules.

## Query Methods

### Remainder
Retrieves the total unbacked fractional amount in the system.

```protobuf
message QueryRemainderRequest {}

message QueryRemainderResponse {
  string remainder = 1;  // Total unbacked fractional amount
}
```

**Usage:**
The remainder represents fractional amounts that exist in the system but are not backed by whole unit coins. This is used for internal accounting and system integrity verification.

### FractionalBalance
Retrieves the fractional balance for a specific account.

```protobuf
message QueryFractionalBalanceRequest {
  string address = 1;  // Account address (bech32 format)
}

message QueryFractionalBalanceResponse {
  FractionalBalance fractional_balance = 1;
}
```

**Usage Example:**
```json
{
  "address": "cosmos1abc123def456ghi789jkl012mno345pqr678stu"
}
```

**Response:**
```json
{
  "fractional_balance": {
    "address": "cosmos1abc123def456ghi789jkl012mno345pqr678stu",
    "amount": "500000000000000000"
  }
}
```

## Core Types

### FractionalBalance
Represents an account's fractional balance.

```protobuf
message FractionalBalance {
  string address = 1;  // Account address
  string amount = 2;   // Fractional amount (math.Int as string)
}
```

**Field Details:**
- `address`: Bech32-encoded account address
- `amount`: Fractional balance as a string representation of math.Int (supports arbitrary precision)

## Genesis State

```protobuf
message GenesisState {
  repeated FractionalBalance balances = 1;  // Initial fractional balances
  string remainder = 2;                     // Initial unbacked fractional amount
}
```

**Genesis Configuration Example:**
```json
{
  "balances": [
    {
      "address": "cosmos1user1address",
      "amount": "750000000000000000"
    },
    {
      "address": "cosmos1user2address", 
      "amount": "250000000000000000"
    }
  ],
  "remainder": "0"
}
```

## Precision and Units

### Fractional Unit Scale
The module operates with a precision scale where:
- 1 full unit = 10^18 fractional units (similar to wei in Ethereum)
- Fractional balances are stored as integers representing the smallest units
- Supports sub-unit precision for enhanced financial operations

### Example Precision:
```
1.5 tokens = 1500000000000000000 fractional units
0.000000000000000001 tokens = 1 fractional unit
0.5 tokens = 500000000000000000 fractional units
```

## Integration Notes

### Module Interactions
- **Bank Module**: Interfaces with Cosmos SDK bank module for whole unit operations
- **EVM Module**: Provides precise balance tracking for EVM operations
- **ERC20 Module**: Enables precise token conversion calculations

### Use Cases
1. **Micro-transactions**: Handle very small token amounts with precision
2. **DeFi Operations**: Precise calculations for swaps, lending, interest
3. **Cross-chain Transfers**: Maintain precision across different decimal systems
4. **Fee Calculations**: Accurate fee distribution and remainder handling

### Accounting Invariants
- Sum of all fractional balances + remainder = total fractional supply
- Remainder tracks unbacked fractional amounts for system integrity
- Fractional balances never exceed whole unit boundaries

### Internal Operations
The module handles:
- Addition/subtraction of fractional amounts
- Conversion between fractional and whole units
- Remainder tracking and management
- Balance validation and integrity checks

## Querying Examples

### Check Account Fractional Balance
```bash
# Query specific account
curl -X GET "localhost:1317/cosmos/evm/precisebank/v1/fractional_balance/cosmos1abc123def456"

# Response
{
  "fractional_balance": {
    "address": "cosmos1abc123def456",
    "amount": "500000000000000000"
  }
}
```

### Check System Remainder
```bash
# Query total remainder
curl -X GET "localhost:1317/cosmos/evm/precisebank/v1/remainder"

# Response
{
  "remainder": "0"
}
```

## System Integrity

### Validation Rules
- Fractional balances must be non-negative
- Remainder must account for all unbacked fractions
- Total fractional supply must be consistent
- Account balances cannot exceed maximum precision

### Monitoring
- Track remainder changes for anomalies
- Monitor large fractional balance accumulations
- Verify sum of balances + remainder consistency
- Audit fractional to whole unit conversions

This module ensures precise financial operations while maintaining system integrity and enabling advanced DeFi functionality within the Cosmos-EVM ecosystem.
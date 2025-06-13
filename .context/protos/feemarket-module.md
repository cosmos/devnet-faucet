# FeeMarket Module Documentation

## Overview
The FeeMarket module implements EIP-1559 dynamic fee market functionality, providing base fee calculation and gas price adjustments based on network congestion.

## Transaction Methods

### UpdateParams (Governance)
Updates feemarket module parameters via governance proposal.

```protobuf
message MsgUpdateParams {
  string authority = 1;  // Governance module account address
  Params params = 2;     // New feemarket parameters
}
```

**Usage Example:**
```json
{
  "authority": "cosmos10d07y265gmmuvt4z0w9aw880jnsr700j6zn9kn",
  "params": {
    "no_base_fee": false,
    "base_fee_change_denominator": 8,
    "elasticity_multiplier": 2,
    "enable_height": 1,
    "base_fee": "1000000000",
    "min_gas_price": "0.0025",
    "min_gas_multiplier": "0.5"
  }
}
```

## Query Methods

### Params
Retrieves feemarket module parameters.

```protobuf
message QueryParamsRequest {}

message QueryParamsResponse {
  Params params = 1;
}
```

### BaseFee
Retrieves the current EIP-1559 base fee per gas.

```protobuf
message QueryBaseFeeRequest {}

message QueryBaseFeeResponse {
  string base_fee = 1;  // Base fee in wei
}
```

### BlockGas
Retrieves gas consumption information for tracking fee adjustments.

```protobuf
message QueryBlockGasRequest {}

message QueryBlockGasResponse {
  int64 gas = 1;  // Gas used in current block context
}
```

## Core Types

### Params
FeeMarket module configuration parameters.

```protobuf
message Params {
  bool no_base_fee = 1;                      // Disable base fee calculation
  uint32 base_fee_change_denominator = 2;    // Base fee adjustment rate (default: 8)
  uint32 elasticity_multiplier = 3;          // Gas limit elasticity (default: 2)
  int64 enable_height = 5;                   // Height to enable fee market
  string base_fee = 6;                       // Initial base fee (wei)
  string min_gas_price = 7;                  // Minimum gas price
  string min_gas_multiplier = 8;             // Minimum gas price multiplier
}
```

**Parameter Details:**
- `no_base_fee`: When true, disables EIP-1559 base fee mechanism
- `base_fee_change_denominator`: Controls base fee adjustment rate (8 = 12.5% max change)
- `elasticity_multiplier`: Gas limit flexibility (2 = double the target gas)
- `enable_height`: Block height to activate fee market (0 = genesis)
- `base_fee`: Starting base fee in wei (e.g., "1000000000" = 1 Gwei)
- `min_gas_price`: Minimum gas price in native token units
- `min_gas_multiplier`: Multiplier for minimum gas price calculation

## Events

### EventFeeMarket
Emitted when base fee is updated.

```protobuf
message EventFeeMarket {
  string base_fee = 1;  // New base fee value
}
```

### EventBlockGas
Emitted to track block gas consumption.

```protobuf
message EventBlockGas {
  string height = 1;  // Block height
  string amount = 2;  // Gas amount used
}
```

## Genesis State

```protobuf
message GenesisState {
  Params params = 1;     // Initial feemarket parameters
  uint64 block_gas = 3;  // Initial block gas consumption
}
```

## EIP-1559 Implementation

### Base Fee Calculation
The base fee is calculated using the EIP-1559 formula:

```
if parent_gas_used == parent_gas_target:
    new_base_fee = parent_base_fee
elif parent_gas_used > parent_gas_target:
    gas_used_delta = parent_gas_used - parent_gas_target
    base_fee_delta = max(1, parent_base_fee * gas_used_delta / parent_gas_target / base_fee_change_denominator)
    new_base_fee = parent_base_fee + base_fee_delta
else:
    gas_used_delta = parent_gas_target - parent_gas_used
    base_fee_delta = parent_base_fee * gas_used_delta / parent_gas_target / base_fee_change_denominator
    new_base_fee = parent_base_fee - base_fee_delta
```

### Gas Target and Limit
- **Gas Target**: `block_gas_limit / elasticity_multiplier`
- **Gas Limit**: Maximum gas per block
- **Elasticity**: Allows blocks to use up to `elasticity_multiplier` times the target

### Fee Structure
For EIP-1559 transactions:
- **Priority Fee**: Goes to validators as tips
- **Base Fee**: Burned to reduce token supply
- **Max Fee**: Maximum total fee per gas willing to pay
- **Effective Fee**: `min(base_fee + priority_fee, max_fee)`

## Integration with VM Module

The FeeMarket module integrates closely with the VM module:

1. **Transaction Validation**: VM module checks fees against base fee
2. **Fee Calculation**: Base fee used in EIP-1559 transaction processing
3. **Gas Tracking**: Block gas consumption tracked for base fee updates
4. **Fee Burning**: Base fees are burned during transaction execution

## Configuration Examples

### Mainnet Configuration
```json
{
  "no_base_fee": false,
  "base_fee_change_denominator": 8,
  "elasticity_multiplier": 2,
  "enable_height": 1,
  "base_fee": "1000000000",
  "min_gas_price": "0.0025",
  "min_gas_multiplier": "0.5"
}
```

### Testnet Configuration
```json
{
  "no_base_fee": false,
  "base_fee_change_denominator": 8,
  "elasticity_multiplier": 2,
  "enable_height": 1,
  "base_fee": "7",
  "min_gas_price": "0.0025",
  "min_gas_multiplier": "0.5"
}
```

### Development (No Base Fee)
```json
{
  "no_base_fee": true,
  "base_fee_change_denominator": 8,
  "elasticity_multiplier": 2,
  "enable_height": 1,
  "base_fee": "0",
  "min_gas_price": "0",
  "min_gas_multiplier": "1"
}
```

## Usage Notes

- Base fee adjusts automatically based on network congestion
- Higher gas usage increases base fee for next block
- Lower gas usage decreases base fee for next block
- Minimum gas price provides floor for transaction fees
- Can be disabled for development environments
- Governance can update parameters via proposals
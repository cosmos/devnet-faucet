# ERC20 Module Documentation

## Overview
The ERC20 module enables bidirectional conversion between Cosmos SDK native coins and ERC20 tokens, providing seamless interoperability between Cosmos and Ethereum ecosystems.

## Transaction Methods

### ConvertERC20
Converts ERC20 tokens to Cosmos native coins.

```protobuf
message MsgConvertERC20 {
  string contract_address = 1;  // ERC20 contract address (0x...)
  string amount = 2;            // Amount in wei (math.Int as string)
  string receiver = 3;          // Bech32 cosmos address
  string sender = 4;            // Ethereum hex address (0x...)
}
```

**Usage Example:**
```json
{
  "contract_address": "0x1234567890123456789012345678901234567890",
  "amount": "1000000000000000000",
  "receiver": "cosmos1abc123def456...",
  "sender": "0xabcdef1234567890abcdef1234567890abcdef12"
}
```

### ConvertCoin
Converts Cosmos native coins to ERC20 tokens.

```protobuf
message MsgConvertCoin {
  cosmos.base.v1beta1.Coin coin = 1;  // Cosmos coin with denom and amount
  string receiver = 2;                // Ethereum hex address (0x...)
  string sender = 3;                  // Bech32 cosmos address
}
```

**Usage Example:**
```json
{
  "coin": {
    "denom": "aevmos",
    "amount": "1000000000000000000"
  },
  "receiver": "0xabcdef1234567890abcdef1234567890abcdef12",
  "sender": "cosmos1abc123def456..."
}
```

### UpdateParams (Governance)
Updates module parameters via governance proposal.

```protobuf
message MsgUpdateParams {
  string authority = 1;  // Governance module account
  Params params = 2;     // New parameters
}
```

### RegisterERC20 (Governance)
Registers ERC20 contracts for conversion.

```protobuf
message MsgRegisterERC20 {
  string signer = 1;                    // Proposer address
  repeated string erc20addresses = 2;   // ERC20 contract addresses
}
```

### ToggleConversion (Governance)
Enables or disables token conversion for specific tokens.

```protobuf
message MsgToggleConversion {
  string authority = 1;  // Governance module account
  string token = 2;      // Token identifier (contract address or denom)
}
```

## Query Methods

### TokenPairs
Retrieves all registered token pairs with pagination.

```protobuf
message QueryTokenPairsRequest {
  cosmos.base.query.v1beta1.PageRequest pagination = 1;
}

message QueryTokenPairsResponse {
  repeated TokenPair token_pairs = 1;
  cosmos.base.query.v1beta1.PageResponse pagination = 2;
}
```

### TokenPair
Retrieves a specific token pair by identifier.

```protobuf
message QueryTokenPairRequest {
  string token = 1;  // Contract address or cosmos denom
}

message QueryTokenPairResponse {
  TokenPair token_pair = 1;
}
```

### Params
Retrieves module parameters.

```protobuf
message QueryParamsRequest {}

message QueryParamsResponse {
  Params params = 1;
}
```

## Core Types

### TokenPair
Represents the mapping between ERC20 and Cosmos tokens.

```protobuf
message TokenPair {
  string erc20_address = 1;  // ERC20 contract address
  string denom = 2;          // Cosmos coin denomination
  bool enabled = 3;          // Conversion enabled status
  Owner contract_owner = 4;  // Contract ownership (OWNER_MODULE/OWNER_EXTERNAL)
}
```

### Allowance
Manages ERC20 allowances for the precompile contract.

```protobuf
message Allowance {
  string spender = 1;  // Spender address
  string owner = 2;    // Owner address  
  string amount = 3;   // Allowance amount
}
```

### Params
Module configuration parameters.

```protobuf
message Params {
  bool enable_erc20 = 1;             // Enable ERC20 functionality
  bool enable_evm_hook = 2;          // Enable EVM hooks
  repeated string native_precompiles = 3;  // Native precompile addresses
}
```

## Events

### EventRegisterPair
Emitted when a new token pair is registered.

```protobuf
message EventRegisterPair {
  string denom = 1;
  string erc20_address = 2;
}
```

### EventToggleTokenConversion
Emitted when token conversion is toggled.

```protobuf
message EventToggleTokenConversion {
  string denom = 1;
  string erc20_address = 2;
}
```

### EventConvertCoin
Emitted when Cosmos coins are converted to ERC20.

```protobuf
message EventConvertCoin {
  string sender = 1;
  string receiver = 2;
  string amount = 3;
  string denom = 4;
  string erc20_address = 5;
}
```

### EventConvertERC20
Emitted when ERC20 tokens are converted to Cosmos coins.

```protobuf
message EventConvertERC20 {
  string sender = 1;
  string receiver = 2;
  string amount = 3;
  string denom = 4;
  string contract_address = 5;
}
```

## Genesis State

```protobuf
message GenesisState {
  Params params = 1;                      // Module parameters
  repeated TokenPair token_pairs = 2;     // Registered token pairs
  repeated Allowance allowances = 3;      // ERC20 allowances
}
```

## Integration Notes

- Token pairs must be registered before conversion
- Conversion can be disabled per token via governance
- ERC20 contracts can be module-owned or externally-owned
- Supports both directions: Cosmos ↔ ERC20
- Maintains allowance state for precompile interactions
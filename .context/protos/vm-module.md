# VM Module Documentation

## Overview
The VM module provides the core Ethereum Virtual Machine (EVM) functionality, enabling execution of Ethereum transactions and smart contracts within the Cosmos SDK framework.

## Transaction Methods

### EthereumTx
Submits Ethereum transactions for execution in the EVM.

```protobuf
message MsgEthereumTx {
  google.protobuf.Any data = 1;  // Transaction data (LegacyTx/AccessListTx/DynamicFeeTx)
  double size = 2;               // Encoded size (deprecated)
  string hash = 3;               // Transaction hash
  string from = 4;               // Sender address
}
```

**Supported Transaction Types:**

#### LegacyTx (Pre-EIP-2930)
```protobuf
message LegacyTx {
  uint64 nonce = 1;
  string gas_price = 2;  // Gas price in wei
  uint64 gas = 3;        // Gas limit
  string to = 4;         // Recipient address (empty for contract creation)
  string value = 5;      // Value in wei
  bytes data = 6;        // Transaction data/bytecode
  bytes v = 7;           // Signature recovery ID
  bytes r = 8;           // Signature R value
  bytes s = 9;           // Signature S value
}
```

#### AccessListTx (EIP-2930)
```protobuf
message AccessListTx {
  string chain_id = 1;
  uint64 nonce = 2;
  string gas_price = 3;
  uint64 gas = 4;
  string to = 5;
  string value = 6;
  bytes data = 7;
  repeated AccessTuple accesses = 8;  // Pre-warmed storage slots
  bytes v = 9;
  bytes r = 10;
  bytes s = 11;
}
```

#### DynamicFeeTx (EIP-1559)
```protobuf
message DynamicFeeTx {
  string chain_id = 1;
  uint64 nonce = 2;
  string gas_tip_cap = 3;   // Max priority fee per gas
  string gas_fee_cap = 4;   // Max fee per gas
  uint64 gas = 5;
  string to = 6;
  string value = 7;
  bytes data = 8;
  repeated AccessTuple accesses = 9;
  bytes v = 10;
  bytes r = 11;
  bytes s = 12;
}
```

#### AccessTuple
```protobuf
message AccessTuple {
  string address = 1;           // Contract address
  repeated string storage_keys = 2;  // Storage slot keys
}
```

### UpdateParams (Governance)
Updates VM module parameters.

```protobuf
message MsgUpdateParams {
  string authority = 1;  // Governance module account
  Params params = 2;     // New VM parameters
}
```

## Query Methods

### Account
Retrieves Ethereum account information.

```protobuf
message QueryAccountRequest {
  string address = 1;  // Ethereum address (0x...)
}

message QueryAccountResponse {
  uint64 balance = 1;
  uint64 code_hash = 2;
  uint64 nonce = 3;
}
```

### CosmosAccount
Converts Ethereum address to Cosmos address.

```protobuf
message QueryCosmosAccountRequest {
  string address = 1;  // Ethereum address
}

message QueryCosmosAccountResponse {
  string cosmos_address = 1;  // Bech32 cosmos address
  uint64 sequence = 2;
  uint64 account_number = 3;
}
```

### ValidatorAccount
Retrieves account from validator consensus address.

```protobuf
message QueryValidatorAccountRequest {
  string cons_address = 1;  // Validator consensus address
}

message QueryValidatorAccountResponse {
  string account_address = 1;
  uint64 sequence = 2;
  uint64 account_number = 3;
}
```

### Balance
Retrieves account balance in EVM denomination.

```protobuf
message QueryBalanceRequest {
  string address = 1;  // Account address
}

message QueryBalanceResponse {
  string balance = 1;  // Balance in wei
}
```

### Storage
Retrieves contract storage value.

```protobuf
message QueryStorageRequest {
  string address = 1;  // Contract address
  string key = 2;      // Storage key
}

message QueryStorageResponse {
  string value = 1;  // Storage value
}
```

### Code
Retrieves contract bytecode.

```protobuf
message QueryCodeRequest {
  string address = 1;  // Contract address
}

message QueryCodeResponse {
  bytes code = 1;  // Contract bytecode
}
```

### EthCall
Executes `eth_call` RPC method.

```protobuf
message EthCallRequest {
  bytes args = 1;           // Call arguments (ABI encoded)
  uint64 gas_cap = 2;       // Gas limit for call
  int64 proposer_address = 3;  // Block proposer
  int64 chain_id = 4;       // Chain ID
}

message EthCallResponse {
  bytes ret = 1;  // Return data
}
```

### EstimateGas
Executes `eth_estimateGas` RPC method.

```protobuf
message EthCallRequest {
  bytes args = 1;
  uint64 gas_cap = 2;
  int64 proposer_address = 3;
  int64 chain_id = 4;
}

message EstimateGasResponse {
  uint64 gas = 1;  // Estimated gas usage
}
```

### TraceTx
Executes `debug_traceTransaction` RPC method.

```protobuf
message QueryTraceTxRequest {
  MsgEthereumTx msg = 1;           // Transaction to trace
  uint64 tx_index = 2;             // Transaction index in block
  repeated MsgEthereumTx predecessors = 3;  // Previous transactions
  int64 block_number = 4;          // Block number
  string block_hash = 5;           // Block hash
  uint64 block_time = 6;           // Block timestamp
  int64 proposer_address = 7;      // Block proposer
  int64 chain_id = 8;              // Chain ID
  bool block_max_gas = 9;          // Use block gas limit
}

message QueryTraceTxResponse {
  bytes data = 1;  // Trace data
}
```

### TraceBlock
Executes `debug_traceBlock` RPC method.

```protobuf
message QueryTraceBlockRequest {
  repeated MsgEthereumTx txs = 1;  // Block transactions
  uint64 block_number = 2;
  string block_hash = 3;
  uint64 block_time = 4;
  int64 proposer_address = 5;
  int64 chain_id = 6;
  bool block_max_gas = 7;
}

message QueryTraceBlockResponse {
  bytes data = 1;  // Block trace data
}
```

### BaseFee
Retrieves current EIP-1559 base fee.

```protobuf
message QueryBaseFeeRequest {}

message QueryBaseFeeResponse {
  string base_fee = 1;  // Base fee in wei
}
```

### Config
Retrieves EVM chain configuration.

```protobuf
message QueryConfigRequest {}

message QueryConfigResponse {
  ChainConfig config = 1;
}
```

### GlobalMinGasPrice
Retrieves global minimum gas price.

```protobuf
message QueryGlobalMinGasPriceRequest {}

message QueryGlobalMinGasPriceResponse {
  string global_min_gas_price = 1;
}
```

### Params
Retrieves VM module parameters.

```protobuf
message QueryParamsRequest {}

message QueryParamsResponse {
  Params params = 1;
}
```

## Core Types

### Params
VM module configuration.

```protobuf
message Params {
  string evm_denom = 1;                    // EVM denomination
  bool enable_create = 2;                  // Enable contract creation
  bool enable_call = 3;                    // Enable contract calls
  repeated string extra_eips = 4;          // Additional EIPs to enable
  ChainConfig chain_config = 5;            // Ethereum chain configuration
  repeated AccessControl allow_unprotected_txs = 6;  // Access control
  bool access_control_enabled = 7;         // Enable access control
  string evm_channels = 8;                 // IBC channels for EVM
}
```

### ChainConfig
Ethereum hard fork configuration.

```protobuf
message ChainConfig {
  string chain_id = 1;
  int64 homestead_block = 2;
  int64 dao_fork_block = 3;
  bool dao_fork_support = 4;
  int64 eip150_block = 5;
  string eip150_hash = 6;
  int64 eip155_block = 7;
  int64 eip158_block = 8;
  int64 byzantium_block = 9;
  int64 constantinople_block = 10;
  int64 petersburg_block = 11;
  int64 istanbul_block = 12;
  int64 muir_glacier_block = 13;
  int64 berlin_block = 14;
  int64 london_block = 15;
  int64 arrow_glacier_block = 16;
  int64 gray_glacier_block = 17;
  int64 merge_netsplit_block = 18;
  int64 shanghai_block = 19;
  int64 cancun_block = 20;
}
```

### AccessControl
Permission control for transactions.

```protobuf
message AccessControl {
  AccessType access_type = 1;     // RESTRICTED/UNRESTRICTED
  repeated string addresses = 2;  // Allowed/denied addresses
}

enum AccessType {
  ACCESS_TYPE_UNSPECIFIED = 0;
  ACCESS_TYPE_RESTRICTED = 1;
  ACCESS_TYPE_UNRESTRICTED = 2;
}
```

### State
Storage key-value pairs.

```protobuf
message State {
  string key = 1;    // Storage key
  string value = 2;  // Storage value
}
```

### Log
Ethereum event log.

```protobuf
message Log {
  string address = 1;          // Contract address
  repeated string topics = 2;  // Event topics
  bytes data = 3;              // Event data
  uint64 block_number = 4;     // Block number
  string tx_hash = 5;          // Transaction hash
  uint64 tx_index = 6;         // Transaction index
  string block_hash = 7;       // Block hash
  uint64 index = 8;            // Log index
  bool removed = 9;            // Log removed flag
}
```

### TxResult
Transaction execution result.

```protobuf
message TxResult {
  string contract_address = 1;  // Created contract address
  bytes bloom = 2;              // Bloom filter
  uint64 tx_logs = 3;           // Transaction logs
  bytes ret = 4;                // Return data
  uint64 reverted = 5;          // Revert flag
  uint64 gas_used = 6;          // Gas consumed
}
```

## Events

### EventEthereumTx
Emitted for Ethereum transaction execution.

```protobuf
message EventEthereumTx {
  string amount = 1;
  string eth_hash = 2;
  string index = 3;
  string gas_used = 4;
  string hash = 5;
  string recipient = 6;
  string eth_tx_failed = 7;
}
```

### EventTxLog
Emitted for transaction logs.

```protobuf
message EventTxLog {
  repeated string tx_logs = 1;
}
```

### EventMessage
Generic message event.

```protobuf
message EventMessage {
  string module = 1;
  string sender = 2;
  string tx_type = 3;
}
```

### EventBlockBloom
Block bloom filter event.

```protobuf
message EventBlockBloom {
  string bloom = 1;
}
```

## Genesis State

```protobuf
message GenesisState {
  repeated GenesisAccount accounts = 1;  // Genesis accounts
  Params params = 2;                     // Module parameters
}

message GenesisAccount {
  string address = 1;       // Account address
  string code = 2;          // Contract code
  repeated State storage = 3;  // Storage state
}
```

## Integration Notes

- Supports all major Ethereum transaction types
- Full JSON-RPC compatibility for Web3 providers
- Transaction tracing and debugging capabilities
- EIP-1559 fee market integration
- Access control for restricted environments
- IBC integration for cross-chain operations
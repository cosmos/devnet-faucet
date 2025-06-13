# Types Module Documentation

## Overview
The Types module provides common data structures and utilities for EVM integration, including Web3 compatibility extensions, dynamic fee transaction support, and Ethereum transaction indexing.

## Extension Options

### ExtensionOptionDynamicFeeTx
Enables EIP-1559 max priority fee specification for transactions.

```protobuf
message ExtensionOptionDynamicFeeTx {
  string max_priority_price = 1;  // Maximum priority fee per gas (wei)
}
```

**Usage:**
- Used in EIP-1559 dynamic fee transactions
- Specifies maximum priority tip for validators
- Allows users to incentivize faster transaction inclusion
- Must be used with `DynamicFeeTx` transaction type

**Example:**
```json
{
  "max_priority_price": "2000000000"  // 2 Gwei priority fee
}
```

### ExtensionOptionsWeb3Tx
Provides Web3 and MetaMask compatibility features.

```protobuf
message ExtensionOptionsWeb3Tx {
  uint64 typed_data_chain_id = 1;  // Chain ID for EIP-712 typed data
  string fee_payer = 2;            // Alternative fee payer address
  bytes fee_payer_sig = 3;         // Fee payer signature
}
```

**Field Details:**
- `typed_data_chain_id`: Chain ID used for EIP-712 typed data signing (may differ from transaction chain ID)
- `fee_payer`: Alternative account to pay transaction fees (meta-transaction support)
- `fee_payer_sig`: Signature from the fee payer authorizing fee payment

**Use Cases:**
1. **Meta-transactions**: Allow third parties to pay gas fees
2. **EIP-712 Compatibility**: Support for structured data signing
3. **Cross-chain Operations**: Handle different chain IDs in multi-chain scenarios
4. **Gasless Transactions**: Enable user transactions without native token holdings

**Example:**
```json
{
  "typed_data_chain_id": 9001,
  "fee_payer": "0x742d35Cc6635C0532925a3b8D4cD49A83b8c4F3d",
  "fee_payer_sig": "0x1234567890abcdef..."
}
```

## Indexer Types

### TxResult
Comprehensive transaction indexing data for Ethereum compatibility.

```protobuf
message TxResult {
  int64 height = 1;                // Block height
  uint32 tx_index = 2;             // Transaction index in block
  uint32 msg_index = 3;            // Message index in transaction
  int32 eth_tx_index = 4;          // Ethereum-specific transaction index
  bool failed = 5;                 // Transaction failure status
  uint64 gas_used = 6;             // Gas consumed by transaction
  uint64 cumulative_gas_used = 7;  // Cumulative gas used in block
}
```

**Field Details:**
- `height`: Cosmos block height where transaction was included
- `tx_index`: Position of transaction within the block (0-based)
- `msg_index`: Position of message within the transaction (0-based)
- `eth_tx_index`: Ethereum-compatible transaction index (-1 if not applicable)
- `failed`: Whether the transaction execution failed
- `gas_used`: Gas units consumed by this specific transaction
- `cumulative_gas_used`: Total gas consumed up to and including this transaction

**Indexing Purpose:**
- Enables efficient transaction lookups
- Supports Ethereum JSON-RPC compatibility
- Facilitates block explorers and analytics
- Provides gas usage tracking for fee calculations

## Integration Examples

### EIP-1559 Transaction with Extensions
```protobuf
// Transaction with dynamic fee extension
message Tx {
  repeated google.protobuf.Any messages = 1;
  AuthInfo auth_info = 2;
  repeated bytes signatures = 3;
  repeated google.protobuf.Any extension_options = 4;  // Contains ExtensionOptionDynamicFeeTx
}
```

### Web3 Meta-Transaction
```protobuf
// Transaction with Web3 extension for meta-transactions
message Tx {
  repeated google.protobuf.Any messages = 1;
  AuthInfo auth_info = 2;
  repeated bytes signatures = 3;
  repeated google.protobuf.Any extension_options = 4;  // Contains ExtensionOptionsWeb3Tx
}
```

### Transaction Indexing Flow
```
1. Transaction executed in EVM
2. TxResult created with execution details
3. Indexed by height, tx_index, and eth_tx_index
4. Stored for JSON-RPC query compatibility
5. Used for receipt generation and block explorer data
```

## EIP-712 Typed Data Support

The Web3 extension supports EIP-712 structured data signing:

### Domain Separator
```json
{
  "name": "Cosmos Web3",
  "version": "1.0.0", 
  "chainId": 9001,
  "verifyingContract": "cosmos",
  "salt": "0x0000000000000000000000000000000000000000000000000000000000000000"
}
```

### Message Types
```json
{
  "Tx": [
    {"name": "account_number", "type": "uint256"},
    {"name": "chain_id", "type": "uint256"},
    {"name": "fee", "type": "Fee"},
    {"name": "memo", "type": "string"},
    {"name": "msgs", "type": "Msg[]"},
    {"name": "sequence", "type": "uint256"}
  ]
}
```

## Gas Tracking and Indexing

### Gas Usage Patterns
- **Individual Transaction**: Track gas per message execution
- **Cumulative Block**: Running total for JSON-RPC compatibility
- **Failed Transactions**: Record gas consumed even on failure
- **EVM vs Cosmos**: Separate tracking for different execution contexts

### Block Gas Accounting
```
Block Gas Limit: 30,000,000
Transaction 1: 21,000 gas (cumulative: 21,000)
Transaction 2: 50,000 gas (cumulative: 71,000)  
Transaction 3: 100,000 gas (cumulative: 171,000)
```

## JSON-RPC Compatibility

The indexing system enables full Ethereum JSON-RPC support:

### Transaction Receipts
- Transaction hash lookup
- Block number and transaction index
- Gas usage and cumulative gas usage  
- Success/failure status
- Event logs and bloom filters

### Block Information
- Transaction count and indices
- Total gas used and gas limit
- Transaction ordering and execution results

## Meta-Transaction Support

### Fee Delegation Flow
1. User creates transaction without sufficient gas token
2. Fee payer signs authorization for gas payment
3. Transaction includes Web3 extension with fee payer details
4. Network validates both user and fee payer signatures
5. Gas fees deducted from fee payer account
6. Transaction executed on behalf of user

### Security Considerations
- Fee payer signature must authorize specific transaction
- Replay protection via nonces and chain IDs
- Gas limit enforcement prevents abuse
- Signature validation for both parties required

## Usage in Other Modules

### VM Module Integration
- Extension options processed during transaction execution
- Gas tracking feeds into fee market calculations
- Indexing data used for JSON-RPC query responses

### FeeMarket Module Integration
- Gas usage data influences base fee calculations
- Priority fees from dynamic fee extensions affect validator rewards
- Cumulative gas tracking enables EIP-1559 target calculations

### ERC20 Module Integration
- Meta-transactions enable gasless token operations
- EIP-712 support for token approval signatures
- Cross-chain operations with different typed data chain IDs

This module provides essential infrastructure for Ethereum compatibility, enabling advanced features like meta-transactions, EIP-1559 dynamic fees, and comprehensive transaction indexing within the Cosmos SDK framework.
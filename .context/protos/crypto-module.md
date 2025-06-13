# Crypto Module Documentation

## Overview
The Crypto module provides Ethereum-compatible secp256k1 cryptographic key support for the Cosmos SDK, enabling seamless integration between Ethereum and Cosmos cryptographic operations.

## Key Types

### PubKey
Ethereum secp256k1 public key implementation.

```protobuf
message PubKey {
  bytes key = 1;  // 33-byte compressed secp256k1 public key
}
```

**Field Details:**
- `key`: Compressed secp256k1 public key (33 bytes)
- Format: 0x02 or 0x03 prefix + 32-byte X coordinate
- Compatible with Ethereum address derivation

**Usage Example:**
```json
{
  "key": "A+2Y8Zqr8Y5vQJJw1l1cKl+GL4Q7t3cA8wTr4QVfkYs="
}
```

### PrivKey
Ethereum secp256k1 private key implementation.

```protobuf
message PrivKey {
  bytes key = 1;  // 32-byte secp256k1 private key
}
```

**Field Details:**
- `key`: Raw secp256k1 private key (32 bytes)
- Must be within valid secp256k1 curve order
- Used for transaction signing and key derivation

**Security Note:** Private keys should never be transmitted or stored in plaintext.

## Key Operations

### Address Derivation
Ethereum addresses are derived from public keys using the standard Ethereum process:

1. Take the uncompressed public key (64 bytes, without 0x04 prefix)
2. Apply Keccak256 hash function
3. Take the last 20 bytes as the Ethereum address
4. Convert to Cosmos bech32 format for Cosmos SDK operations

### Key Generation
Keys follow standard secp256k1 generation:
- Private key: 32 random bytes within curve order
- Public key: Scalar multiplication of private key with generator point
- Compression: Use compressed format (33 bytes) for storage efficiency

### Signature Operations
Supports Ethereum-compatible signing:
- ECDSA signature generation and verification
- EIP-155 transaction signing with chain ID
- Recovery ID calculation for public key recovery

## Integration Points

### Cosmos SDK Integration
- Implements `cryptotypes.PubKey` interface
- Implements `cryptotypes.PrivKey` interface
- Compatible with Cosmos SDK account system
- Supports HD key derivation (BIP44 path: m/44'/60'/0'/0/x)

### EVM Compatibility
- Direct compatibility with Ethereum tooling
- Support for MetaMask and other Web3 wallets
- Standard Ethereum address format
- EIP-155 transaction signing support

### Account Types
Works with various account implementations:
- Standard Cosmos accounts with Ethereum keys
- EVM accounts for direct Ethereum compatibility
- Multi-signature accounts with secp256k1 keys

## Key Format Examples

### Compressed Public Key
```
Format: 0x02 + X coordinate (32 bytes)
Example: 0x0212345678901234567890123456789012345678901234567890123456789012
Length: 33 bytes
```

### Uncompressed Public Key (for address derivation)
```
Format: 0x04 + X coordinate (32 bytes) + Y coordinate (32 bytes)
Example: 0x04123456...
Length: 65 bytes (not stored, derived as needed)
```

### Private Key
```
Format: 32 bytes scalar
Example: 0x1234567890123456789012345678901234567890123456789012345678901234
Length: 32 bytes
Range: 1 to 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364140
```

### Ethereum Address
```
Format: 20 bytes (last 20 bytes of Keccak256(uncompressed_pubkey))
Example: 0x742d35Cc6635C0532925a3b8D4cD49A83b8c4F3d
Length: 20 bytes
```

### Cosmos Address (from Ethereum address)
```
Format: Bech32 encoding of Ethereum address
Example: cosmos1wsk6hvxvsnvf2jfx6mywdffvglruqwn7ant8s5
Encoding: bech32(hrp="cosmos", address=ethereum_address)
```

## Algorithm Details

### secp256k1 Curve Parameters
- Field prime: p = 2^256 - 2^32 - 2^9 - 2^8 - 2^7 - 2^6 - 2^4 - 1
- Curve equation: y² = x³ + 7
- Generator point: G = (0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798, 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8)
- Order: n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141

### Signature Format
ECDSA signatures use the format:
- r: 32 bytes (X coordinate of signature point)
- s: 32 bytes (signature proof)
- v: 1 byte (recovery ID, for Ethereum compatibility)

### Key Derivation (BIP44)
For hierarchical deterministic (HD) wallets:
- Purpose: 44' (BIP44)
- Coin type: 60' (Ethereum)
- Account: 0' (first account)
- Change: 0 (external addresses)
- Index: 0, 1, 2... (address index)

Full path: m/44'/60'/0'/0/0 for first address

## Security Considerations

### Key Management
- Private keys must be stored securely
- Use hardware security modules (HSMs) for production
- Implement proper key rotation policies
- Never log or transmit private keys

### Randomness
- Use cryptographically secure random number generators
- Ensure sufficient entropy for key generation
- Validate generated keys are within valid range

### Side-Channel Attacks
- Use constant-time implementations
- Protect against timing attacks
- Implement proper blinding techniques

## Usage Examples

### Key Generation (Conceptual)
```go
// Generate private key
privKeyBytes := generateSecureRandom(32)
privKey := &ethsecp256k1.PrivKey{Key: privKeyBytes}

// Derive public key
pubKey := privKey.PubKey()

// Get Ethereum address
ethAddr := crypto.PubkeyToAddress(pubKey.ToECDSA())

// Get Cosmos address
cosmosAddr := sdk.AccAddress(ethAddr.Bytes())
```

### Transaction Signing (Conceptual)
```go
// Create transaction hash
txHash := crypto.Keccak256(txBytes)

// Sign with private key
sig, err := crypto.Sign(txHash, privKey.ToECDSA())

// Extract v, r, s components
v := sig[64] + 27  // Recovery ID
r := sig[0:32]     // R component
s := sig[32:64]    // S component
```

This module provides the cryptographic foundation for Ethereum compatibility within the Cosmos SDK ecosystem, enabling seamless key management and signature operations across both platforms.
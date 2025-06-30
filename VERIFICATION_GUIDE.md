# Contract Verification Guide

This guide provides instructions for verifying the faucet contracts on Blockscout.

## Contracts to Verify

1. **AtomicMultiSend**: `0x6365EAcBfb289E3B0767fD6fb1bD5d1b85E15368`
2. **WBTC**: `0x55Cc56b92b7fa0de7CDa22d263532F2910b9b17B` (Already verified - internally by Blockscout)
3. **PEPE**: `0xBCf75f81D7A74cf18a41C267443F0fF3E1A9A671`
4. **USDT**: `0xc8648a893357e9893669036Be58aFE71B8140eD6`

## Note on API Verification

The Blockscout API for this network appears to have restrictions on external contract verification submissions. The WBTC contract was verified internally by the Blockscout team. For the remaining contracts, manual verification through the web interface is recommended.

## Flattened Contracts

The flattened contracts have been generated and are available in the `flattened/` directory:
- `flattened/AtomicMultiSend_flat.sol`
- `flattened/PEPE_flat.sol`
- `flattened/USDT_flat.sol`

## Manual Verification Steps

### For AtomicMultiSend:
1. Go to: https://evm-devnet-1.cloud.blockscout.com/address/0x6365EAcBfb289E3B0767fD6fb1bD5d1b85E15368/verify-via-flattened-code
2. Contract Name: `AtomicMultiSend`
3. Compiler Version: `v0.8.28+commit.7893614a`
4. EVM Version: `istanbul`
5. Optimization: `Yes`
6. Optimization Runs: `200`
7. Via IR: `Yes`
8. License: `MIT`
9. Source Code: Copy content from `flattened/AtomicMultiSend_flat.sol`
10. Constructor Arguments: (leave empty - no constructor args)

### For PEPE Token:
1. Go to: https://evm-devnet-1.cloud.blockscout.com/address/0xBCf75f81D7A74cf18a41C267443F0fF3E1A9A671/verify-via-flattened-code
2. Contract Name: `PEPE`
3. Compiler Version: `v0.8.28+commit.7893614a`
4. EVM Version: `istanbul`
5. Optimization: `Yes`
6. Optimization Runs: `200`
7. Via IR: `Yes`
8. License: `MIT`
9. Source Code: Copy content from `flattened/PEPE_flat.sol`
10. Constructor Arguments: `000000000000000000000000c252ae330a12321a1bf7e962564acf3a1fe1fdda`

### For USDT Token:
1. Go to: https://evm-devnet-1.cloud.blockscout.com/address/0xc8648a893357e9893669036Be58aFE71B8140eD6/verify-via-flattened-code
2. Contract Name: `USDT`
3. Compiler Version: `v0.8.28+commit.7893614a`
4. EVM Version: `istanbul`
5. Optimization: `Yes`
6. Optimization Runs: `200`
7. Via IR: `Yes`
8. License: `MIT`
9. Source Code: Copy content from `flattened/USDT_flat.sol`
10. Constructor Arguments: `000000000000000000000000c252ae330a12321a1bf7e962564acf3a1fe1fdda`

## Constructor Arguments Explanation

The token contracts (PEPE, USDT) take an `address initialOwner` parameter in their constructor.
The encoded value `000000000000000000000000c252ae330a12321a1bf7e962564acf3a1fe1fdda` represents:
- Faucet Address: `0xc252ae330a12321a1bf7e962564acf3a1fe1fdda` (padded to 32 bytes)

## Verification Status

You can check the verification status at:
https://evm-devnet-1.cloud.blockscout.com/verified-contracts
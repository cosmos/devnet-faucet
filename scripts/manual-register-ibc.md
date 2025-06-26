# Manual IBC Token Registration Guide

## Current Status
- ✓ OSMO and USDC have bank metadata
- ✗ Not registered in ERC20 module
- ✓ Permissionless registration is enabled

## Registration Steps

### Option 1: Using the registration script
```bash
# Set the faucet mnemonic
export MNEMONIC="your faucet mnemonic here"

# Run the registration script
node scripts/register-ibc-standalone.js
```

### Option 2: Using cosmos CLI
```bash
# Register native coins with empty addresses (for coins with metadata)
cosmosd tx erc20 register-erc20 \
  --from faucet \
  --chain-id cosmos-devnet-1 \
  --node https://devnet-1-rpc.ib.skip.build \
  --gas auto \
  --gas-adjustment 1.5 \
  --fees 50000uatom
```

### Option 3: Direct REST API
Send a POST request to `/cosmos/tx/v1beta1/txs` with:
```json
{
  "@type": "/cosmos.evm.erc20.v1.MsgRegisterERC20",
  "signer": "cosmos1cff2uvc2zgep5xlha939vjk08g07rlw6d7sjvw",
  "erc20addresses": []
}
```

## Expected Result
After successful registration:
- OSMO will get an ERC20 address (likely a precompile or deployed contract)
- USDC will get an ERC20 address
- Both will show in `/cosmos/evm/erc20/v1/token_pairs`

## Verification
Run: `node scripts/check-ibc-registration.js`
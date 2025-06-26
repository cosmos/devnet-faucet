#!/bin/bash

# IBC Token Registration Script
# Registers native IBC denoms with the ERC20 module

CHAIN_ID="cosmos-devnet-1"
RPC_ENDPOINT="https://devnet-1-rpc.ib.skip.build"
FEES="5000uatom"
FROM_WALLET="faucet"  # Change this to your wallet name

echo "IBC Token ERC20 Registration"
echo "============================"
echo
echo "This script will register the following IBC tokens:"
echo "1. OSMO: ibc/13B2C536BB057AC79D5616B8EA1B9540EC1F2170718CAFF6F0083C966FFFED0B"
echo "2. USDC: ibc/65D0BEC6DAD96C7F5043D1E54E54B6BB5D5B3AEC3FF6CEBB75B9E059F3580EA3"
echo

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check if cosmosd is available
if ! command_exists cosmosd; then
    echo "Error: cosmosd not found in PATH"
    echo "Please install the cosmos SDK client first"
    exit 1
fi

# Function to register a native denom
register_native_denom() {
    local DENOM=$1
    local NAME=$2
    
    echo "Registering $NAME ($DENOM)..."
    
    # For native denoms, they might already be accessible through precompile
    # But if explicit registration is needed, here's the command:
    
    echo "Command to execute:"
    echo "cosmosd tx erc20 register-coin $DENOM \\"
    echo "  --from $FROM_WALLET \\"
    echo "  --chain-id $CHAIN_ID \\"
    echo "  --node $RPC_ENDPOINT \\"
    echo "  --gas auto \\"
    echo "  --gas-adjustment 1.5 \\"
    echo "  --fees $FEES"
    echo
    
    read -p "Execute this command? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cosmosd tx erc20 register-coin "$DENOM" \
            --from "$FROM_WALLET" \
            --chain-id "$CHAIN_ID" \
            --node "$RPC_ENDPOINT" \
            --gas auto \
            --gas-adjustment 1.5 \
            --fees "$FEES" \
            --yes
    fi
    echo
}

# Function to enable conversion for a denom
enable_conversion() {
    local DENOM=$1
    local NAME=$2
    
    echo "Enabling conversion for $NAME..."
    
    echo "Command to execute:"
    echo "cosmosd tx erc20 toggle-conversion $DENOM \\"
    echo "  --from $FROM_WALLET \\"
    echo "  --chain-id $CHAIN_ID \\"
    echo "  --node $RPC_ENDPOINT \\"
    echo "  --gas auto \\"
    echo "  --gas-adjustment 1.5 \\"
    echo "  --fees $FEES"
    echo
    
    read -p "Execute this command? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cosmosd tx erc20 toggle-conversion "$DENOM" \
            --from "$FROM_WALLET" \
            --chain-id "$CHAIN_ID" \
            --node "$RPC_ENDPOINT" \
            --gas auto \
            --gas-adjustment 1.5 \
            --fees "$FEES" \
            --yes
    fi
    echo
}

# Check current status
echo "Checking current token pairs..."
curl -s "$RPC_ENDPOINT/cosmos/evm/erc20/v1/token_pairs" | jq '.token_pairs[] | {denom: .denom, erc20: .erc20_address, enabled: .enabled}'
echo

# Register tokens
echo "Step 1: Register native denoms"
echo "------------------------------"
register_native_denom "ibc/13B2C536BB057AC79D5616B8EA1B9540EC1F2170718CAFF6F0083C966FFFED0B" "OSMO"
register_native_denom "ibc/65D0BEC6DAD96C7F5043D1E54E54B6BB5D5B3AEC3FF6CEBB75B9E059F3580EA3" "USDC"

echo "Step 2: Enable conversions"
echo "--------------------------"
enable_conversion "ibc/13B2C536BB057AC79D5616B8EA1B9540EC1F2170718CAFF6F0083C966FFFED0B" "OSMO"
enable_conversion "ibc/65D0BEC6DAD96C7F5043D1E54E54B6BB5D5B3AEC3FF6CEBB75B9E059F3580EA3" "USDC"

echo "Registration complete!"
echo
echo "To verify registration:"
echo "curl $RPC_ENDPOINT/cosmos/evm/erc20/v1/token_pairs | jq"
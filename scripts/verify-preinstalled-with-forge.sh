#!/bin/bash

# Verify preinstalled contracts using forge verify-contract

echo "Verifying Preinstalled Contracts with Forge"
echo "=========================================="

# Export PATH to include forge
export PATH=$PATH:/home/cordt/.foundry/bin

# Contract addresses and names
declare -A CONTRACTS=(
    ["0x4e59b44847b379578588920ca78fbf26c0b4956c"]="Create2"
    ["0xcA11bde05977b3631167028862bE2a173976CA11"]="Multicall3"
    ["0x000000000022D473030F116dDEE9F6B43aC78BA3"]="Permit2"
    ["0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7"]="SafeSingletonFactory"
)

# Verify each contract
for ADDRESS in "${!CONTRACTS[@]}"; do
    NAME=${CONTRACTS[$ADDRESS]}
    echo -e "\nVerifying $NAME at $ADDRESS..."
    
    forge verify-contract \
        --verifier blockscout \
        --verifier-url 'https://evm-devnet-1.cloud.blockscout.com/api/' \
        $ADDRESS \
        $NAME
    
    echo "Exit code: $?"
    sleep 2
done

echo -e "\nVerification complete!"
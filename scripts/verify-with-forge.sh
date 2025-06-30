#!/bin/bash

# Script to verify contracts on Blockscout using Foundry forge verify-contract

echo "🔍 Contract Verification with Foundry"
echo "======================================"

# Load environment variables if .env exists
if [ -f .env ]; then
    source .env
fi

# Set explorer URL and API endpoint
EXPLORER_URL="https://evm-devnet-1.cloud.blockscout.com"
VERIFIER="blockscout"
VERIFIER_URL="${EXPLORER_URL}/api"

# Get faucet address from config or environment
FAUCET_ADDRESS="${DEPLOYER_ADDRESS:-0xc252ae330a12321a1bf7e962564acf3a1fe1fdda}"

echo "📍 Faucet Address: ${FAUCET_ADDRESS}"
echo "🌐 Explorer: ${EXPLORER_URL}"
echo ""

# Contract addresses from deployment
ATOMIC_MULTISEND="0x6365EAcBfb289E3B0767fD6fb1bD5d1b85E15368"
WBTC_ADDRESS="0x55Cc56b92b7fa0de7CDa22d263532F2910b9b17B"
PEPE_ADDRESS="0xBCf75f81D7A74cf18a41C267443F0fF3E1A9A671"
USDT_ADDRESS="0xc8648a893357e9893669036Be58aFE71B8140eD6"

# Compiler version
COMPILER_VERSION="0.8.28"

# Set foundry config environment
export FOUNDRY_OPTIMIZER=true
export FOUNDRY_VIA_IR=true
export FOUNDRY_EVM_VERSION=istanbul

# Function to verify a contract
verify_contract() {
    local ADDRESS=$1
    local CONTRACT_PATH=$2
    local CONTRACT_NAME=$3
    local CONSTRUCTOR_ARGS=$4
    
    echo "🔍 Verifying ${CONTRACT_NAME} at ${ADDRESS}..."
    
    if [ -z "$CONSTRUCTOR_ARGS" ]; then
        forge verify-contract \
            --chain-id 88888 \
            --watch \
            --via-ir \
            --optimizer-runs 200 \
            --evm-version istanbul \
            --compiler-version ${COMPILER_VERSION} \
            --verifier ${VERIFIER} \
            --verifier-url ${VERIFIER_URL} \
            ${ADDRESS} \
            ${CONTRACT_PATH}:${CONTRACT_NAME}
    else
        forge verify-contract \
            --chain-id 88888 \
            --watch \
            --via-ir \
            --optimizer-runs 200 \
            --evm-version istanbul \
            --compiler-version ${COMPILER_VERSION} \
            --constructor-args ${CONSTRUCTOR_ARGS} \
            --verifier ${VERIFIER} \
            --verifier-url ${VERIFIER_URL} \
            ${ADDRESS} \
            ${CONTRACT_PATH}:${CONTRACT_NAME}
    fi
    
    if [ $? -eq 0 ]; then
        echo "✅ ${CONTRACT_NAME} verified successfully!"
        echo "   View at: ${EXPLORER_URL}/address/${ADDRESS}"
    else
        echo "❌ Failed to verify ${CONTRACT_NAME}"
    fi
    echo ""
}

# Encode constructor arguments for token contracts (address parameter)
# Remove 0x prefix and pad to 32 bytes
CONSTRUCTOR_ARGS=$(echo ${FAUCET_ADDRESS} | sed 's/0x//' | tr '[:upper:]' '[:lower:]' | sed 's/^/000000000000000000000000/')

echo "📄 Verifying AtomicMultiSend..."
verify_contract ${ATOMIC_MULTISEND} "src/AtomicMultiSend.sol" "AtomicMultiSend" ""

echo "📄 Verifying WBTC Token..."
verify_contract ${WBTC_ADDRESS} "src/tokens/WBTC.sol" "WBTC" ${CONSTRUCTOR_ARGS}

echo "📄 Verifying PEPE Token..."
verify_contract ${PEPE_ADDRESS} "src/tokens/PEPE.sol" "PEPE" ${CONSTRUCTOR_ARGS}

echo "📄 Verifying USDT Token..."
verify_contract ${USDT_ADDRESS} "src/tokens/USDT.sol" "USDT" ${CONSTRUCTOR_ARGS}

echo ""
echo "📊 Verification Complete!"
echo "🔗 View all verified contracts at:"
echo "   ${EXPLORER_URL}/verified-contracts"
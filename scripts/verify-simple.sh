#!/bin/bash

# Simple verification test for PEPE token
ADDRESS="0xBCf75f81D7A74cf18a41C267443F0fF3E1A9A671"
CONTRACT_NAME="PEPE"
COMPILER="v0.8.28+commit.7893614a"
CONSTRUCTOR_ARGS="000000000000000000000000c252ae330a12321a1bf7e962564acf3a1fe1fdda"

echo "Testing verification for ${CONTRACT_NAME} at ${ADDRESS}"
echo "Constructor args: ${CONSTRUCTOR_ARGS}"
echo ""

# Try minimal parameters first
echo "1. Testing with minimal parameters..."
curl -X POST "https://evm-devnet-1.cloud.blockscout.com/api/v2/smart-contracts/${ADDRESS}/verification/via/flattened-code" \
  -F "name=${CONTRACT_NAME}" \
  -F "compilerVersion=${COMPILER}" \
  -F "contractSourceCode=@flattened/PEPE_flat.sol" \
  -F "constructorArguments=${CONSTRUCTOR_ARGS}" \
  -v 2>&1 | tail -20

echo ""
echo "2. Testing with standard parameters..."
curl -X POST "https://evm-devnet-1.cloud.blockscout.com/api/v2/smart-contracts/${ADDRESS}/verification/via/flattened-code" \
  -F "name=${CONTRACT_NAME}" \
  -F "compilerVersion=${COMPILER}" \
  -F "optimization=1" \
  -F "contractSourceCode=@flattened/PEPE_flat.sol" \
  -F "constructorArguments=${CONSTRUCTOR_ARGS}" \
  -v 2>&1 | tail -20
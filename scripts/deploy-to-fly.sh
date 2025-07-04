#!/bin/bash

# Deployment script for Fly.io
# Handles secret management and deployment process

set -e

echo "====================================="
echo "Deploying Faucet to Fly.io"
echo "====================================="

# Check if fly CLI is installed
if ! command -v fly &> /dev/null; then
    echo "Error: fly CLI is not installed. Please install it from https://fly.io/docs/hands-on/install-flyctl/"
    exit 1
fi

# Check if logged in to Fly.io
if ! fly auth whoami &> /dev/null; then
    echo "Error: Not logged in to Fly.io. Please run 'fly auth login'"
    exit 1
fi

# Load environment variables from .env for local reference
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Function to set a secret
set_secret() {
    local name=$1
    local value=$2
    
    if [ -z "$value" ]; then
        echo "Warning: $name is not set"
        return
    fi
    
    echo "Setting secret: $name"
    fly secrets set "$name=$value" --stage
}

echo ""
echo "Setting up secrets..."
echo "Note: Secrets are never logged or displayed"
echo ""

# Set MNEMONIC secret (required)
if [ -z "$MNEMONIC" ]; then
    echo "Error: MNEMONIC environment variable is required"
    echo "Please set it in your .env file or export it before running this script"
    exit 1
fi

set_secret "MNEMONIC" "$MNEMONIC"

# Optional: Set WalletConnect project ID if available
if [ -n "$VITE_REOWN_PROJECT_ID" ]; then
    set_secret "VITE_REOWN_PROJECT_ID" "$VITE_REOWN_PROJECT_ID"
fi

# Optional: Set any other secrets
if [ -n "$AUTO_REDEPLOY" ]; then
    set_secret "AUTO_REDEPLOY" "$AUTO_REDEPLOY"
fi

echo ""
echo "Deploying all staged secrets..."
fly secrets deploy

echo ""
echo "Building and deploying application..."
echo ""

# Deploy the application
fly deploy --ha=false

echo ""
echo "====================================="
echo "Deployment complete!"
echo "====================================="
echo ""
echo "To view your app:"
echo "  fly open"
echo ""
echo "To view logs:"
echo "  fly logs"
echo ""
echo "To check status:"
echo "  fly status"
echo ""
echo "To manage secrets:"
echo "  fly secrets list"
echo ""
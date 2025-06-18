#!/bin/bash

echo "🚀 Fly.io Deployment Checklist"
echo "=============================="

# Check for sensitive files
echo "✓ Checking for sensitive files..."
if [ -f .env ]; then
    echo "❌ WARNING: .env file exists! Remove it before deployment."
    echo "   Use 'fly secrets set' instead."
    exit 1
else
    echo "✅ No .env file found"
fi

# Check dockerignore
echo ""
echo "✓ Checking .dockerignore..."
if grep -q "^\.env" .dockerignore; then
    echo "✅ .dockerignore excludes .env files"
else
    echo "❌ WARNING: .dockerignore doesn't exclude .env files!"
    exit 1
fi

# List required secrets
echo ""
echo "📋 Required Fly.io Secrets:"
echo "   - MNEMONIC (required)"
echo "   - TESTING_MODE (optional, default: false)"
echo "   - HOST (optional, default: 0.0.0.0)"
echo ""
echo "   Set these with: fly secrets set MNEMONIC='your mnemonic here'"

# Check fly.toml
echo ""
echo "✓ Checking fly.toml configuration..."
if [ -f fly.toml ]; then
    echo "✅ fly.toml exists"
    echo "   App name: $(grep '^app =' fly.toml | cut -d'"' -f2)"
    echo "   Region: $(grep '^primary_region =' fly.toml | cut -d'"' -f2)"
else
    echo "❌ fly.toml not found!"
    exit 1
fi

# Build test
echo ""
echo "✓ Testing Docker build..."
docker build -t devnet-faucet-test . || {
    echo "❌ Docker build failed!"
    exit 1
}
echo "✅ Docker build successful"

# Final steps
echo ""
echo "📌 Deployment Steps:"
echo "1. Ensure you're logged into Fly.io: fly auth login"
echo "2. Create the app (if not exists): fly apps create devnet-faucet"
echo "3. Set secrets: fly secrets set MNEMONIC='your mnemonic here'"
echo "4. Create volume: fly volumes create faucet_data --size 1"
echo "5. Deploy: fly deploy"
echo "6. Check logs: fly logs"
echo "7. Open app: fly open"

echo ""
echo "✨ Ready for deployment!"
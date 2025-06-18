# Vercel Deployment Guide

This guide explains how to deploy the Cosmos-EVM Devnet Faucet on Vercel.

## Prerequisites

1. A Vercel account (https://vercel.com)
2. Vercel CLI installed (optional): `npm i -g vercel`
3. A secure mnemonic phrase for the faucet wallet

## Deployment Steps

### 1. Fork or Clone the Repository

```bash
git clone https://github.com/cosmos/devnet-faucet.git
cd devnet-faucet
```

### 2. Configure Environment Variables

In your Vercel project settings, add the following environment variables:

- `MNEMONIC` - Your 12 or 24 word mnemonic phrase (REQUIRED)
- `TESTING_MODE` - Set to `true` for testing (optional, default: false)
- `AUTO_REDEPLOY` - Set to `true` to auto-deploy contracts (optional, default: false)

⚠️ **Security Note**: Never commit your mnemonic phrase to Git. Always use Vercel's environment variables feature.

### 3. Deploy to Vercel

#### Option A: Using Vercel CLI
```bash
vercel
```

#### Option B: Using GitHub Integration
1. Connect your GitHub repository to Vercel
2. Vercel will automatically deploy on every push to main

### 4. Post-Deployment Setup

After deployment, the faucet will:
1. Initialize secure key management
2. Verify contract addresses
3. Set up token approvals
4. Start serving requests

## Configuration

The faucet is configured through several files:

- `config.js` - Main configuration (network endpoints, chain IDs)
- `tokens.json` - Token configuration and contract addresses
- `token-registry.json` - Detailed token metadata

## Limitations on Vercel

1. **Serverless Functions**: The faucet runs as a serverless function with a 30-second timeout
2. **Cold Starts**: Initial requests may be slower due to initialization
3. **File System**: The `.faucet` directory for rate limiting is ephemeral
4. **Persistent Storage**: Consider using a database for production rate limiting

## Monitoring

View logs in the Vercel dashboard under the Functions tab.

## Troubleshooting

### "Server initialization failed" Error
- Check that the MNEMONIC environment variable is set correctly
- Verify network endpoints are accessible
- Check Vercel function logs for detailed errors

### Contract Verification Failures
- Ensure token contracts are deployed to the correct network
- Update contract addresses in `tokens.json` if needed
- Set `AUTO_REDEPLOY=true` to automatically deploy missing contracts

### Rate Limiting Issues
- In serverless environments, rate limiting is reset on each cold start
- Consider implementing Redis or another persistent storage solution for production

## Production Recommendations

1. Use a dedicated database for rate limiting instead of file-based storage
2. Implement proper monitoring and alerting
3. Set up CORS policies for your domain
4. Consider using Vercel Edge Functions for better performance
5. Implement request signing or CAPTCHA for additional security

## Support

For issues specific to Vercel deployment, check:
- Vercel documentation: https://vercel.com/docs
- Project issues: https://github.com/cosmos/devnet-faucet/issues
# Fly.io Deployment Guide

## Prerequisites

1. Install Fly CLI: `curl -L https://fly.io/install.sh | sh`
2. Login to Fly: `fly auth login`
3. Have your mnemonic phrase ready

## Deployment Steps

### 1. Create the Fly App (first time only)
```bash
fly apps create devnet-faucet --region iad
```

### 2. Set Secrets
```bash
# Set your mnemonic (REQUIRED)
fly secrets set MNEMONIC='your twelve word mnemonic phrase here'

# Optional: Enable testing mode
fly secrets set TESTING_MODE=false

# Optional: Set host (default is 0.0.0.0)
fly secrets set HOST=0.0.0.0
```

### 3. Create Persistent Volume (first time only)
```bash
fly volumes create faucet_data --region iad --size 1
```

### 4. Deploy
```bash
fly deploy
```

### 5. Verify Deployment
```bash
# Check logs
fly logs

# Check app status
fly status

# Open in browser
fly open
```

## Important Notes

1. **Contract Verification**: The faucet will verify that all contracts are owned by the faucet address on startup. If verification fails, the faucet will not start.

2. **Environment Variables**: All sensitive configuration is handled through Fly secrets. Never commit `.env` files or mnemonics to the repository.

3. **Persistent Storage**: The `/app/.faucet` directory is mounted as a persistent volume to maintain rate limiting data across deployments.

4. **Health Checks**: The faucet exposes a `/health` endpoint that Fly.io uses to monitor the application.

## Troubleshooting

### Container won't start
- Check logs: `fly logs`
- Verify mnemonic is set: `fly secrets list`
- Ensure contracts are deployed with the correct owner address

### Contract verification fails
- The faucet address derived from your mnemonic must own the contracts
- Check that you're using the same mnemonic that was used to deploy the contracts
- You can set `AUTO_REDEPLOY=true` to automatically redeploy contracts (requires deployment scripts)

### Rate limiting issues
- The database is stored in `/app/.faucet/history.db`
- This is persisted in the `faucet_data` volume
- To reset rate limits, you can destroy and recreate the volume

## Updating the Application

To deploy updates:
```bash
# Make your changes
git add .
git commit -m "Update description"

# Deploy to Fly
fly deploy
```

## Monitoring

```bash
# View real-time logs
fly logs

# Check app metrics
fly dashboard

# SSH into running container
fly ssh console
```
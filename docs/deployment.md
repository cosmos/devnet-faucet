# Deployment Guide

## Local Development

For local development, run on port 8088:

```bash
# Install dependencies
yarn install

# Set up environment variables
cp .env.example .env
# Edit .env and add your MNEMONIC

# Run development server
yarn dev
```

## Production Deployment on Fly.io

### Prerequisites

1. Install Fly CLI:
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. Sign up and log in:
   ```bash
   fly auth signup
   # or
   fly auth login
   ```

### Initial Setup

1. Create the app (only needed once):
   ```bash
   fly launch --no-deploy
   ```

2. Create a persistent volume for rate limiting data:
   ```bash
   fly volumes create faucet_data --size 1 --region iad
   ```

### Configuration

1. Set required secrets:
   ```bash
   # Required: Set the mnemonic for the faucet wallet
   fly secrets set MNEMONIC="your twelve word mnemonic phrase here"
   
   # Optional: Set WalletConnect project ID
   fly secrets set VITE_REOWN_PROJECT_ID="your-project-id"
   ```

### Deployment

Use the deployment script:

```bash
./scripts/deploy-to-fly.sh
```

Or deploy manually:

```bash
fly deploy --ha=false
```

### Monitoring

View logs:
```bash
fly logs
```

Check status:
```bash
fly status
```

SSH into the container:
```bash
fly ssh console
```

### Secrets Management

List secrets:
```bash
fly secrets list
```

Update a secret:
```bash
fly secrets set SECRET_NAME="new-value"
```

Remove a secret:
```bash
fly secrets unset SECRET_NAME
```

### Important Notes

1. **Never commit sensitive data**: The MNEMONIC and other secrets should never be committed to the repository
2. **Use Fly.io secrets**: All sensitive configuration is managed through Fly.io secrets, not .env files
3. **Persistent storage**: The `.faucet` directory is mounted as a volume to persist rate limiting data
4. **Health checks**: The app exposes `/health` endpoint for Fly.io health monitoring
5. **Auto-rollback**: Enabled in fly.toml for automatic rollback on failed deployments

### Troubleshooting

1. **Deployment fails**: Check logs with `fly logs` for errors
2. **App crashes**: SSH in with `fly ssh console` and check `/app/.faucet/` for rate limit database
3. **Secret issues**: Verify secrets are set with `fly secrets list`
4. **Network issues**: Ensure the endpoints in config.js are accessible from Fly.io regions
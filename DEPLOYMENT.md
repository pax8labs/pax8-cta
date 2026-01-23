# Deployment Guide

This guide covers all deployment options for AgentCrate, from simple single-machine setups to production-grade cloud deployments.

## Quick Start (Choose Your Path)

| Scenario | Recommended Approach | Complexity |
|----------|---------------------|------------|
| Local development | `pnpm dev` | Simple |
| Single server, few tenants | PM2 or systemd | Simple |
| Vercel/Netlify (serverless) | Direct deploy | Simple |
| Azure with auto-scaling | App Service + Container Apps | Medium |
| Kubernetes | Helm chart | Advanced |
| Docker Compose | `docker-compose up` | Simple |

---

## Option 1: Local Development (No Docker)

The simplest way to get started. Requires Node.js 20+ and Redis.

### Automated Setup

```bash
./scripts/setup-local.sh
```

This script will:
- Check Node.js and pnpm
- Install Redis (optional, prompts for permission)
- Install dependencies
- Build packages
- Create environment file

### Manual Setup

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Copy and configure environment
cp .env.example .env
# Edit .env with your credentials

# Start Redis (if using local Redis)
# macOS: brew services start redis
# Ubuntu: sudo systemctl start redis

# Run web dashboard (Terminal 1)
pnpm --filter @agentcrate/web dev

# Run worker (Terminal 2)
pnpm --filter @agentcrate/worker dev

# Or use CLI directly
pnpm --filter @agentcrate/cli start -- tenants list
```

---

## Option 2: PM2 (Production, Single Server)

PM2 provides process management, monitoring, and automatic restarts.

```bash
# Install PM2 globally
npm install -g pm2

# Start both web and worker
pm2 start deploy/pm2.config.cjs

# View logs
pm2 logs

# Monitor
pm2 monit

# Stop all
pm2 stop all

# Enable startup on boot
pm2 startup
pm2 save
```

### Configuration

Edit `deploy/pm2.config.cjs` or use environment variables:

```bash
# Set environment variables before starting
export REDIS_URL=redis://localhost:6379
export PARTNER_CLIENT_SECRET=your-secret
pm2 start deploy/pm2.config.cjs
```

---

## Option 3: systemd (Linux Servers)

For dedicated Linux servers with automatic startup.

### Installation

```bash
# Create service user
sudo useradd -r -s /bin/false csd

# Copy application
sudo cp -r . /opt/copilot-studio-deployer
sudo chown -R csd:csd /opt/copilot-studio-deployer

# Create config directory
sudo mkdir -p /etc/csd
sudo cp deploy/systemd/environment.example /etc/csd/environment
sudo chmod 600 /etc/csd/environment
# Edit /etc/csd/environment with your values

# Install service files
sudo cp deploy/systemd/*.service /etc/systemd/system/
sudo systemctl daemon-reload

# Enable and start services
sudo systemctl enable agentcrate-web agentcrate-worker
sudo systemctl start agentcrate-web agentcrate-worker

# Check status
sudo systemctl status agentcrate-web agentcrate-worker

# View logs
journalctl -u agentcrate-web -f
journalctl -u agentcrate-worker -f
```

---

## Option 4: Vercel / Netlify (Serverless)

Deploy as a serverless web application. Best for low-volume deployments.

### Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy from packages/web directory
cd packages/web
vercel

# Set environment variables in Vercel dashboard:
# - PARTNER_CLIENT_SECRET
# - NEXTAUTH_SECRET
# - AZURE_AD_CLIENT_ID
# - AZURE_AD_CLIENT_SECRET
# - AZURE_AD_TENANT_ID
# - CONFIG_PATH (use Vercel Blob or embed in code)
```

**Note**: Serverless deployments use the in-process `/api/deployments/process` endpoint instead of Redis queues. This is suitable for:
- Small numbers of tenants (< 20)
- Infrequent deployments
- Development/staging environments

For high-volume or concurrent deployments, use the worker-based approach.

### Netlify

Similar to Vercel. Create `netlify.toml`:

```toml
[build]
  command = "cd ../.. && pnpm install && pnpm build"
  publish = ".next"

[functions]
  directory = ".netlify/functions"

[[plugins]]
  package = "@netlify/plugin-nextjs"
```

---

## Option 5: Azure (Cloud-Native)

Production deployment using Azure services with auto-scaling.

### Prerequisites

- Azure subscription
- Azure CLI installed (`az login`)

### Deploy with Bicep

```bash
# Run deployment script
./deploy/azure/deploy.sh -g my-resource-group -e prod -l eastus
```

This creates:
- **Azure Cache for Redis** - Job queue
- **App Service** - Web dashboard
- **Container Apps** - Auto-scaling workers

### Architecture

```
                    ┌─────────────────┐
                    │   Azure AD      │
                    │  (Auth)         │
                    └────────┬────────┘
                             │
┌─────────────────┐         │         ┌─────────────────┐
│   App Service   │◄────────┼────────►│  Azure Redis    │
│   (Web UI)      │         │         │  (Queue)        │
└─────────────────┘         │         └────────┬────────┘
                             │                  │
                             │         ┌────────▼────────┐
                             │         │ Container Apps  │
                             │         │ (Workers x 1-3) │
                             │         └─────────────────┘
```

### Cost Estimate (Basic Tier)

| Service | SKU | ~Monthly Cost |
|---------|-----|---------------|
| App Service | B1 | $13 |
| Container Apps | 0.5 vCPU | $10 |
| Redis Cache | C0 | $16 |
| **Total** | | **~$40/month** |

---

## Option 6: Docker Compose

Best for teams already using Docker.

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Configuration

Edit `docker-compose.yml` or use `.env` file:

```env
PARTNER_CLIENT_SECRET=your-secret
WORKER_CONCURRENCY=5
```

---

## Option 7: Kubernetes (Helm)

For large-scale deployments with orchestration.

```bash
# Add any required Helm repos
helm repo add bitnami https://charts.bitnami.com/bitnami

# Install Redis (or use external)
helm install redis bitnami/redis

# Install AgentCrate
helm install csd ./helm/csd \
  --set redis.url=redis://redis-master:6379 \
  --set secrets.partnerClientSecret=$PARTNER_CLIENT_SECRET \
  --set secrets.azureAdClientId=$AZURE_AD_CLIENT_ID \
  --set secrets.azureAdClientSecret=$AZURE_AD_CLIENT_SECRET \
  --set secrets.azureAdTenantId=$AZURE_AD_TENANT_ID
```

See `helm/csd/values.yaml` for all configuration options.

---

## Redis Alternatives

### Using Upstash (Serverless Redis)

Perfect for Vercel/Netlify deployments:

1. Create account at [upstash.com](https://upstash.com)
2. Create a Redis database
3. Set `REDIS_URL` to your Upstash URL

### Using Azure Cache for Redis

1. Create via Azure Portal or CLI
2. Use connection string with SSL: `rediss://:PASSWORD@HOST:6380`

### In-Memory Mode (Development Only)

For local development without Redis, the web app can process deployments directly via `/api/deployments/process`. This doesn't require any queue setup but lacks:
- Job persistence
- Concurrent processing
- Multi-instance support

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `PARTNER_CLIENT_SECRET` | Yes | Azure AD app secret for GDAP |
| `REDIS_URL` | No* | Redis connection URL |
| `CONFIG_PATH` | No | Path to tenants.yaml (default: ./config/tenants.yaml) |
| `NEXTAUTH_URL` | Yes (web) | Public URL of web dashboard |
| `NEXTAUTH_SECRET` | Yes (web) | Session encryption key |
| `AZURE_AD_CLIENT_ID` | Yes (web) | Azure AD app for user auth |
| `AZURE_AD_CLIENT_SECRET` | Yes (web) | Azure AD app secret |
| `AZURE_AD_TENANT_ID` | Yes (web) | Your Azure AD tenant |
| `WORKER_CONCURRENCY` | No | Parallel deployments (default: 5) |
| `SNAPSHOT_DIR` | No | Rollback snapshots location |
| `LOG_LEVEL` | No | debug, info, warn, error |

*Redis not required for serverless/in-process mode

---

## Troubleshooting

### "Cannot connect to Redis"

1. Verify Redis is running: `redis-cli ping`
2. Check `REDIS_URL` is correct
3. For Azure/Upstash, ensure SSL is used (`rediss://`)

### "Authentication failed"

1. Verify Azure AD app registration
2. Check GDAP relationship is active
3. Ensure correct permissions are granted

### "Solution import timeout"

1. Increase `WORKER_CONCURRENCY` (fewer parallel = more resources per job)
2. Check target environment health
3. For serverless, consider worker-based deployment

### Worker not processing jobs

1. Check Redis connection
2. Verify worker is running: `pm2 status` or `systemctl status agentcrate-worker`
3. Check worker logs for errors

---

## Security Best Practices

1. **Never commit secrets** - Use environment variables or Key Vault
2. **Use HTTPS** - Always in production
3. **Restrict network access** - Use private endpoints for Redis
4. **Regular secret rotation** - Rotate client secrets periodically
5. **Audit logging** - Enable and monitor audit logs
6. **Least privilege** - Grant only required GDAP permissions

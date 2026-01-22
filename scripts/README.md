# AgentSync Scripts

This directory contains automation scripts for sandbox environment management and maintenance.

## Sandbox Scripts

### `setup-sandbox-environments.sh`

Automates the creation of Power Platform environments for sandbox testing.

**Prerequisites:**
- Power Platform CLI (`pac`) installed
- Authenticated to sandbox tenant
- M365 Developer subscription with available environment quota

**Usage:**
```bash
./scripts/setup-sandbox-environments.sh
```

**What it does:**
1. Creates source environment: "AgentSync Dev Source"
2. Creates 3 target test environments:
   - Contoso Sandbox
   - Fabrikam Sandbox
   - Adventure Works Sandbox
3. Waits for provisioning to complete
4. Provides next steps for configuration

**Configuration:**
```bash
# Set region (default: unitedstates)
REGION=unitedstates ./scripts/setup-sandbox-environments.sh

# Set currency (default: USD)
CURRENCY=USD ./scripts/setup-sandbox-environments.sh
```

---

### `cleanup-sandbox.sh`

Daily maintenance script to clean up old sandbox data and reduce storage usage.

**Usage:**
```bash
./scripts/cleanup-sandbox.sh
```

**What it does:**
1. Clears completed/failed jobs from Redis queue
2. Deletes old deployment records (>7 days)
3. Removes old audit logs (>30 days)
4. Deletes old solution files (>30 days)
5. Cleans up old rollback snapshots (>30 days)

**Schedule via cron:**
```bash
# Add to crontab (runs daily at 2 AM)
crontab -e

# Add this line:
0 2 * * * cd /path/to/agentsync && ./scripts/cleanup-sandbox.sh >> /var/log/agentsync-cleanup.log 2>&1
```

**Configuration:**
```bash
# Override database path
DATABASE_PATH=/custom/path/db.sqlite ./scripts/cleanup-sandbox.sh

# Override Redis URL
REDIS_URL=redis://custom-host:6379 ./scripts/cleanup-sandbox.sh

# Override snapshot directory
SNAPSHOT_DIR=/custom/snapshots ./scripts/cleanup-sandbox.sh
```

---

### `start-demo.sh`

Quick start script for demo mode (for recording demos, presentations).

**Usage:**
```bash
./scripts/start-demo.sh
```

**What it does:**
1. Checks dependencies (Node.js, pnpm)
2. Installs dependencies if needed
3. Builds packages if needed
4. Starts Redis (if Docker available)
5. Starts web app in demo mode

**Stops with:** Ctrl+C

---

## Other Useful Commands

### List Power Platform Environments
```bash
pac admin list
```

### Check Redis Queue Status
```bash
redis-cli LLEN bull:tenant-deployments:active
redis-cli LLEN bull:tenant-deployments:waiting
redis-cli LLEN bull:tenant-deployments:failed
```

### Manual Database Cleanup
```bash
sqlite3 ./data/agentsync-sandbox.db "SELECT COUNT(*) FROM deployments;"
sqlite3 ./data/agentsync-sandbox.db "DELETE FROM deployments WHERE created_at < datetime('now', '-7 days');"
sqlite3 ./data/agentsync-sandbox.db "VACUUM;"
```

### View Sandbox Logs
```bash
# View cleanup logs
tail -f /var/log/agentsync-cleanup.log

# View worker logs
pnpm worker 2>&1 | tee worker.log
```

---

## Troubleshooting

### Script Permission Denied
```bash
chmod +x ./scripts/*.sh
```

### Power Platform CLI Not Found
```bash
# Install pac CLI
# See: https://learn.microsoft.com/power-platform/developer/cli/introduction

# macOS (via Homebrew)
brew install microsoft/powerplatform/pac

# Or download installer from Microsoft
```

### Redis Connection Failed
```bash
# Start Redis with Docker
docker run -d --name agentsync-redis -p 6379:6379 redis:7-alpine

# Check if Redis is running
redis-cli ping
# Should return: PONG
```

### Database Locked Error
```bash
# Make sure no other process is accessing the database
lsof ./data/agentsync-sandbox.db

# Kill processes if needed
pkill -f agentsync
```

---

## See Also

- [Sandbox Setup Guide](../docs/SANDBOX_SETUP.md) - Full setup instructions
- [Sandbox Maintenance Runbook](../docs/SANDBOX_MAINTENANCE.md) - Maintenance procedures
- [Demo Script](../docs/DEMO_SCRIPT.md) - Recording demo instructions

# AgentCrate

Crate up your agents and ship them to all your tenants! Multi-tenant Copilot Studio deployment automation for MSPs. Deploy agents from a source environment to hundreds of customer destinations using GDAP (Granular Delegated Admin Privileges).

## Features

### Core Capabilities
- **Multi-tenant shipping** - Ship crates to 200+ destinations in parallel with rate limiting
- **GDAP authentication** - Secure cross-tenant access using Microsoft's delegated admin model
- **CLI and Control Tower** - Choose your preferred interface
- **Job queue system** - Reliable shipments with retry logic and progress tracking
- **Tag-based targeting** - Ship to fleet groups (e.g., "enterprise", "pilot")

### Advanced Features (v2.0)
- **Connection Reference Mapping** - Automatically map connection references to target connections
- **Environment Variables** - Configure tenant-specific environment variables
- **Deployment Waves** - Staged rollouts with configurable parallelism and wait times
- **Rollback Capability** - Create snapshots before deployment, rollback on failure
- **Health Checks** - Validate tenant environments before and after deployment
- **Webhook Notifications** - Real-time notifications to external systems (Slack, Teams, etc.)
- **Scheduled Deployments** - Cron-based scheduling with maintenance windows
- **Approval Workflows** - Require approvals before deployment proceeds
- **Solution Diff & Preview** - Compare solutions before deployment

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   CLI / Control │────▶│   Dock Queue    │────▶│    Dockworker   │
│   Tower (Web)   │     │   (Redis)       │     │    (Worker)     │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                              ┌──────────────────────────┼──────────────────────────┐
                              │                          │                          │
                              ▼                          ▼                          ▼
                    ┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
                    │  Destination A  │       │  Destination B  │       │  Destination C  │
                    │  (Dataverse)    │       │  (Dataverse)    │       │  (Dataverse)    │
                    └─────────────────┘       └─────────────────┘       └─────────────────┘
```

## Prerequisites

### Azure AD App Registration

1. Create an App Registration in your **partner tenant**
2. Add API permission: `Dynamics CRM > user_impersonation` (Delegated)
3. Grant admin consent
4. Create a client secret and save it securely

### GDAP Relationships

For each customer tenant:
1. Establish a GDAP relationship via Partner Center
2. Request the **Power Platform Administrator** role
3. Customer must approve the relationship

### Application User (per customer)

In each customer's Dataverse environment, create an Application User:
1. Go to Power Platform Admin Center > Environments > [Environment] > Settings
2. Users + permissions > Application users > New app user
3. Add your partner app registration
4. Assign System Administrator or Solution Import role

## Installation

### Option 1: Docker (Recommended)

```bash
# Clone the repository
git clone <repo-url>
cd agentcrate

# Configure
cp config/tenants.example.yaml config/tenants.yaml
cp .env.example .env
# Edit both files with your values

# Start services
docker-compose up -d
```

### Option 2: Local Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Start Redis (required for job queue)
docker run -d -p 6379:6379 redis:7-alpine

# Set environment variables
export PARTNER_CLIENT_SECRET="your-secret"

# Start dockworker (in one terminal)
pnpm worker

# Start Control Tower (in another terminal)
pnpm web
```

## Configuration

### Basic Configuration (`config/tenants.yaml`)

```yaml
version: "2.0"

partner:
  tenantId: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
  clientId: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

source:
  tenantId: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
  environmentUrl: "https://your-dev-org.crm.dynamics.com"

tenants:
  - name: "Contoso Corporation"
    tenantId: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
    environmentUrl: "https://contoso.crm.dynamics.com"
    tags: ["enterprise", "wave1"]
    enabled: true
```

### Connection Reference Mapping

Map source connection references to target connections for each destination:

```yaml
tenants:
  - name: "Contoso Corporation"
    tenantId: "..."
    environmentUrl: "..."
    connectionMappings:
      - sourceLogicalName: "cr_sharepoint_connection"
        targetConnectionId: "shared-sharepoint-contoso-xxx"
      - sourceLogicalName: "cr_outlook_connection"
        targetConnectionId: "shared-office365-contoso-xxx"
```

### Environment Variables

Configure tenant-specific environment variable values:

```yaml
tenants:
  - name: "Contoso Corporation"
    environmentVariables:
      - schemaName: "cr_SupportEmail"
        value: "support@contoso.com"
        type: "String"
      - schemaName: "cr_MaxRetries"
        value: 5
        type: "Number"
```

### Deployment Waves

Ship in stages with health checks between waves:

```yaml
settings:
  waves:
    - name: "Pilot"
      order: 1
      tenants: ["wave1", "priority"]
      maxParallel: 2
      waitAfterCompletion: "5m"
      continueOnFailure: false

    - name: "Main Rollout"
      order: 2
      tenants: ["wave2"]
      maxParallel: 10
      continueOnFailure: true
```

### Rollback Settings

Enable automatic snapshots and rollback capability:

```yaml
settings:
  rollback:
    enabled: true
    keepVersions: 3
    autoRollbackOnFailure: false
    rollbackTimeout: "10m"
```

### Webhook Notifications

Send notifications to external systems:

```yaml
settings:
  webhooks:
    - url: "https://hooks.slack.com/services/xxx"
      events:
        - deployment.started
        - deployment.completed
        - deployment.failed
        - tenant.failed
      secret: "${WEBHOOK_SECRET}"
      retries: 3
```

### Scheduled Deployments

Schedule deployments during maintenance windows:

```yaml
settings:
  schedule:
    cron: "0 2 * * 6"  # Saturday at 2 AM
    timezone: "America/New_York"
    maintenanceWindow:
      start: "02:00"
      end: "06:00"
      daysOfWeek: [0, 6]  # Weekend only
```

### Approval Workflow

Require approvals before deployment:

```yaml
settings:
  approval:
    required: true
    approvers:
      - admin@yourcompany.com
    minApprovals: 1
    timeout: "24h"
    autoApproveForTags: ["test", "pilot"]
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PARTNER_CLIENT_SECRET` | Azure AD app client secret | Required |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `CONFIG_PATH` | Path to tenants.yaml | `./config/tenants.yaml` |
| `WORKER_CONCURRENCY` | Parallel deployments | `5` |
| `SNAPSHOTS_DIR` | Directory for rollback snapshots | `./snapshots` |

## CLI Usage

### Pack a Solution (Export)

```bash
# Pack as managed (default)
agentcrate pack --solution "CustomerServiceAgent" --output ./crates/

# Pack as unmanaged
agentcrate pack --solution "CustomerServiceAgent" --output ./crates/ --unmanaged
```

### Ship to Destinations (Deploy)

```bash
# Ship to all enabled destinations
agentcrate ship --solution ./crates/CustomerServiceAgent_managed.zip --all

# Ship to destinations with specific tags
agentcrate ship --solution ./crates/CustomerServiceAgent_managed.zip --tag enterprise

# Ship to multiple tag groups
agentcrate ship --solution ./crates/CustomerServiceAgent_managed.zip --tag enterprise --tag pilot

# Dry run (see what would be shipped)
agentcrate ship --solution ./crates/CustomerServiceAgent_managed.zip --all --dry-run
```

### Track Shipment Status

```bash
# One-time status check
agentcrate track --shipment <shipment-id>

# Watch for updates
agentcrate track --shipment <shipment-id> --watch
```

### Manage Fleet (Tenants)

```bash
# List all destinations in your fleet
agentcrate fleet list

# Filter by tag
agentcrate fleet list --tag enterprise

# Validate GDAP access
agentcrate fleet validate
```

### Deliver to Single Destination (Testing)

```bash
agentcrate deliver --solution ./crates/CustomerServiceAgent_managed.zip --tenant <tenant-id>
```

## Control Tower (Web Dashboard)

Access at `http://localhost:3001`

- **Dashboard** - Overview stats and recent shipments
- **Solutions** - Browse and pack solutions from your source environment (warehouse)
- **Fleet** - View configured destinations
- **Shipments** - List all deployments with real-time status
- **New Shipment** - Upload crate and select target destinations
- **Shipment Detail** - View per-destination progress, retry failed, or cancel pending

## Project Structure

```
agentcrate/
├── packages/
│   ├── core/           # Core warehouse logic
│   │   └── src/
│   │       ├── auth/         # GDAP + token management
│   │       ├── config/       # YAML config schema (v2.0)
│   │       ├── dataverse/    # Solution pack/ship + connection refs
│   │       └── services/     # Rollback, health checks, webhooks, waves
│   │
│   ├── cli/            # Command-line interface
│   │   └── src/commands/
│   │
│   ├── worker/         # Dockworker (BullMQ job processor)
│   │
│   └── web/            # Control Tower (Next.js dashboard)
│
├── config/
│   └── tenants.yaml    # Your fleet configuration
├── crates/             # Packed solution files
├── snapshots/          # Rollback snapshots
├── docker-compose.yml
└── Dockerfile
```

## Troubleshooting

### "Failed to acquire token"

- Verify `PARTNER_CLIENT_SECRET` is set correctly
- Check that the app registration has admin consent
- Ensure the client secret hasn't expired

### "No active GDAP relationship"

- Verify GDAP relationship is approved in Partner Center
- Check that the relationship includes Power Platform Administrator role
- Run `agentcrate fleet validate` to check all destinations

### "Import failed: missing dependencies"

- Ensure all solution dependencies are installed in the target environment
- Check that the solution was packed with "Add required objects"

### "Rate limited"

- Reduce `WORKER_CONCURRENCY` in environment variables
- The dockworker automatically retries with exponential backoff

### "Connection reference not found"

- Verify the connection reference logical name matches the source
- Ensure the target connection ID exists in the customer environment
- Check that connections are shared with the application user

## API Reference

### REST Endpoints (Control Tower)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/stats` | GET | Dashboard statistics |
| `/api/tenants` | GET | List all fleet destinations |
| `/api/solutions` | GET | List solutions from warehouse |
| `/api/solutions/export` | POST | Pack a solution to crate |
| `/api/deployments` | GET | List shipments |
| `/api/deployments/[id]` | GET | Shipment details |
| `/api/deployments/create` | POST | Create new shipment |
| `/api/deployments/[id]/retry` | POST | Retry failed destination deliveries |
| `/api/deployments/[id]/cancel` | POST | Cancel pending deliveries |

## Known Limitations

1. **make.powerapps.com does not support GDAP** - All operations must go through APIs
2. **Connection references** - Now supported via mapping configuration
3. **Environment variables** - Now supported via configuration
4. **Flows with owner-only triggers** - May require manual configuration

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.

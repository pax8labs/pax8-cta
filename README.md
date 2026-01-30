# AgentSync

Take your CoPilot agents and ship them to your clients' tenants! Multi-tenant Copilot Studio deployment automation for MSPs. Deploy agents from a source environment to hundreds of customer destinations using GDAP (Granular Delegated Admin Privileges).

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fpax8labs%2Fagentsync&env=PARTNER_TENANT_ID,PARTNER_CLIENT_ID,PARTNER_CLIENT_SECRET,SOURCE_TENANT_ID,SOURCE_ENVIRONMENT_URL&envDescription=Azure%20AD%20and%20source%20environment%20configuration&project-name=agentsync&repository-name=agentsync)

---

## ⚡ Quick Start: Deploy Agents to Multiple Tenants

### One-Time Setup (5-10 minutes)

1. **Create GDAP relationships** in [Microsoft Partner Center](https://partner.microsoft.com/en-us/dashboard/customers)
   - Go to Customers → [Customer] → Admin relationships
   - Request **Power Platform Administrator** role
   - Customer approves the relationship
   - *This is the only external step - everything else is done in AgentSync*

2. **Create Azure AD app registration** in your partner tenant
   - [Azure Portal](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade) → App registrations → New registration
   - Add API permission: `Dynamics CRM > user_impersonation`
   - Create client secret and save it
   - Note: Client ID, Tenant ID, Secret

3. **Enter credentials in AgentSync**
   - Start AgentSync (see [installation options](#-try-it-in-5-minutes-no-install-required) below)
   - Go to Settings → Integration tab
   - Enter your partner credentials
   - Click "Test Connection" ✓

4. **Deploy agents!**
   - AgentSync auto-discovers all your GDAP customers
   - Select agent, select tenants, click Deploy
   - Monitor real-time progress across all tenants

**Time to first deployment:** ~15 minutes
**Time per subsequent deployment:** ~2 minutes (to 1 tenant or 100 tenants - same time!)

---

## 🚀 Try It in 5 Minutes (No Install Required)

**Already have GDAP set up with your customers?** You're 90% there.

> **📱 What You're Deploying**: AgentSync Control Tower - a Next.js web dashboard for managing Copilot Studio agent deployments across your customer fleet. It includes the full UI, approval workflows, health checks, and deployment tracking.
>
> **🚧 Current Status**: BETA - Core functionality works, but requires [production readiness work](https://github.com/pax8labs/agentsync/issues) before use with live customer data (see issues #11-20 for details).

### Option A: One-Click Cloud Deploy (Easiest)

Deploy the **Control Tower web dashboard** to **Vercel** - a free cloud hosting platform (like Azure App Service, but simpler). Good for testing and evaluation.

1. Click the **"Deploy with Vercel"** button above
2. Sign in with GitHub (create a free account if needed)
3. Fill in your credentials when prompted:
   - `PARTNER_TENANT_ID` - Your MSP's tenant ID
   - `PARTNER_CLIENT_ID` - Your app registration client ID
   - `PARTNER_CLIENT_SECRET` - Your app registration secret
   - `SOURCE_TENANT_ID` - Where your master agent lives
   - `SOURCE_ENVIRONMENT_URL` - e.g., `https://yourdev.crm.dynamics.com`
4. Click Deploy → Your Control Tower dashboard is live in ~2 minutes

To add customer tenants, either:
- Set `TENANTS_JSON` env var with a JSON array of tenants, OR
- Edit `config/tenants.yaml` in your forked repo (see [Configuration](#configuration))

**Production-ready?** Currently BETA. Works for testing and demos with demo mode. For production deployment with live customer data, complete the [production readiness checklist](https://github.com/pax8labs/agentsync/issues) first. For batch deployments to your entire fleet or scheduled overnight rollouts, use [Docker](#option-2-docker---recommended-for-scale) instead (Vercel has a 10-second timeout per request on free tier).

### Option B: Run Locally (5 commands)

Run the Control Tower web dashboard on your local machine:

```bash
git clone https://github.com/pax8labs/agentsync.git
cd agentsync
npm install -g pnpm           # Skip if you have pnpm
pnpm install && pnpm build
cp .env.example .env          # Then edit with your credentials
pnpm web                      # Opens Control Tower dashboard at localhost:3000
```

> **Note:** Local mode runs with SQLite for data persistence. Redis is optional for background job processing - without it, deployments run synchronously during web requests. Great for testing and small fleets.
>
> **Demo Mode**: Set `DEMO_MODE=true` in `.env` to test the UI with mock data (no Azure AD or customer tenants required).

**Need to deploy to 50+ tenants at once?** Skip to [Docker Setup](#option-2-docker---recommended-for-scale) for production-scale deployments with parallel processing.

---

## 📋 What You'll Need

| Requirement | Who Sets This Up | You Probably Have It If... |
|-------------|------------------|---------------------------|
| GDAP relationships | You (MSP admin) | You manage customers in Partner Center |
| Azure AD App Registration | You or your IT team | You've done SSO or API integrations |
| Power Platform Admin role | Customer approval | Customers approved your GDAP request |

**Don't have GDAP yet?** See [Prerequisites](#prerequisites) below for step-by-step setup.

---

## Features

### Core Capabilities
- **Multi-tenant shipping** - Ship crates to 200+ destinations in parallel with rate limiting
- **GDAP authentication** - Secure cross-tenant access using Microsoft's delegated admin model
- **CLI and Control Tower** - Choose your preferred interface
- **Job queue system** - Reliable shipments with retry logic and progress tracking
- **Tag-based targeting** - Ship to fleet groups (e.g., "enterprise", "pilot")

### Advanced Features (v2.0)
- **SQLite Persistence** - Durable storage for deployments, approvals, and audit logs that survives restarts
- **Approval Workflows** - Multi-approver voting system with expiration and audit trail
- **Health Checks** - Validate tenant environments with persistent historical results
- **Audit Logging** - Complete audit trail of all deployment and approval actions
- **Connection Reference Mapping** - Automatically map connection references to target connections
- **Environment Variables** - Configure tenant-specific environment variables
- **Deployment Waves** - Staged rollouts with configurable parallelism and wait times
- **Rollback Capability** - Create snapshots before deployment, rollback on failure
- **Webhook Notifications** - Real-time notifications to external systems (Slack, Teams, etc.)
- **Scheduled Deployments** - Cron-based scheduling with maintenance windows
- **Solution Diff & Preview** - Compare solutions before deployment

## Architecture

**Vercel / Serverless (simple):**
```
┌─────────────────┐                          ┌─────────────────┐
│  Control Tower  │─────────────────────────▶│   Customer A    │
│     (Web)       │───────────┐              └─────────────────┘
└─────────────────┘           │              ┌─────────────────┐
                              └─────────────▶│   Customer B    │
                                             └─────────────────┘
```

**Docker / Self-hosted (scales to 200+ tenants):**
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   CLI / Control │────▶│   Dock Queue    │────▶│    Dockworker   │
│   Tower (Web)   │     │   (Redis)       │     │    (Worker)     │
└────────┬────────┘     └─────────────────┘     └────────┬────────┘
         │                                                │
         │                                                │
         └────▶ SQLite Database ◀────────────────────────┘
                (Deployments, Approvals, Audit Logs)

         │                          │                          │
         ▼                          ▼                          ▼
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│   Customer A    │       │   Customer B    │       │   Customer C    │
└─────────────────┘       └─────────────────┘       └─────────────────┘
```

> **How it works:** Copilot Studio agents live in Microsoft Dataverse (the database behind Power Platform). AgentSync uses the Dataverse API to export your agent as a "solution" from your dev environment, then imports it into each customer's environment via GDAP.

## Prerequisites (Detailed)

### 1. Azure AD App Registration (One-Time)

**In your partner tenant [Azure Portal](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade):**

1. Navigate to **Azure Active Directory** → **App registrations** → **New registration**
2. Configure:
   - Name: `AgentSync Deployment Tool`
   - Supported account types: **Accounts in any organizational directory (Multitenant)**
3. After creation, note these values:
   - **Application (client) ID** - You'll enter this in AgentSync settings
   - **Directory (tenant) ID** - Your partner tenant ID
4. **Create client secret:**
   - Certificates & secrets → New client secret
   - Copy the **value** immediately (shown only once!)
5. **Add API permissions:**
   - API permissions → Add a permission
   - **Dynamics CRM** → Delegated permissions → `user_impersonation`
   - Click "Grant admin consent" ✓
6. **Optional - for direct import:**
   - Add **Microsoft Graph** → Delegated → `DelegatedAdminRelationship.Read.All`
   - Add **PowerApps Service** → Delegated → `User`

### 2. GDAP Relationships (Per Customer)

**What is GDAP?** Microsoft's secure delegation model that lets you access customer tenants without storing their credentials.

**Setup in Partner Center:**

1. Sign in to [Microsoft Partner Center](https://partner.microsoft.com/en-us/dashboard/customers)
2. Navigate to **Customers** → Select your customer
3. Go to **Account** → **Admin relationships**
4. Click **"Request a delegated admin relationship"**
5. Configure:
   - Relationship name: `AgentSync Deployment Access`
   - Duration: 2 years (default)
   - Roles to request: ☑️ **Power Platform Administrator** (required)
6. Send invitation link to customer
7. Customer approves in their Microsoft 365 Admin Center
8. Status changes to **"Active"** ✓

**Once active, AgentSync automatically discovers this customer!** No manual tenant configuration needed.

### 3. Application User (Per Customer) - Optional

*Only needed if you encounter permission issues. Most MSPs with GDAP + Power Platform Admin role don't need this.*

If required, in each customer's environment:
1. Power Platform Admin Center → Environments → [Environment] → Settings
2. Users + permissions → Application users → New app user
3. Add your partner app registration
4. Assign: System Administrator or Solution Import role

## Installation

Choose the option that matches your comfort level:

| Option | Best For | Technical Skill |
|--------|----------|-----------------|
| [Vercel (Cloud)](#option-1-vercel-cloud---easiest) | IT admins, quick setup | ⭐ Beginner |
| [Docker](#option-2-docker---recommended-for-scale) | Self-hosted, bulk deployments | ⭐⭐ Intermediate |
| [Local Development](#option-3-local-development) | Developers, customization | ⭐⭐⭐ Advanced |

### Option 1: Vercel (Cloud) - Easiest

No servers to manage. Click the button at the top of this README, fill in your credentials, done.

**Limitations:** Vercel runs each deployment during the web request (no background worker). Works great for deploying to a few tenants at a time. For bulk "deploy to all 200 tenants overnight" scenarios, use Docker—it has a dedicated worker that processes deployments in parallel.

### Option 2: Docker - Recommended for Scale

```bash
# Clone the repository
git clone https://github.com/pax8labs/agentsync.git
cd agentsync

# Configure
cp config/tenants.example.yaml config/tenants.yaml
cp .env.example .env
# Edit both files with your values

# Start services (web dashboard + worker + Redis)
docker-compose up -d
```

Access Control Tower at `http://localhost:3000`

### Option 3: Local Development

For developers who want to customize or contribute:

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Set environment variables
export PARTNER_CLIENT_SECRET="your-secret"

# Start Control Tower
pnpm web  # Runs at http://localhost:3000

# Optional: For background job processing with Redis (recommended for production)
docker run -d --name agentsync-redis -p 6379:6379 \
  -v agentsync-redis-data:/data \
  redis:7-alpine redis-server --appendonly yes
pnpm worker  # In a separate terminal
```

> **Note:** The SQLite database is created automatically at `./data/agentsync.db` on first run. The Redis command above includes persistence (`--appendonly yes` and a volume mount) so queued jobs survive container restarts. For production at scale, use `docker-compose up` which handles this automatically.

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

Require approvals before deployment with multi-approver voting:

```yaml
settings:
  approval:
    required: true
    approvers:
      - admin@yourcompany.com
      - lead@yourcompany.com
    minApprovals: 2
    timeout: "24h"
    autoApproveForTags: ["test", "pilot"]
```

**Features:**
- Multiple approvers can vote (approve/reject) on each deployment
- Deployments proceed once minimum approvals are reached
- Any rejection immediately blocks the deployment
- Complete audit trail stored in SQLite database
- Approvals expire after configured timeout
- Real-time approval panel in Control Tower dashboard

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PARTNER_CLIENT_SECRET` | Azure AD app client secret | Required |
| `DATABASE_PATH` | SQLite database file location | `./data/agentsync.db` |
| `REDIS_URL` | Redis connection URL (optional for demo mode) | `redis://localhost:6379` |
| `CONFIG_PATH` | Path to tenants.yaml | `./config/tenants.yaml` |
| `WORKER_CONCURRENCY` | Parallel deployments | `5` |
| `SNAPSHOTS_DIR` | Directory for rollback snapshots | `./snapshots` |
| `DEMO_MODE` | Enable demo mode (uses in-memory stores) | `false` |

## CLI Usage

### Pack a Solution (Export)

```bash
# Pack as managed (default)
agentsync pack --solution "CustomerServiceAgent" --output ./crates/

# Pack as unmanaged
agentsync pack --solution "CustomerServiceAgent" --output ./crates/ --unmanaged
```

### Ship to Destinations (Deploy)

```bash
# Ship to all enabled destinations
agentsync ship --solution ./crates/CustomerServiceAgent_managed.zip --all

# Ship to destinations with specific tags
agentsync ship --solution ./crates/CustomerServiceAgent_managed.zip --tag enterprise

# Ship to multiple tag groups
agentsync ship --solution ./crates/CustomerServiceAgent_managed.zip --tag enterprise --tag pilot

# Dry run (see what would be shipped)
agentsync ship --solution ./crates/CustomerServiceAgent_managed.zip --all --dry-run
```

### Track Shipment Status

```bash
# One-time status check
agentsync track --shipment <shipment-id>

# Watch for updates
agentsync track --shipment <shipment-id> --watch
```

### Manage Fleet (Tenants)

```bash
# List all destinations in your fleet
agentsync fleet list

# Filter by tag
agentsync fleet list --tag enterprise

# Validate GDAP access
agentsync fleet validate
```

### Deliver to Single Destination (Testing)

```bash
agentsync deliver --solution ./crates/CustomerServiceAgent_managed.zip --tenant <tenant-id>
```

## Control Tower (Web Dashboard)

Access at `http://localhost:3000`

- **Dashboard** - Overview stats, recent shipments, and pending approvals
- **Solutions** - Browse and pack solutions from your source environment (warehouse)
- **Fleet** - View configured destinations with health check status
- **Agents** - Manage deployed agents across your tenant fleet
- **Deployments** - List all deployments with real-time status and approval states
- **New Deployment** - Upload solution and select target destinations
- **Deployment Detail** - View per-destination progress, approval panel, retry failed, or rollback
- **Tenant Detail** - Run health checks, view deployment history, and manage connections

### Data Persistence

AgentSync uses SQLite for durable storage:
- **Deployment History** - Complete history of all deployments with batch tracking
- **Approval Records** - Full audit trail of approvals with voter information
- **Health Check Results** - Historical health check data for trend analysis
- **Audit Logs** - Comprehensive logging of all system actions
- **Rollback Snapshots** - Metadata for solution snapshots

The database is created automatically at `./data/agentsync.db` (configurable via `DATABASE_PATH` environment variable).

## Project Structure

```
agentsync/
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
│       └── src/
│           ├── app/              # Next.js app routes
│           ├── components/       # React components
│           └── lib/
│               ├── db.ts              # SQLite database client
│               ├── db-schema.sql     # Database schema
│               └── repositories/     # Data access layer
│
├── config/
│   └── tenants.yaml    # Your fleet configuration
├── data/               # SQLite database (created automatically)
│   └── agentsync.db
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
- Run `agentsync fleet validate` to check all destinations

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
| `/api/solutions/diff` | POST | Preview deployment diff for a tenant |
| `/api/deployments` | GET | List shipments |
| `/api/deployments/[id]` | GET | Shipment details |
| `/api/deployments/create` | POST | Create new shipment (requires Redis) |
| `/api/deployments/process` | POST | **Deploy without Redis** (serverless-friendly) |
| `/api/deployments/[id]/retry` | POST | Retry failed destination deliveries |
| `/api/deployments/[id]/cancel` | POST | Cancel pending deliveries |
| `/api/deployments/[id]/approve` | GET | Get approval status |
| `/api/deployments/[id]/approve` | POST | Approve or reject a deployment |
| `/api/deployments/[id]/rollback` | POST | Rollback a deployment |
| `/api/tenants/[id]/health` | GET | Get last health check result |
| `/api/tenants/[id]/health` | POST | Run health check for tenant |
| `/api/schedules` | GET | Get scheduled deployment info |

### Serverless Deployments (No Redis)

For Vercel, Netlify, or other serverless environments without Redis, use the `/api/deployments/process` endpoint directly:

```bash
curl -X POST http://localhost:3000/api/deployments/process \
  -H "Content-Type: application/json" \
  -d '{
    "tenantIds": ["tenant-uuid-1", "tenant-uuid-2"],
    "solutionPath": "./solutions/MyAgent_managed.zip",
    "solutionName": "MyAgent"
  }'
```

**Response:**
```json
{
  "deploymentId": "generated-uuid",
  "status": "completed",
  "totalTenants": 2,
  "successCount": 2,
  "failedCount": 0,
  "results": [
    { "tenantId": "...", "tenantName": "...", "success": true, "durationMs": 45000 }
  ]
}
```

**Limitations vs Redis-based deployments:**
- Deployments run sequentially (not parallel)
- 5-minute timeout (Vercel Pro) or 10-second (Vercel Hobby)
- No job persistence - if the request is interrupted, you must retry
- Best for small fleets (< 20 tenants) or infrequent deployments

## Known Limitations

1. **make.powerapps.com does not support GDAP** - All operations must go through APIs
2. **Connection references** - Now supported via mapping configuration
3. **Environment variables** - Now supported via configuration
4. **Flows with owner-only triggers** - May require manual configuration

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.

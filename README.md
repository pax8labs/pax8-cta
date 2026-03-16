# AgentSync

Multi-tenant Copilot Studio deployment tool for MSPs.

[![CI](https://github.com/pax8-oss/agentsync/actions/workflows/ci.yml/badge.svg)](https://github.com/pax8-oss/agentsync/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![npm version](https://img.shields.io/npm/v/@agentsync/cli.svg)](https://www.npmjs.com/package/@agentsync/cli)

---

## What It Does

AgentSync exports Power Platform solutions (Copilot Studio agents) from a source Dataverse environment and imports them into customer tenants via GDAP (Granular Delegated Admin Privileges). It handles authentication, connection reference mapping, environment variables, staged rollouts, and rollback -- so you can deploy one agent to hundreds of customer environments in minutes.

## Quick Start

```bash
npm install -g @agentsync/cli
agentsync init                    # Set up credentials and config
agentsync validate                # Verify GDAP access to all tenants
agentsync export --solution "CustomerServiceAgent"
agentsync deploy --solution ./exports/CustomerServiceAgent_managed.zip --all
```

**Time to first deployment:** ~15 minutes (including GDAP setup).
**Time per subsequent deployment:** ~2 minutes, whether it's 1 tenant or 100.

---

## Prerequisites

### 1. GDAP Relationships (Per Customer)

**What is GDAP?** Microsoft's secure delegation model that lets you access customer tenants without storing their credentials.

**Setup in [Partner Center](https://partner.microsoft.com/en-us/dashboard/customers):**

1. Navigate to **Customers** > Select your customer
2. Go to **Account** > **Admin relationships**
3. Click **"Request a delegated admin relationship"**
4. Configure:
   - Relationship name: `AgentSync Deployment Access`
   - Duration: 2 years (default)
   - Roles to request: **Power Platform Administrator** (required)
5. Send invitation link to customer
6. Customer approves in their Microsoft 365 Admin Center
7. Status changes to **"Active"**

Once active, AgentSync automatically discovers this customer. No manual tenant configuration needed.

### 2. Azure AD App Registration (One-Time)

**In your partner tenant's [Azure Portal](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade):**

1. Navigate to **Azure Active Directory** > **App registrations** > **New registration**
2. Configure:
   - Name: `AgentSync Deployment Tool`
   - Supported account types: **Accounts in any organizational directory (Multitenant)**
3. After creation, note these values:
   - **Application (client) ID**
   - **Directory (tenant) ID** (your partner tenant ID)
4. **Create client secret:**
   - Certificates & secrets > New client secret
   - Copy the **value** immediately (shown only once)
5. **Add API permissions:**
   - API permissions > Add a permission
   - **Dynamics CRM** > Delegated permissions > `user_impersonation`
   - Click "Grant admin consent"
6. **Optional -- for GDAP discovery:**
   - Add **Microsoft Graph** > Delegated > `DelegatedAdminRelationship.Read.All`
   - Add **PowerApps Service** > Delegated > `User`

### 3. Application User (Per Customer) -- Optional

_Only needed if you encounter permission issues. Most MSPs with GDAP + Power Platform Admin role don't need this._

If required, in each customer's environment:

1. Power Platform Admin Center > Environments > [Environment] > Settings
2. Users + permissions > Application users > New app user
3. Add your partner app registration
4. Assign: System Administrator or Solution Import role

---

## Installation

### From npm (recommended)

```bash
npm install -g @agentsync/cli
```

### Standalone Binaries

Pre-built binaries are available for macOS (arm64, x64), Linux (arm64, x64), and Windows (x64). Download from the [Releases](https://github.com/pax8-oss/agentsync/releases) page, or use the install scripts:

**macOS / Linux:**

```bash
curl -fsSL https://raw.githubusercontent.com/pax8-oss/agentsync/main/install.sh | bash
```

**Windows (PowerShell):**

```powershell
irm https://raw.githubusercontent.com/pax8-oss/agentsync/main/install.ps1 | iex
```

### From Source

```bash
git clone https://github.com/pax8-oss/agentsync.git
cd agentsync
npm install -g pnpm
pnpm install && pnpm build
pnpm cli    # Run the CLI
```

---

## CLI Command Reference

Run `agentsync` with no arguments to enter interactive REPL mode, or use commands directly:

| Command                 | Description                                          |
| ----------------------- | ---------------------------------------------------- |
| `agentsync deploy`      | Deploy a solution to multiple tenants                |
| `agentsync export`      | Export a solution from the source environment        |
| `agentsync import`      | Import a solution into a single tenant               |
| `agentsync validate`    | Verify GDAP access and connectivity for all tenants  |
| `agentsync analyze`     | Analyze a solution package before deployment         |
| `agentsync tenants`     | List, inspect, and manage customer tenants           |
| `agentsync solutions`   | List solutions in the source environment             |
| `agentsync agents`      | List agents and analyze drift across tenants         |
| `agentsync deployments` | View deployment history and status                   |
| `agentsync auth`        | Test authentication and token acquisition            |
| `agentsync setup`       | Configure credentials interactively                  |
| `agentsync init`        | Initialize a new AgentSync project with config files |
| `agentsync status`      | Show current configuration and connection status     |
| `agentsync telemetry`   | View or change anonymous usage telemetry settings    |

### Deploy

Deploy a solution to multiple tenants at once.

```bash
# Deploy to all enabled tenants
agentsync deploy --solution ./exports/CustomerServiceAgent_managed.zip --all

# Deploy to tenants with a specific tag
agentsync deploy --solution ./exports/CustomerServiceAgent_managed.zip --tag enterprise

# Deploy to multiple tag groups
agentsync deploy --solution ./exports/CustomerServiceAgent_managed.zip --tag enterprise --tag pilot

# Dry run (see what would be deployed without deploying)
agentsync deploy --solution ./exports/CustomerServiceAgent_managed.zip --all --dry-run
```

### Export

Export a solution from your source environment.

```bash
# Export as managed (default)
agentsync export --solution "CustomerServiceAgent"

# Export as unmanaged
agentsync export --solution "CustomerServiceAgent" --unmanaged
```

### Import

Import a solution into a single tenant (useful for testing).

```bash
agentsync import --solution ./exports/CustomerServiceAgent_managed.zip --tenant <tenant-id>
```

### Validate

Check GDAP access and environment connectivity for all configured tenants.

```bash
agentsync validate
```

### Analyze

Inspect a solution package to see components, dependencies, and connection references before deploying.

```bash
agentsync analyze --solution ./exports/CustomerServiceAgent_managed.zip
```

### Tenants

Manage and inspect your customer tenant fleet.

```bash
# List all tenants
agentsync tenants list

# Filter by tag
agentsync tenants list --tag enterprise

# Inspect a specific tenant
agentsync tenants show <tenant-id>

# Run health check
agentsync tenants health <tenant-id>
```

### Solutions

List solutions available in the source environment.

```bash
agentsync solutions list
```

### Agents

View deployed agents and analyze drift across tenants.

```bash
# List agents
agentsync agents list

# Show agent details
agentsync agents show <agent-id>

# Analyze agent drift across tenants
agentsync agents drift
```

### JSON Output

Most commands support `--format json` for scripting and automation:

```bash
agentsync tenants list --format json
agentsync deployments list --format json
```

---

## Configuration

### Fleet Configuration (`config/tenants.yaml`)

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

Run `agentsync init` to generate this file interactively.

### Connection Reference Mapping

Map source connection references to target connections for each tenant:

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

Deploy in stages with health checks between waves:

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

Enable automatic snapshots and rollback:

```yaml
settings:
  rollback:
    enabled: true
    keepVersions: 3
    autoRollbackOnFailure: false
    rollbackTimeout: "10m"
```

### Webhook Notifications

Send notifications to external systems on deployment events:

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

### Environment Variables (Shell)

| Variable                | Description                      | Default                 |
| ----------------------- | -------------------------------- | ----------------------- |
| `PARTNER_CLIENT_SECRET` | Azure AD app client secret       | Required                |
| `CONFIG_PATH`           | Path to tenants.yaml             | `./config/tenants.yaml` |
| `DEMO_MODE`             | Enable demo mode with mock data  | `false`                 |
| `SNAPSHOTS_DIR`         | Directory for rollback snapshots | `./snapshots`           |

Set credentials via `agentsync setup` or export them directly:

```bash
export PARTNER_CLIENT_SECRET="your-secret"
```

---

## Security and Credentials

- **No credential storage** -- AgentSync uses GDAP delegation and never stores customer credentials
- **Token lifecycle** -- Access tokens expire after 1 hour and are automatically refreshed
- **Least privilege** -- Only requests minimum required API permissions
- **Audit logging** -- All operations are logged with timestamps and outcomes
- **TLS required** -- All API communication is over HTTPS

---

## Testing

AgentSync has comprehensive test coverage:

- **Core library**: 511 tests covering auth, config, Dataverse client, and services
- **CLI**: ~180 integration tests covering all commands, error handling, and edge cases

```bash
# Run all tests
pnpm test

# CLI tests only
pnpm --filter @agentsync/cli test

# CLI tests with coverage
pnpm --filter @agentsync/cli test:coverage

# Single test file
pnpm --filter @agentsync/cli test -- --run src/__tests__/deploy.test.ts

# Core tests only
pnpm --filter @agentsync/core test
```

Tests run in demo mode by default (no Azure AD credentials or customer tenants required).

---

## Architecture

```
agentsync
├── packages/
│   ├── cli/             # CLI application (Commander.js)
│   │   └── src/
│   │       ├── commands/     # All CLI commands
│   │       └── index.ts      # Entry point + REPL mode
│   │
│   └── core/            # Shared business logic
│       └── src/
│           ├── auth/         # GDAP + Azure AD token management
│           ├── config/       # YAML config schema (Zod validation)
│           ├── dataverse/    # Solution export/import, connection refs
│           └── services/     # Deployment, health, rollback, webhooks, waves
│
├── config/
│   └── tenants.yaml     # Fleet configuration
└── exports/             # Exported solution files
```

```
                    ┌──────────────┐
                    │  agentsync   │
                    │    CLI       │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │    @agent-   │
                    │  sync/core   │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
       ┌──────▼──┐  ┌──────▼──┐  ┌──────▼──┐
       │ Entra ID│  │Dataverse│  │  Graph   │
       │ (Auth)  │  │  (API)  │  │(Optional)│
       └─────────┘  └────┬────┘  └──────────┘
                         │
          ┌──────────────┼──────────────┐
          │              │              │
   ┌──────▼──────┐┌─────▼───────┐┌─────▼───────┐
   │ Customer A  ││ Customer B  ││ Customer C  │
   │  Dataverse  ││  Dataverse  ││  Dataverse  │
   └─────────────┘└─────────────┘└─────────────┘
```

**How it works:** Copilot Studio agents are stored in Microsoft Dataverse (the database behind Power Platform). AgentSync uses the Dataverse API to export your agent as a "solution" from your development environment, then imports it into each customer's environment using GDAP for cross-tenant authentication.

---

## Microsoft APIs Used

### Dataverse Web API

- **Purpose**: Solution import/export, agent management
- **Key endpoints**: `ExportSolution`, `ImportSolution`, `solutions`, `bots`, `connectionreferences`, `environmentvariabledefinitions`
- **Auth**: OAuth 2.0 with delegated permissions via GDAP
- **Rate limits**: 6,000 requests per 5 minutes per user (handled with exponential backoff)
- **Docs**: [Dataverse Web API Reference](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/overview)

### Microsoft Entra ID (Azure AD)

- **Purpose**: Authentication, cross-tenant token acquisition
- **Permissions required**: `Dynamics CRM > user_impersonation` (delegated)
- **Grant type**: `client_credentials` with GDAP delegation
- **Docs**: [Microsoft identity platform](https://learn.microsoft.com/en-us/entra/identity-platform/)

### Microsoft Graph API (Optional)

- **Purpose**: GDAP relationship discovery, customer tenant enumeration
- **Docs**: [Graph API Reference](https://learn.microsoft.com/en-us/graph/api/overview)

### Power Platform API

- **Purpose**: Environment health checks, tenant validation
- **Docs**: [Power Platform API](https://learn.microsoft.com/en-us/power-platform/admin/programmability-tutorial)

### Authentication Flow

```mermaid
sequenceDiagram
    participant CLI as AgentSync CLI
    participant Entra as Entra ID
    participant GDAP as Partner Center
    participant Tenant as Customer Tenant

    CLI->>Entra: Request token (client credentials)
    Entra->>GDAP: Verify GDAP relationship
    GDAP-->>Entra: GDAP approved
    Entra-->>CLI: Access token (customer tenant scope)
    CLI->>Tenant: Call Dataverse API
    Tenant-->>CLI: Solution deployed
```

### API Rate Limits

| API               | Limit                        | Handling                             |
| ----------------- | ---------------------------- | ------------------------------------ |
| Dataverse Web API | 6,000 requests/5min per user | Exponential backoff, request queuing |
| Graph API         | 12,000 requests/10sec        | Batching, rate limit detection       |
| Entra ID Token    | 2,000 requests/min           | Token caching (1hr TTL)              |

---

## Troubleshooting

### "Failed to acquire token"

- Verify `PARTNER_CLIENT_SECRET` is set correctly
- Check that the app registration has admin consent
- Ensure the client secret hasn't expired

### "No active GDAP relationship"

- Verify GDAP relationship is approved in Partner Center
- Check that the relationship includes Power Platform Administrator role
- Run `agentsync validate` to check all tenants

### "Import failed: missing dependencies"

- Ensure all solution dependencies are installed in the target environment
- Check that the solution was exported with "Add required objects"

### "Rate limited"

- AgentSync automatically retries with exponential backoff
- For large fleets, use deployment waves to stagger the rollout

### "Connection reference not found"

- Verify the connection reference logical name matches the source
- Ensure the target connection ID exists in the customer environment
- Check that connections are shared with the application user

### Known Limitations

1. **make.powerapps.com does not support GDAP** -- All operations must go through APIs
2. **Flows with owner-only triggers** -- May require manual configuration in the target environment
3. **Cross-region deployments** -- May experience higher latency (API calls traverse regions)

---

## Telemetry

AgentSync collects anonymous usage telemetry to help improve the tool. This is **enabled by default** and can be disabled at any time.

**What's collected:** command names, flags used (names only, not values), success/failure, execution duration, CLI version, OS platform.

**What's never collected:** tenant IDs, solution names, file paths, environment URLs, error messages, or any personally identifiable information.

**Opt out:**

```bash
agentsync telemetry off
# or
export AGENTSYNC_TELEMETRY_DISABLED=1
```

Telemetry is automatically disabled in CI environments (`CI=true`) and respects the [`DO_NOT_TRACK`](https://consoledonottrack.com/) standard.

---

## License

Apache 2.0 -- see [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome. Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines, or open an issue to discuss your idea first.

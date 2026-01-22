# AgentSync CLI

Sync your Copilot Studio agents to all your tenants from the command line.

## Quick Start

```bash
# Try demo mode first (no credentials needed)
agentsync init --demo
agentsync tenants list

# When ready for production
agentsync demo off
agentsync init
```

## Interactive Shell Mode

Run `agentsync` without arguments to enter interactive mode where you can run commands without typing "agentsync" each time:

```bash
$ agentsync

   ___                   _   ____
  /   |  ____ ____  ____(_) / __/_ ______  _____
 / /| | / __  / _ \/ __ / / /_/ / / / __ \/ ___/
/ ___ |/ /_/ /  __/ / / / /__/ /_/ / / / / /__
/_/  |_|\__, /\___/_/ /_/\___/\__, /_/ /_/\___/
       /____/                /____/

Sync your agents to all your tenants | v0.1.0

Interactive mode - Type 'help' for commands or 'exit' to quit

AgentSync> tenants list
(displays tenants)

AgentSync> demo status
Demo mode: ENABLED

AgentSync> exit
Goodbye!
$
```

## Installation

### Quick Install (macOS/Linux)

```bash
curl -fsSL https://raw.githubusercontent.com/pax8labs/agentsync/main/install.sh | bash
```

### Homebrew (macOS/Linux)

```bash
brew install pax8labs/agentsync/agentsync
```

### Download Binary

Download the appropriate binary for your platform from the [latest release](https://github.com/pax8labs/agentsync/releases/latest):

#### macOS

```bash
# Apple Silicon (M1/M2/M3)
curl -fsSL https://github.com/pax8labs/agentsync/releases/latest/download/agentsync-macos-arm64 -o agentsync
chmod +x agentsync
sudo mv agentsync /usr/local/bin/

# Intel
curl -fsSL https://github.com/pax8labs/agentsync/releases/latest/download/agentsync-macos-x64 -o agentsync
chmod +x agentsync
sudo mv agentsync /usr/local/bin/
```

#### Linux

```bash
# x64
curl -fsSL https://github.com/pax8labs/agentsync/releases/latest/download/agentsync-linux-x64 -o agentsync
chmod +x agentsync
sudo mv agentsync /usr/local/bin/

# ARM64
curl -fsSL https://github.com/pax8labs/agentsync/releases/latest/download/agentsync-linux-arm64 -o agentsync
chmod +x agentsync
sudo mv agentsync /usr/local/bin/
```

#### Windows

1. Download [agentsync-windows-x64.exe](https://github.com/pax8labs/agentsync/releases/latest/download/agentsync-windows-x64.exe)
2. Rename to `agentsync.exe`
3. Add to your PATH or move to a directory in your PATH

### npm/npx (Alternative)

If you have Node.js installed:

```bash
# Global install
npm install -g @agentsync/cli

# Or run with npx (no install needed)
npx @agentsync/cli --help
```

### Verify Installation

```bash
agentsync --version
agentsync --help
```

## Quick Start

### 1. Deploy an Agent to All Tenants

```bash
agentsync deploy --all --solution ./myagent.zip
```

### 2. Deploy to Specific Tenants (by tag)

```bash
agentsync deploy --tag production --solution ./myagent.zip
```

### 3. Check Deployment Status

```bash
# Get deployment ID from the deploy command output
agentsync status --deployment dep-abc123

# Watch mode (auto-refresh)
agentsync status --deployment dep-abc123 --watch
```

### 4. List Your Tenants

```bash
agentsync tenants list
```

### 5. Validate Tenant Access

```bash
agentsync tenants inspect
```

## Commands

### Init (Setup)

Initialize AgentSync with guided setup.

```bash
# Quick demo setup (no credentials needed)
agentsync init --demo

# Full production setup (interactive wizard)
agentsync init

# Custom config location
agentsync init --config ./custom/config.yaml
```

The setup wizard will prompt for:
- Partner Tenant ID (from Partner Center)
- App Registration Client ID (Azure AD)
- Environment variable instructions for client secret
- Optional sample tenant configuration

**Options**:
- `-c, --config <path>` - Path to create config file (default: `./config/tenants.yaml`)
- `--demo` - Set up in demo mode (skip credential prompts)

### Demo (Toggle Demo Mode)

Toggle demo mode for testing without credentials.

```bash
# Enable demo mode
agentsync demo on

# Disable demo mode
agentsync demo off

# Toggle (switch between on/off)
agentsync demo

# Check current status
agentsync demo status
```

Demo mode persists across sessions and allows you to explore all CLI features with mock data.

**Why use demo mode?**
- Test workflows without setting up credentials
- Demo the tool to prospects or team members
- Learn commands before production use
- Develop and test integrations

### Analyze (Risk Analysis)

Analyze deployment risk before deploying to identify potential issues.

```bash
# Analyze risk for all enabled tenants
agentsync analyze --all --solution ./agent.zip

# Analyze risk for tenants with specific tags
agentsync analyze --tag production --solution ./agent.zip

# Output results as JSON (for scripting)
agentsync analyze --all --solution ./agent.zip --json

# Use custom config file
agentsync analyze --all --solution ./agent.zip --config ./my-config.yaml
```

The risk analyzer checks for:
- **GDAP Permissions**: Missing Power Platform Admin role
- **Connection Issues**: Expired connection references
- **Tenant Health**: Recurring deployment failures (2+ times in 24h)
- **Historical Success**: Low success rates (requires 20+ deployments for statistical confidence)

**Risk Levels**:
- 🟢 **Low**: All checks passed, ready to deploy
- 🟡 **Medium**: Some warnings, proceed with caution
- 🟠 **High**: Multiple issues detected, review carefully
- 🔴 **Critical**: Blockers present, cannot deploy until fixed

**Output includes**:
- Risk score and confidence level
- Success probability percentage
- Estimated deployment duration
- Detailed list of issues with resolutions
- Actionable recommendations

**Why use analyze?**
- Catch permission issues before deployment
- Avoid repeating known failures
- Estimate deployment time for planning
- Get confidence in deployment success

**Options**:
- `-s, --solution <path>` - Path to agent solution ZIP file (required)
- `--all` - Analyze all enabled tenants
- `-t, --tag <tags...>` - Analyze only tenants with these tags
- `-c, --config <path>` - Path to config file (default: `./config/tenants.yaml`)
- `--json` - Output results as JSON

### Deploy

Deploy agents to your tenants. (Alias: `ship`)

```bash
# Deploy to all enabled tenants
agentsync deploy --all --solution ./agent.zip

# Deploy to tenants with specific tags
agentsync deploy --tag production --tag eu --solution ./agent.zip

# Dry run (preview without deploying)
agentsync deploy --all --solution ./agent.zip --dry-run

# Use custom config file
agentsync deploy --all --solution ./agent.zip --config ./my-config.yaml
```

**Aliases**: `deploy`

**Options**:
- `-s, --solution <path>` - Path to agent solution ZIP file (required)
- `--all` - Deploy to all enabled tenants
- `-t, --tag <tags...>` - Deploy only to tenants with these tags
- `--dry-run` - Preview deployment without executing
- `-c, --config <path>` - Path to config file (default: `./config/tenants.yaml`)
- `--redis <url>` - Redis URL (default: `redis://localhost:6379`)

### Status

Check deployment status with real-time updates. (Alias: `track`)

```bash
# Check deployment status
agentsync status --deployment dep-abc123

# Watch mode (auto-refresh every 5s)
agentsync status --deployment dep-abc123 --watch

# Custom refresh interval
agentsync status --deployment dep-abc123 --watch --interval 10000
```

**Aliases**: `status`

**Options**:
- `-d, --deployment <id>` - Deployment ID to check
- `-s, --shipment <id>` - Alias for --deployment
- `-w, --watch` - Watch for status changes (auto-refresh)
- `--interval <ms>` - Refresh interval in milliseconds (default: 5000)
- `--redis <url>` - Redis URL (default: `redis://localhost:6379`)

### Tenants

Manage your tenants. (Alias: `fleet`)

```bash
# List all tenants
agentsync tenants list

# List with filters
agentsync tenants list --tag production
agentsync tenants list --enabled
agentsync tenants list --disabled

# Validate tenant access (GDAP permissions)
agentsync tenants inspect
agentsync tenants inspect --tag production
```

**Aliases**: `tenants`

**Commands**:
- `list` - List all tenants
- `inspect` - Validate tenant access and GDAP permissions

### Export

(Alias: `pack`)

Export a Copilot Studio agent to a solution ZIP file.

```bash
# Export from source environment
agentsync export --solution MyAgent --output ./myagent.zip

# Export specific version
agentsync export --solution MyAgent --version 1.0.0.0 --output ./myagent.zip

# Include dependencies
agentsync export --solution MyAgent --output ./myagent.zip --managed
```

**Aliases**: `export`

**Options**:
- `-s, --solution <name>` - Solution unique name (required)
- `-o, --output <path>` - Output file path (required)
- `-v, --version <version>` - Specific version to export
- `--managed` - Export as managed solution
- `-c, --config <path>` - Path to config file

### Import

(Alias: `deliver`)

Deploy an agent to a single tenant (for testing).

```bash
# Deploy to specific tenant
agentsync import --tenant <tenant-id> --solution ./agent.zip

# Don't overwrite customizations
agentsync import --tenant <tenant-id> --solution ./agent.zip --no-overwrite

# Don't publish workflows
agentsync import --tenant <tenant-id> --solution ./agent.zip --no-publish
```

**Aliases**: `import`

**Options**:
- `-t, --tenant <id>` - Target tenant ID (required)
- `-s, --solution <path>` - Path to solution ZIP (required)
- `--no-overwrite` - Don't overwrite existing customizations
- `--no-publish` - Don't activate workflows after import
- `-c, --config <path>` - Path to config file

### Resolve URL

Resolve an M365 agent URL and export the containing solution.

```bash
# Resolve and export
agentsync resolve-url --url "https://..." --output ./agent.zip
```

**Options**:
- `-u, --url <url>` - M365 agent URL (required)
- `-o, --output <path>` - Output file path (required)
- `-c, --config <path>` - Path to config file

## Configuration

AgentSync uses a YAML configuration file to define your tenants and partner credentials.

**Default location**: `./config/tenants.yaml`

### Example Configuration

```yaml
# Partner/MSP Credentials
partner:
  tenantId: "your-partner-tenant-id"
  clientId: "your-app-client-id"
  # Client secret should be in AGENTSYNC_CLIENT_SECRET env var

# Settings
settings:
  approval:
    required: true
    minApprovals: 2
    timeout: "24h"
    approvers:
      - admin@partner.com
      - manager@partner.com

# Tenants
tenants:
  - tenantId: "customer-tenant-1"
    name: "Contoso Corporation"
    environmentUrl: "https://contoso.crm.dynamics.com"
    enabled: true
    tags:
      - production
      - us-west
      - premium

  - tenantId: "customer-tenant-2"
    name: "Fabrikam Inc"
    environmentUrl: "https://fabrikam.crm.dynamics.com"
    enabled: true
    tags:
      - production
      - eu
      - standard

  - tenantId: "customer-tenant-3"
    name: "Staging Environment"
    environmentUrl: "https://staging.crm.dynamics.com"
    enabled: false
    tags:
      - staging
      - test
```

## Environment Variables

- `AGENTSYNC_CLIENT_SECRET` - Azure AD app client secret (required)
- `AGENTSYNC_INSTALL_DIR` - Custom installation directory (default: `/usr/local/bin`)
- `CONFIG_PATH` - Custom config file path (default: `./config/tenants.yaml`)
- `REDIS_URL` - Redis connection URL (default: `redis://localhost:6379`)

## Authentication

AgentSync uses Azure AD with GDAP (Granular Delegated Admin Privileges) for secure multi-tenant access.

### Setup

1. **Create Azure AD App Registration**
   - Go to Azure Portal > Azure Active Directory > App Registrations
   - Create new registration
   - Note the Application (client) ID and Directory (tenant) ID

2. **Grant API Permissions**
   - Microsoft Graph API: `User.Read.All`
   - Dynamics CRM: `user_impersonation`

3. **Create Client Secret**
   - In app registration, go to Certificates & secrets
   - Create new client secret
   - Copy the secret value

4. **Configure GDAP for Customer Tenants**
   - Set up GDAP relationships in Partner Center
   - Assign appropriate roles (e.g., Dynamics 365 Administrator)

5. **Set Environment Variable**
   ```bash
   export AGENTSYNC_CLIENT_SECRET="your-client-secret"
   ```

6. **Update Configuration**
   - Add partner credentials to `config/tenants.yaml`
   - Add customer tenant details

## Demo Mode

For testing without Azure AD credentials:

```bash
# Set in .env file
DEMO_MODE=true

# Then use the CLI normally
agentsync deploy --all --solution ./demo-agent.zip
```

Demo mode uses in-memory tenants and simulates deployments.

## Troubleshooting

### Command Not Found

If `agentsync` is not found after installation:

```bash
# Add to PATH (add to ~/.bashrc or ~/.zshrc for persistence)
export PATH="/usr/local/bin:$PATH"

# Or install to a directory already in PATH
curl -fsSL https://github.com/pax8labs/agentsync/releases/latest/download/agentsync-macos-arm64 -o ~/bin/agentsync
chmod +x ~/bin/agentsync
```

### Authentication Errors

```bash
# Verify client secret is set
echo $AGENTSYNC_CLIENT_SECRET

# Verify tenant IDs are correct
agentsync tenants list

# Validate GDAP access
agentsync tenants inspect
```

### Connection Errors

```bash
# Check Redis connection
redis-cli ping

# Use custom Redis URL
agentsync deploy --all --solution ./agent.zip --redis redis://custom-host:6379

# Verify tenant environment URLs
agentsync tenants list
```

### Worker Not Running

Deployments are processed by background workers. Make sure the worker is running:

```bash
# Start worker (in separate terminal)
pnpm worker

# Or use Docker
docker-compose up worker
```

## Development

### Build from Source

```bash
# Clone repository
git clone https://github.com/pax8labs/agentsync.git
cd agentsync

# Install dependencies
pnpm install

# Build CLI
cd packages/cli
pnpm build

# Run locally
node dist/index.js --help
```

### Build Binaries

```bash
# Install Bun (required for binary compilation)
curl -fsSL https://bun.sh/install | bash

# Build for current platform
pnpm build:binary

# Build for all platforms
pnpm build:all

# Binaries will be in dist/binaries/
```

### Run Tests

```bash
pnpm test
```

## Binary Sizes

- macOS ARM64: ~59 MB
- macOS x64: ~64 MB
- Linux x64: ~99 MB
- Linux ARM64: ~94 MB
- Windows x64: ~111 MB

Binaries are standalone and include the Bun runtime and all dependencies.

## Telemetry

AgentSync CLI collects anonymous usage analytics to help improve the tool. No personally identifiable information is collected.

**What's collected:** command names, flags used, success/failure, duration, CLI version, OS type.

**What's NOT collected:** tenant IDs, file paths, environment URLs, error details, IP addresses.

**Opt out:**
```bash
agentsync telemetry off
# or
export AGENTSYNC_TELEMETRY_DISABLED=1
```

**Check status:**
```bash
agentsync telemetry status
```

## License

MIT

## Support

- **Documentation**: https://github.com/pax8labs/agentsync
- **Issues**: https://github.com/pax8labs/agentsync/issues
- **Discussions**: https://github.com/pax8labs/agentsync/discussions

## Related Projects

- **AgentSync Web**: Web dashboard for visual deployment management
- **AgentSync Core**: Core library for Dataverse/Dynamics 365 operations
- **AgentSync Worker**: Background worker for deployment processing

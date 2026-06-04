# AgentSync CLI

Sync your Copilot Studio agents to all your tenants from the command line.

## Try it in 30 seconds (no install)

```bash
npx -y pax8-cta demo on && npx -y pax8-cta tenants list
```

Mock-data mode, no credentials, no Azure setup. Then run `npx -y pax8-cta --help` to explore every command.

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

### Homebrew (coming soon)

```bash
# Homebrew tap is not published yet.
# Use install.sh or binary downloads from GitHub Releases.
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
npm install -g pax8-cta

# Or run with npx (no install needed)
npx pax8-cta --help
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

### 3. View Deployment History

```bash
# List recent deployments
agentsync deployments list

# Show a specific deployment history entry
agentsync deployments show dep-abc123

# Check setup/readiness status
agentsync status --setup
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

### Status

Check deployment history in demo mode and setup readiness in real mode. (Alias: `track`)

```bash
# List recent demo shipments
agentsync status --list

# Show setup/readiness status
agentsync status --setup
```

**Aliases**: `status`

**Options**:

- `-l, --list` - List recent shipments (demo mode)
- `--setup` - Show setup/readiness status

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
  # Client secret should be in PAX8_CTA_CLIENT_SECRET env var

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

- `PAX8_CTA_CLIENT_SECRET` - Azure AD app client secret (required)
- `PAX8_CTA_INSTALL_DIR` - Custom installation directory (default: `/usr/local/bin`)
- `CONFIG_PATH` - Custom config file path (default: `./config/tenants.yaml`)

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
   export PAX8_CTA_CLIENT_SECRET="your-client-secret"
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
echo $PARTNER_CLIENT_SECRET

# Verify tenant IDs are correct
agentsync tenants list

# Validate GDAP access
agentsync tenants inspect
```

### Connection Errors

```bash
# Run direct deployment mode
agentsync deploy --all --direct --solution ./agent.zip

# Verify tenant environment URLs
agentsync tenants list
```

### Deployment Failures

AgentSync CLI deployments run directly now, so there is no worker process to start.
If a deployment fails, inspect the tenant details and retry the command:

```bash
agentsync deployments list
agentsync deployments show <deployment-id>
agentsync deploy --all --direct --solution ./agent.zip
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
export PAX8_CTA_TELEMETRY_DISABLED=1
```

**Check status:**

```bash
agentsync telemetry status
```

## License

Apache 2.0

## Support

- **Documentation**: https://github.com/pax8labs/agentsync
- **Issues**: https://github.com/pax8labs/agentsync/issues
- **Discussions**: https://github.com/pax8labs/agentsync/discussions

## Related Projects

- **AgentSync Core**: Core library for Dataverse/Dynamics 365 operations

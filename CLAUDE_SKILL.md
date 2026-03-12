# AgentSync Claude Code Skill Documentation

> AI-powered deployment management for Microsoft Copilot Studio agents using Claude Code

## 📖 Overview

The AgentSync Claude Code skill enables natural language interaction with AgentSync's deployment automation platform. Instead of memorizing CLI commands or API endpoints, simply ask Claude what you want to know about your deployments, and it will execute the appropriate commands and explain the results.

## 🎯 What Can You Do?

### Deployment Management

- **Monitor Status**: "What deployments are running?" / "Show me failed deployments"
- **Track Progress**: "Check status of deployment dep-abc123"
- **Analyze Failures**: "Why did the deployment to Contoso fail?"
- **View History**: "Show me all deployments from today"

### Tenant Fleet Management

- **List Tenants**: "Show me my tenants" / "How many customers do I have?"
- **Filter Tenants**: "Show enterprise tenants" / "Which tenants are in the midwest?"
- **Check Health**: "Are all my tenants healthy?"
- **Validate Access**: "Can I access my tenants?"

### Agent Deployment Operations

- **Deploy Agents**: "Deploy CustomerSupportAgent to all enterprise tenants"
- **Preview Deployments**: "Show me what would happen if I deployed to production"
- **Pack Solutions**: "Pack the HRAgent solution"
- **Test Deployments**: "Deploy to Contoso as a test"

### Troubleshooting & Analysis

- **Diagnose Issues**: "What's wrong with the deployment to Fabrikam?"
- **Permission Checks**: "Why can't I deploy to Woodgrove Bank?"
- **Configuration Review**: "Is demo mode enabled?"

## 📁 Skill Components

### Main Skill Definition

**File**: `.claude/skills/agentsync.md` (224 lines)

Provides Claude with:

- Complete CLI command reference
- Common workflow patterns
- Troubleshooting guidance
- API endpoint documentation
- Demo mode instructions

### Slash Commands (Optional)

**Location**: `.claude/commands/`

Quick shortcuts for power users:

- `deployments.md` - Show deployment overview
- `deploy.md` - Guided deployment workflow
- `fix-failures.md` - Analyze and fix failures
- `monitor.md` - Real-time monitoring

## 🚀 Installation

### For Repository Users

If you have access to the AgentSync repository, the skill is already available:

```bash
# Navigate to your agentsync directory
cd /path/to/agentsync

# Skill is automatically available in .claude/skills/
# Claude Code will find it when you ask deployment questions
```

### For External Users

**Option 1: Manual Installation**

1. Download `.claude/skills/agentsync.md` from the repository
2. Copy to `~/.claude/skills/agentsync.md`
3. (Optional) Copy `.claude/commands/*` to `~/.claude/commands/`

**Option 2: Clone Repository**

```bash
git clone https://github.com/pax8labs/agentsync.git
cd agentsync
```

## ⚙️ Setup & Configuration

### 1. Set Up AgentSync CLI

**Quick Start with Demo Mode:**

```bash
# Navigate to agentsync directory
cd /path/to/agentsync

# Build the CLI (one time)
cd packages/cli
bun build --compile ./src/index.ts --outfile agentsync

# Enable demo mode
./agentsync demo on

# Set up global alias (optional but recommended)
echo 'alias agentsync="/path/to/agentsync/packages/cli/agentsync"' >> ~/.zshrc
source ~/.zshrc

# Verify it works
agentsync fleet list
```

### 2. Verify Skill Installation

Ask Claude:

```
You: Is the AgentSync skill installed?

Claude: Yes! I can help you with AgentSync deployments.
        The skill is loaded from .claude/skills/agentsync.md

        Try asking: "Show me my tenants"
```

### 3. Test the Integration

```
You: Show me my tenants

Claude: [Executes `agentsync fleet list`]

        You have 10 customer tenants configured...
```

## 💡 Usage Examples

### Example 1: Quick Status Check

```
You: What's the status of my deployments?

Claude: Let me check your deployments.

        [Runs: agentsync track --list]

        You have 3 recent deployments:

        1. dep-demo-latest (CustomerSupportAgent)
           Status: 🚚 In Progress
           Progress: 3/5 destinations complete
           Issues: 1 failure (Woodgrove Bank)

        2. dep-demo-success (SalesAgent)
           Status: ✓ Completed
           All 3 tenants deployed successfully

        3. dep-demo-failed (HRAgent)
           Status: ⚠ Completed with failures
           2 of 4 deployments failed

        The CustomerSupportAgent deployment needs attention -
        Woodgrove Bank failed with a permission error.

        Want me to investigate the failure?
```

### Example 2: Targeted Deployment

```
You: Deploy the support agent to all enterprise customers

Claude: I'll deploy CustomerSupportAgent to your enterprise tenants.

        [Runs: agentsync fleet list --tag enterprise]

        Found 4 enterprise tenants:
        - Contoso Corporation
        - Fabrikam Inc
        - Woodgrove Bank
        - Litware Inc

        [Runs: agentsync ship --tag enterprise --solution support-agent.zip]

        ✓ Deployment initiated!

        Tracking ID: dep-xyz789
        Destinations: 4 tenants

        Monitor progress with: agentsync track --shipment dep-xyz789

        I can watch this for you in real-time if you'd like?
```

### Example 3: Troubleshooting

```
You: Why is Woodgrove Bank failing?

Claude: Let me check the deployment details for Woodgrove Bank.

        [Runs: agentsync track --shipment dep-demo-latest]

        Looking at the recent deployment...

        Issue: Missing privilege 'prvWriteContact'
        Cause: GDAP role lacks Power Platform Admin permissions

        To fix this:
        1. Go to Partner Center
        2. Navigate to GDAP relationships
        3. Find Woodgrove Bank's relationship
        4. Add "Power Platform Admin" role to the GDAP setup
        5. Retry the deployment: agentsync track --shipment dep-demo-latest --retry

        This is a common permission issue with GDAP. Would you like
        me to check if other tenants have the same problem?
```

### Example 4: Using Slash Commands

```
You: /deployments

Claude: [Executes the deployments slash command workflow]

        📊 Deployment Overview:

        Total: 45 deployments
        - Running: 1
        - Completed: 42
        - Failed: 2
        - Pending: 0

        ❌ Failed Deployments:
        1. dep-demo-latest → Woodgrove Bank
           Error: Permission issue (GDAP)

        2. dep-demo-failed → Northwind Traders, Wingtip Toys
           Error: Connection timeouts

        💡 Suggestions:
        - Fix GDAP permissions for Woodgrove Bank
        - Retry connection timeouts (transient issues)

        Want me to help fix any of these?
```

## 🔧 Advanced Features

### Demo Mode vs Production

**Demo Mode** (Development/Testing):

```bash
# Enable demo mode
agentsync demo on

# Works without Azure AD credentials
# Uses mock data for all operations
# Perfect for testing the skill
```

**Production Mode**:

```bash
# Configure real credentials
agentsync init

# Or set environment variables
export AZURE_AD_CLIENT_ID="your-client-id"
export AZURE_AD_CLIENT_SECRET="your-secret"
export AZURE_AD_TENANT_ID="your-tenant-id"
```

### Interactive Shell Mode

For multiple commands, use interactive mode:

```bash
# Enter interactive shell
agentsync

# Now type commands without "agentsync" prefix:
AgentSync> demo status
AgentSync> fleet list
AgentSync> track --list
AgentSync> quit
```

### API Integration (Alternative)

The skill can also use the AgentSync web API:

```bash
# Start the web dashboard
DEMO_MODE=true pnpm web

# API available at http://localhost:3000
# Claude can query: /api/tenants, /api/deployments, /api/stats
```

## 📚 Skill Architecture

### How It Works

1. **You ask a question**: "Show me my tenants"
2. **Claude reads the skill**: Loads `.claude/skills/agentsync.md`
3. **Claude translates**: Determines the right CLI command
4. **Executes command**: Runs `agentsync fleet list`
5. **Analyzes results**: Parses the output
6. **Explains to you**: Provides context and insights

### Command Translation Examples

| Your Question        | Claude Executes                                | Result               |
| -------------------- | ---------------------------------------------- | -------------------- |
| "Show me my tenants" | `agentsync fleet list`                         | Table of all tenants |
| "What's deploying?"  | `agentsync track --list`                       | Recent deployments   |
| "Check dep-abc123"   | `agentsync track --shipment dep-abc123`        | Detailed status      |
| "Deploy to prod"     | `agentsync ship --tag production --solution X` | Initiates deployment |
| "Is demo on?"        | `agentsync demo status`                        | Demo mode status     |

### Prefer CLI Over API

The skill prioritizes CLI commands because they:

- Don't require authentication setup
- Provide formatted output
- Work in demo mode out of the box
- Are simpler for Claude to execute

## 🐛 Troubleshooting

### Common Issues

**"Command not found: agentsync"**

```bash
# Check if binary exists
ls -l packages/cli/agentsync

# Set up alias
alias agentsync="/full/path/to/agentsync/packages/cli/agentsync"

# Or use full path in skill file
```

**"Demo mode not enabled"**

```bash
agentsync demo on
agentsync demo status  # Verify
```

**"Claude doesn't recognize deployment questions"**

- Verify skill file location: `.claude/skills/agentsync.md`
- Check file permissions: `chmod 644 .claude/skills/agentsync.md`
- Restart Claude Code if needed

**"Permission denied errors"**

```bash
# Make CLI executable
chmod +x packages/cli/agentsync

# Or rebuild
cd packages/cli
bun build --compile ./src/index.ts --outfile agentsync
```

### Getting Help

- **In Claude**: "Help me troubleshoot AgentSync"
- **GitHub**: [Open an issue](https://github.com/pax8labs/agentsync/issues)
- **Documentation**: See main [README.md](README.md)

## 🔐 Security Considerations

### Demo Mode Warning

```bash
⚠️  Demo mode bypasses all authentication!
    NEVER use demo mode in production
    Only for local development and testing
```

### Production Best Practices

- Use Azure AD authentication in production
- Implement tenant-scoped access control
- Review audit logs regularly
- Rotate credentials periodically

## 📦 Distribution

### Current Status

The skill is available:

- ✅ In repository (`.claude/skills/agentsync.md`)
- ✅ Via GitHub Gist (see issue #61)
- ✅ Documented (this file + `.claude/README.md`)

### Future Plans

- [ ] Standalone public repository (`agentsync-claude-skill`)
- [ ] NPM package (`@pax8labs/agentsync-claude-skill`)
- [ ] Auto-sync from private repo
- [ ] Demo video/GIF
- [ ] Skill marketplace submission

## 🤝 Contributing

Improvements welcome!

**For Repository Access:**

1. Edit `.claude/skills/agentsync.md`
2. Test with Claude
3. Submit PR

**For External Users:**

- Report issues: [GitHub Issues](https://github.com/pax8labs/agentsync/issues)
- Suggest improvements: [Issue #61](https://github.com/pax8labs/agentsync/issues/61)

## 📄 License

Same as main AgentSync repository.

---

**Questions?** Ask Claude! The skill is designed to be self-documenting and helpful. Just start a conversation about your deployments.

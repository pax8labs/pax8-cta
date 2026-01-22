# AgentSync Claude Code Skill

AI-powered deployment management for AgentSync using Claude Code. Manage your Copilot Studio deployments using natural language directly from your terminal or IDE.

## 🚀 Quick Start

### Prerequisites
- [Claude Code CLI](https://docs.anthropic.com/claude-code) installed
- AgentSync running locally or accessible via API

### Installation

**Option 1: From This Repository** (if you have access)
```bash
# Already installed if you cloned the agentsync repo!
# The skill is in .claude/skills/agentsync.md
```

**Option 2: Copy Slash Commands** (Optional)
```bash
# Copy all slash commands
mkdir -p .claude/commands
cp -r $(pwd)/.claude/commands/* .claude/commands/
```

## 📋 Features

### Natural Language Queries
Ask Claude about your deployments:
- "Show me my tenants"
- "What deployments are running?"
- "Check status of deployment dep-abc123"
- "Are there any failed deployments?"
- "Deploy to all enterprise tenants"

### Slash Commands
Quick shortcuts for common tasks:
- `/deployments` - Show deployment status and identify issues
- `/deploy` - Deploy an agent with guided workflow
- `/fix-failures` - Analyze and fix failed deployments
- `/monitor` - Real-time deployment progress tracking

### Demo Mode Support
Works seamlessly with AgentSync demo mode - no authentication required for testing!

## 🎯 Usage Examples

### Check Your Fleet
```
You: Show me my tenants

Claude: [Runs `agentsync fleet list`]

        You have 10 customer tenants configured, with 9 currently active:
        - Contoso Corporation (enterprise, priority)
        - Fabrikam Inc (enterprise)
        - ...
```

### Monitor Deployments
```
You: What deployments are running?

Claude: [Runs `agentsync track --list`]

        You have 3 recent deployments:
        - dep-demo-latest: CustomerSupportAgent (In Progress, 3/5 complete)
        - dep-demo-success: SalesAgent (Completed)
        - dep-demo-failed: HRAgent (Completed with 2 failures)
```

### Deploy with Intelligence
```
You: Deploy the support agent to all enterprise tenants

Claude: I'll deploy to your 4 enterprise tenants:
        - Contoso Corporation
        - Fabrikam Inc
        - Woodgrove Bank
        - Litware Inc

        [Runs deployment command with appropriate tags]

        Deployment created! Tracking ID: dep-xyz789
        Monitor progress with: agentsync track --shipment dep-xyz789
```

## ⚙️ Configuration

### Demo Mode (Development)
```bash
# Enable demo mode for testing without credentials
./packages/cli/agentsync demo on
```

### Production Mode
Set up AgentSync with your Azure AD credentials:
```bash
./packages/cli/agentsync init
```

See main [AgentSync README](../README.md) for full configuration details.

## 📚 What the Skill Provides

The skill (`agentsync.md`) provides Claude with:
- **CLI Command Reference** - All agentsync commands and options
- **Common Workflows** - Step-by-step patterns for typical tasks
- **Troubleshooting Guide** - How to diagnose and fix issues
- **API Integration** - How to use the web API (optional)
- **Demo Mode Instructions** - Testing without credentials

## 🐛 Troubleshooting

### "Command not found: agentsync"
Make sure you've set up the alias:
```bash
echo 'alias agentsync="/path/to/agentsync/packages/cli/agentsync"' >> ~/.zshrc
source ~/.zshrc
```

Or use the full path:
```bash
./packages/cli/agentsync demo on
```

### "Demo mode not enabled"
```bash
./packages/cli/agentsync demo on
./packages/cli/agentsync demo status  # Verify
```

### Claude doesn't recognize the skill
Make sure the skill file is in the right location:
- **From repo:** `.claude/skills/agentsync.md`
- **Global:** `~/.claude/skills/agentsync.md`

## 🔗 Resources

- [Main AgentSync README](../README.md) - Full AgentSync documentation
- [CLI Binary Delivery](../CLI_BINARY_DELIVERY.md) - Binary distribution details
- [Issue #61](https://github.com/pax8labs/agentsync/issues/61) - Skill publishing tracking

## 📝 License

Same as AgentSync main repository.

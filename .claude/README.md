# Pax8 CTA Claude Code Skill

AI-powered deployment management for Pax8 CTA using Claude Code. Manage your Copilot Studio deployments using natural language directly from your terminal or IDE.

## 🚀 Quick Start

### Prerequisites

- [Claude Code CLI](https://docs.anthropic.com/claude-code) installed
- Pax8 CTA running locally or accessible via API

### Installation

**Option 1: From This Repository** (if you have access)

```bash
# Already installed if you cloned the pax8-cta repo!
# The skill lives at .claude/skills/pax8-cta/SKILL.md (skill name: pax8-cta;
# CLI binary is still `pax8-cta` — see the skill body for the rebrand notes).
# Claude Code requires the <name>/SKILL.md directory layout to auto-discover
# project skills; a flat `<name>.md` file will not be loaded.
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

Works seamlessly with Pax8 CTA demo mode - no authentication required for testing!

## 🎯 Usage Examples

### Check Your Fleet

```
You: Show me my tenants

Claude: [Runs `pax8-cta fleet list`]

        You have 10 customer tenants configured, with 9 currently active:
        - Contoso Corporation (enterprise, priority)
        - Fabrikam Inc (enterprise)
        - ...
```

### Monitor Deployments

```
You: What deployments are running?

Claude: [Runs `pax8-cta track --list`]

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
        Monitor progress with: pax8-cta track --shipment dep-xyz789
```

## ⚙️ Configuration

### Demo Mode (Development)

```bash
# Enable demo mode for testing without credentials
./packages/cli/pax8-cta demo on
```

### Production Mode

Set up Pax8 CTA with your Azure AD credentials:

```bash
./packages/cli/pax8-cta init
```

See main [Pax8 CTA README](../README.md) for full configuration details.

## 📚 What the Skill Provides

The skill (`pax8-cta/SKILL.md`) provides Claude with:

- **CLI Command Reference** - All pax8-cta commands and options
- **Common Workflows** - Step-by-step patterns for typical tasks
- **Troubleshooting Guide** - How to diagnose and fix issues
- **API Integration** - How to use the web API (optional)
- **Demo Mode Instructions** - Testing without credentials

## 🐛 Troubleshooting

### "Command not found: pax8-cta"

Make sure you've set up the alias:

```bash
echo 'alias pax8-cta="/path/to/pax8-cta/packages/cli/pax8-cta"' >> ~/.zshrc
source ~/.zshrc
```

Or use the full path:

```bash
./packages/cli/pax8-cta demo on
```

### "Demo mode not enabled"

```bash
./packages/cli/pax8-cta demo on
./packages/cli/pax8-cta demo status  # Verify
```

### Claude doesn't recognize the skill

Make sure the skill file is in the right location:

- **From repo:** `.claude/skills/pax8-cta/SKILL.md`
- **Global:** `~/.claude/skills/pax8-cta/SKILL.md`

## 🔗 Resources

- [Main Pax8 CTA README](../README.md) - Full Pax8 CTA documentation
- [CLI Binary Delivery](../CLI_BINARY_DELIVERY.md) - Binary distribution details
- [Issue #61](https://github.com/pax8labs/pax8-cta/issues/61) - Skill publishing tracking

## 📝 License

Same as Pax8 CTA main repository.

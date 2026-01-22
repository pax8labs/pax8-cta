# AgentSync Demo Script

**Total Duration:** 8-10 minutes
**Audience:** Microsoft contacts, potential MSP customers, technical partners
**Goal:** Show how AgentSync solves multi-tenant Copilot Studio deployment at scale

---

## Pre-Recording Setup

### 1. Start Demo Environment

```bash
cd /path/to/agentsync

# Start services in demo mode
export DEMO_MODE=true
export NEXTAUTH_SECRET=demo-secret
export NEXTAUTH_URL=http://localhost:3000

# Terminal 1: Start web app
pnpm web

# Terminal 2: Start worker (optional - for live deployments)
pnpm worker

# Wait for services to start (30 seconds)
# Open browser to http://localhost:3000
```

### 2. Prepare Browser Tabs

- **Tab 1:** http://localhost:3000 (Dashboard)
- **Tab 2:** http://localhost:3000/deployments (Deployments view)
- **Tab 3:** http://localhost:3000/tenants (Fleet management)
- **Tab 4:** Terminal ready for CLI commands

### 3. Clean Demo Data (Fresh Start)

```bash
# Optional: Reset demo data for clean recording
rm -f .demo-deployments-v2.json .demo-batches.json

# Restart web app to regenerate demo data
```

---

## Demo Script

### INTRO (30 seconds)

**[Screen: Show agentsync dashboard]**

**Script:**
> "Hi, I'm [name] and this is AgentSync - an automated deployment platform for Copilot Studio agents across multiple customer tenants. Think of it as 'Terraform for Power Platform' designed specifically for MSPs managing dozens or hundreds of customer environments."

**What to show:**
- Dashboard overview with deployment statistics
- Point out: "10 active tenants, 15 deployed agents"

---

### SECTION 1: The Problem (45 seconds)

**[Screen: Stay on dashboard, then switch to tenants page]**

**Script:**
> "If you're an MSP deploying Copilot Studio solutions, you know the pain. You build an agent in your development environment, then you have to manually deploy it to Contoso, then Fabrikam, then Northwind... one by one. Each deployment means:
> - Manually importing the solution
> - Configuring connection references
> - Setting environment variables
> - Testing it works
> - Repeating for the next customer
>
> For 50 customers, that's hours or days of manual work. And if something breaks? You're doing it all over again."

**What to show:**
- Navigate to Tenants page (http://localhost:3000/tenants)
- Scroll through the list of 10 demo tenants
- Point out different tenant types (Enterprise, SMB)

---

### SECTION 2: Web Dashboard - Fleet Management (60 seconds)

**[Screen: Tenants page]**

**Script:**
> "AgentSync gives you a single dashboard to manage your entire customer fleet. Here's our tenant list - notice we have tags like 'enterprise', 'priority', 'wave1'. These let us target deployments intelligently."

**Actions:**
1. **Show tenant filtering:**
   - Click filter dropdown
   - Show tag filters (enterprise, smb, etc.)

2. **Show tenant details:**
   - Click on "Contoso Corporation"
   - Show: Environment URL, deployed agents, health status
   - Point out: "We can see all 3 agents deployed here, last health check was successful"

3. **Show tenant management:**
   - Show enable/disable toggle
   - Show "Remove agent" functionality
   - Show tag management

**Key points to emphasize:**
- "Real-time visibility into what's deployed where"
- "Quick enable/disable for maintenance windows"
- "Tag-based organization for smart deployments"

---

### SECTION 3: Creating a Deployment (90 seconds)

**[Screen: Deployments page]**

**Script:**
> "Now let's deploy an agent. I'll show you how to deploy to multiple customers simultaneously with wave-based rollout."

**Actions:**
1. **Navigate to deployments:**
   - Click "Deployments" in sidebar
   - Click "New Deployment" button

2. **Show upload form:**
   ```
   Say: "First, I upload my solution ZIP file - this is exported from my dev environment"
   - (Mime action: clicking "Browse" button)
   - (Don't actually upload - just show the form)
   ```

3. **Show tenant selection:**
   ```
   Say: "Now I select which customers get this deployment. I can choose individual tenants or use tags."
   - Show tenant dropdown with checkboxes
   - Say: "I'll select the 'wave1' tag - that's my priority customers"
   ```

4. **Show wave configuration:**
   ```
   Say: "Here's where it gets powerful - wave-based deployments. Wave 1 goes to priority customers first. We wait, monitor, and only proceed to Wave 2 if Wave 1 succeeds."
   - Point to "Use Waves" toggle
   - Say: "This prevents a bad deployment from hitting all customers at once"
   ```

5. **Show configuration options:**
   - Connection reference mapping
   - Environment variables
   - Rollback settings
   - Say: "AgentSync automatically maps connection references and environment variables per tenant"

6. **Click "Deploy"** (in demo mode, this creates a mock deployment)

---

### SECTION 4: Monitoring Deployments (60 seconds)

**[Screen: Deployment detail page]**

**Script:**
> "Once deployed, we get real-time progress tracking."

**Actions:**
1. **Show deployment list:**
   - Should see the newly created deployment (or an existing demo deployment)
   - Click on a deployment to show details

2. **Show progress view:**
   ```
   Say: "This is a live view of the deployment. Each tenant shows progress through 8 steps:"
   - Point to progress bars for each tenant
   - Steps: Authenticating, Validating, Uploading, Importing, Configuring Connections, Configuring Variables, Verifying, Completing
   ```

3. **Show completed/failed states:**
   ```
   - Show some tenants completed (green checkmarks)
   - Show one failed tenant (red X)
   - Click on failed tenant to show error details

   Say: "When something fails, we get detailed error messages and automatic rollback options"
   ```

4. **Show deployment history:**
   - Scroll down to show past deployments
   - Point out: Success rate, duration, tenant count

**Key points:**
- "Real-time Server-Sent Events for live updates"
- "Detailed error reporting"
- "Full audit trail of every deployment"

---

### SECTION 5: Claude AI Assistant (60 seconds)

**[Screen: Stay on dashboard, show chat interface]**

**Script:**
> "AgentSync includes an AI assistant powered by Claude. You can ask natural language questions about your deployments."

**Actions:**
1. **Open chat panel:**
   - Click chat icon in bottom right
   - Or show chat page if available

2. **Example queries:**
   ```
   Type: "What deployments failed in the last 7 days?"

   (Show mock response)
   Say: "Claude analyzes our deployment history and gives me actionable insights"
   ```

   ```
   Type: "Which tenants have the CustomerServiceAgent deployed?"

   (Show mock response listing tenants)
   ```

   ```
   Type: "Show me the health status of all enterprise customers"

   (Show health check summary)
   ```

**Key points:**
- "Natural language interface to your deployment data"
- "Powered by Claude for intelligent responses"
- "Helps debug issues faster"

---

### SECTION 6: CLI Tool (90 seconds)

**[Screen: Switch to terminal]**

**Script:**
> "For automation and CI/CD, AgentSync includes a powerful command-line interface. Let me show you some examples."

**Actions:**

1. **List tenants:**
   ```bash
   ./agentsync fleet list
   ```

   **Say:**
   > "Here's my entire customer fleet - same data as the web dashboard but scriptable."

   **Expected output:**
   ```
   📊 Customer Fleet Status

   Tenant                   Status    Agents    Last Deployment    Tags
   ────────────────────────────────────────────────────────────────────────
   Contoso Corporation      ✓ Active  3         2 hours ago        enterprise, wave1
   Fabrikam Inc            ✓ Active  2         3 days ago         smb, wave2
   Northwind Traders       ⚠ Warning 1         1 week ago         smb
   ...

   Total: 10 tenants | Active: 9 | Warning: 1
   ```

2. **Check deployment status:**
   ```bash
   ./agentsync deployments list --status failed
   ```

   **Say:**
   > "I can filter deployments by status - let's see what failed recently."

   **Expected output:**
   ```
   ❌ Failed Deployments

   ID       Solution               Tenants    Failed    Date
   ──────────────────────────────────────────────────────────────
   dep-123  CustomerServiceAgent   1/5        1         2024-02-01

   Failed Tenant: Fabrikam Inc
   Error: Connection reference 'cr_sharepoint' not found
   ```

3. **Deploy via CLI:**
   ```bash
   ./agentsync deploy \
     --solution ./solutions/CustomerServiceAgent.zip \
     --tag wave1 \
     --wait
   ```

   **Say:**
   > "And here's deploying via CLI - perfect for CI/CD pipelines. The --wait flag shows progress in real-time."

   **Expected output:**
   ```
   🚀 Starting deployment: CustomerServiceAgent
   📦 Solution size: 847 KB
   🎯 Target: 3 tenants (tag: wave1)

   Wave 1: Priority Customers
   ├─ Contoso Corporation     ████████████████ 100% ✓
   ├─ Adventure Works        ████████████████ 100% ✓
   └─ Tailwind Traders       ████████████████ 100% ✓

   ✅ Deployment complete: 3/3 succeeded
   ⏱  Duration: 4m 32s
   ```

4. **Show fleet inspect:**
   ```bash
   ./agentsync fleet inspect contoso
   ```

   **Say:**
   > "And we can deep-dive into any tenant to see exactly what's deployed."

   **Expected output:**
   ```
   🔍 Tenant Details: Contoso Corporation

   Environment: https://contoso.crm.dynamics.com
   Status: Active ✓
   Last Health Check: 2 minutes ago

   Deployed Agents:
   ├─ CustomerServiceAgent (v1.2.0) - Deployed 2h ago
   ├─ SalesAssistant (v1.1.0) - Deployed 3d ago
   └─ HRAssistant (v1.0.0) - Deployed 1w ago

   Connection References:
   ├─ SharePoint: configured ✓
   ├─ Outlook: configured ✓
   └─ Teams: configured ✓

   Environment Variables:
   ├─ SupportEmail: support@contoso.com
   ├─ MaxRetries: 5
   └─ EnableDebugMode: false
   ```

**Key points:**
- "Fully automatable via CLI"
- "Integrates with GitHub Actions, Azure DevOps, etc."
- "Same functionality as web dashboard"

---

### SECTION 7: Claude MCP Skill (60 seconds)

**[Screen: Claude desktop or terminal with MCP]**

**Script:**
> "AgentSync also integrates with Claude through the Model Context Protocol. This means you can ask Claude about your deployments directly."

**Actions:**

1. **Show MCP server running:**
   ```bash
   # In terminal, show MCP server is available
   cat ~/.claude/config.json
   ```

   **Expected output:**
   ```json
   {
     "mcpServers": {
       "agentsync": {
         "command": "/path/to/agentsync/packages/mcp-server/dist/index.js"
       }
     }
   }
   ```

2. **Show Claude interaction (if you have Claude Desktop):**

   **In Claude app, type:**
   ```
   "Can you check the status of my AgentSync deployments?"
   ```

   **Claude response (simulated):**
   ```
   I'll check your AgentSync deployment status using the MCP tools.

   [Uses agentsync_list_deployments tool]

   Here's your deployment summary:

   Recent Deployments:
   • CustomerServiceAgent (3 hours ago): ✅ Success - 5/5 tenants
   • SalesAssistant (2 days ago): ⚠️  Partial - 4/5 tenants (Fabrikam failed)
   • HRAssistant (1 week ago): ✅ Success - 10/10 tenants

   Would you like me to investigate the Fabrikam failure?
   ```

3. **Follow-up query:**
   ```
   "Yes, what went wrong with Fabrikam?"
   ```

   **Claude response:**
   ```
   [Uses agentsync_get_deployment_details tool]

   The SalesAssistant deployment failed for Fabrikam Inc with this error:

   "Connection reference 'cr_sharepoint_connection' not found in target environment"

   This means the SharePoint connection hasn't been created in Fabrikam's environment yet. You'll need to:
   1. Create the SharePoint connection in Fabrikam's Power Platform
   2. Update the connection mapping in your tenants.yaml
   3. Retry the deployment

   Would you like me to show you the exact commands to retry?
   ```

**Key points:**
- "AI-powered deployment management"
- "Natural language queries to your deployment data"
- "Helpful troubleshooting suggestions"

---

### SECTION 8: Architecture & Scale (45 seconds)

**[Screen: Back to dashboard or a diagram if you have one]**

**Script:**
> "Under the hood, AgentSync is built for scale. We use:
> - **BullMQ with Redis** for reliable job queuing
> - **Server-Sent Events** for real-time updates
> - **Wave-based deployments** to prevent blast radius
> - **Automatic rollback** if deployments fail
> - **Full audit trail** for compliance
>
> We've tested this with deployments to 50+ tenants simultaneously. The architecture is designed for MSPs managing hundreds of customers."

**What to show:**
- Navigate through dashboard showing stats
- Point to deployment history
- Show audit log if available

---

### SECTION 9: Production Ready (30 seconds)

**[Screen: Show configuration files or settings]**

**Script:**
> "AgentSync supports:
> - **GDAP authentication** for secure partner access (requires CSP license in production)
> - **Multi-tenant isolation** with role-based access control
> - **Connection reference mapping** - automatically maps dev connections to production
> - **Environment variables** - per-tenant configuration
> - **Scheduled deployments** - maintenance windows, cron expressions
> - **Webhook notifications** - integrate with Slack, Teams, PagerDuty
>
> Everything is configured through YAML files and environment variables - GitOps ready."

**What to show:**
- Show tenants.yaml file briefly
- Show .env configuration
- Show settings page if available

---

### CLOSING (30 seconds)

**[Screen: Back to dashboard]**

**Script:**
> "So that's AgentSync - we've gone from manual, error-prone deployments taking hours, to automated, wave-based rollouts across dozens of tenants in minutes. With real-time monitoring, AI-powered insights, and full audit trails.
>
> For MSPs managing Copilot Studio at scale, this is the deployment automation you've been waiting for."

**Optional call-to-action:**
> "If you'd like to test this with your environments or discuss how AgentSync can work for your MSP practice, let's talk. You can find us at [GitHub link] or reach out at [email]."

---

## Post-Recording Checklist

- [ ] Trim any loading/lag time in editing
- [ ] Add title cards between sections
- [ ] Add background music (optional, keep subtle)
- [ ] Add captions/subtitles for accessibility
- [ ] Export at 1080p or 4K
- [ ] Upload to YouTube/Vimeo with proper title/description

---

## Video Metadata

**Title:** "AgentSync: Automated Copilot Studio Deployment for Multi-Tenant Environments"

**Description:**
```
AgentSync is an automated deployment platform for Microsoft Copilot Studio agents across multiple Power Platform tenants. Built for MSPs managing dozens or hundreds of customer environments.

Features:
✅ Wave-based deployments with automatic rollback
✅ Real-time monitoring with Server-Sent Events
✅ CLI for CI/CD integration
✅ AI-powered deployment insights with Claude
✅ Connection reference & environment variable mapping
✅ GDAP authentication for secure partner access
✅ Full audit trail and compliance tracking

Perfect for:
• Microsoft CSP Partners
• Managed Service Providers
• Power Platform consultancies
• Enterprise IT managing multiple business units

Tech Stack: Next.js, TypeScript, BullMQ, Redis, Power Platform APIs, Claude AI

GitHub: https://github.com/[your-repo]/agentsync
Contact: [your-email]

#PowerPlatform #CopilotStudio #MSP #Microsoft #DevOps #Automation
```

**Timestamps to add:**
```
0:00 - Introduction
0:30 - The Problem
1:15 - Fleet Management
2:15 - Creating a Deployment
3:45 - Monitoring & Progress
4:45 - Claude AI Assistant
5:45 - CLI Tool
7:15 - MCP Integration
8:00 - Architecture & Scale
8:45 - Production Features
9:15 - Closing
```

---

## Alternative: Quick 3-Minute Version

If you need a shorter demo for social media:

1. **Show dashboard** (15 sec)
2. **Create deployment to multiple tenants** (45 sec)
3. **Show real-time progress** (30 sec)
4. **CLI quick demo** (45 sec)
5. **Closing with value prop** (15 sec)

---

## Recording Tips

1. **Screen resolution:** 1920x1080 or 1280x720
2. **Browser zoom:** 100% (or 110% for better visibility)
3. **Clear browser cache** before recording (faster loads)
4. **Close unused tabs** (reduce RAM, faster performance)
5. **Use a good microphone** (USB mic or headset)
6. **Record in quiet environment**
7. **Practice the flow 2-3 times** before final recording
8. **Keep cursor movements smooth** (not too fast)
9. **Pause between sections** (easier to edit)
10. **Have water nearby** (stay hydrated during long recordings)

---

Let me know if you'd like me to adjust timing, add/remove sections, or create a different format!

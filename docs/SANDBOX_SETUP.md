# AgentSync Sandbox Environment Setup Guide

This guide will walk you through setting up a complete sandbox environment for testing agentsync with real Azure and Power Platform services.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Cost Estimate](#cost-estimate)
- [Phase 1: Azure AD Setup](#phase-1-azure-ad-setup)
- [Phase 2: Power Platform Setup](#phase-2-power-platform-setup)
- [Phase 3: Azure Infrastructure](#phase-3-azure-infrastructure)
- [Phase 4: Local Configuration](#phase-4-local-configuration)
- [Phase 5: First Test Deployment](#phase-5-first-test-deployment)
- [Phase 6: CI/CD Integration](#phase-6-cicd-integration)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before you begin, ensure you have:

- [ ] An Azure subscription (free tier is sufficient to start)
- [ ] Admin access to create Azure AD tenants
- [ ] GitHub account with repository access
- [ ] Node.js 20+ and pnpm installed locally
- [ ] Power Platform CLI (`pac`) installed: [Installation guide](https://learn.microsoft.com/power-platform/developer/cli/introduction)
- [ ] Azure CLI installed: [Installation guide](https://learn.microsoft.com/cli/azure/install-azure-cli)
- [ ] Basic understanding of Power Platform and Copilot Studio

---

## Cost Estimate

| Resource                     | Tier            | Monthly Cost  | Notes                         |
| ---------------------------- | --------------- | ------------- | ----------------------------- |
| M365 Developer Program       | E5 (x3 tenants) | **$0**        | Free, renewable every 90 days |
| Azure Key Vault              | Standard        | **$5**        | For CI/CD secret storage      |
| Azure Redis Cache (optional) | Basic C0        | **$16**       | Can use local Docker for dev  |
| **Total (minimal)**          |                 | **$5/month**  | Just Key Vault                |
| **Total (recommended)**      |                 | **$21/month** | With Azure Redis              |

**Budget-conscious option:** Start with $5/month (Key Vault only) and use local Docker Redis for development.

---

## Phase 1: Azure AD Setup

### Step 1.1: Sign Up for Microsoft 365 Developer Program

1. Go to https://developer.microsoft.com/microsoft-365/dev-program
2. Click **"Join now"**
3. Sign in with your Microsoft account (or create one)
4. Complete the registration form:
   - Country/Region
   - Company name (can use "AgentSync Sandbox Testing")
   - Select "Learning and exploring" as usage
5. After approval, you'll receive a **free M365 E5 developer subscription** with:
   - 25 user licenses
   - 90-day subscription (renewable indefinitely)
   - Your own Azure AD tenant

**Important:** The subscription is automatically renewable as long as you use it regularly. Running sandbox tests will keep it active.

### Step 1.2: Note Your Sandbox Tenant Details

After setup, you'll receive a tenant domain like:

```
agentsync-sandbox.onmicrosoft.com
```

**Record these values** (you'll need them later):

- **Tenant ID**: Find in Azure Portal > Azure Active Directory > Overview
- **Tenant Domain**: e.g., `agentsync-sandbox.onmicrosoft.com`
- **Admin Username**: e.g., `admin@agentsync-sandbox.onmicrosoft.com`

### Step 1.3: Create App Registration

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** > **App registrations**
3. Click **"New registration"**
4. Configure:
   - **Name:** `AgentSync Sandbox Service Principal`
   - **Supported account types:** Accounts in any organizational directory (Multitenant)
   - **Redirect URI:** Leave blank for now
5. Click **"Register"**

**Record these values:**

- **Application (client) ID**: Found on the app overview page
- **Directory (tenant) ID**: Found on the app overview page

### Step 1.4: Configure API Permissions

Still in your app registration:

1. Go to **API permissions**
2. Click **"Add a permission"**

**Add Microsoft Graph API permissions:**

- Click **Microsoft Graph** > **Application permissions**
- Search and add:
  - `Directory.Read.All` (to read tenant info)
  - `DelegatedAdminRelationship.Read.All` (for GDAP - if available)

**Add Dynamics CRM permissions:**

- Click **APIs my organization uses**
- Search for **"Dynamics CRM"** or **"Common Data Service"**
- Select **Delegated permissions**
- Add: `user_impersonation`

3. Click **"Grant admin consent"** button (green checkmark will appear)

### Step 1.5: Create Client Secret

1. In your app registration, go to **Certificates & secrets**
2. Click **"New client secret"**
3. Configure:
   - **Description:** `Sandbox Secret`
   - **Expires:** 90 days (for sandbox - shorter rotation)
4. Click **"Add"**
5. **IMPORTANT:** Copy the secret **Value** immediately (you can't see it again!)

**Record this value:**

- **Client Secret**: The generated secret value

---

## Phase 2: Power Platform Setup

### Step 2.1: Access Power Platform Admin Center

1. Go to https://admin.powerplatform.microsoft.com
2. Sign in with your sandbox tenant admin account
3. You should see your M365 Developer tenant with included Power Platform capacity

### Step 2.2: Create Source Environment

This is where you'll develop and store your test Copilot agents.

1. In Power Platform Admin Center, click **"Environments"** > **"New"**
2. Configure:
   - **Name:** `AgentSync Dev Source`
   - **Type:** Sandbox
   - **Region:** United States (or your preferred region)
   - **Purpose:** Development/test source environment
   - **Create database:** Yes
   - **Language:** English
   - **Currency:** USD
3. Click **"Next"** > **"Save"**
4. Wait 5-10 minutes for provisioning

**Alternative (using CLI):**

```bash
pac admin create \
  --name "AgentSync Dev Source" \
  --type Sandbox \
  --region unitedstates \
  --currency USD
```

**Record this value:**

- **Environment URL**: e.g., `https://orgxxxxx.crm.dynamics.com`
  - Find in Environment details > Environment URL

### Step 2.3: Create Target Test Environments

Create 3 customer test environments for deployment testing.

**Tenant 1: Contoso Sandbox** (Happy path)

```bash
pac admin create \
  --name "Contoso Sandbox" \
  --type Sandbox \
  --region unitedstates
```

**Tenant 2: Fabrikam Sandbox** (Failure testing)

```bash
pac admin create \
  --name "Fabrikam Sandbox" \
  --type Sandbox \
  --region unitedstates
```

**Tenant 3: Adventure Works Sandbox** (Disabled scenarios)

```bash
pac admin create \
  --name "Adventure Works Sandbox" \
  --type Sandbox \
  --region unitedstates
```

**Wait 10-15 minutes for all environments to provision.**

**Record these values for each environment:**

- Environment ID
- Environment URL
- Environment Name

You can list all environments with:

```bash
pac admin list
```

### Step 2.4: Create Test Copilot Agent

Now let's create a minimal test agent in your source environment.

1. Go to https://copilotstudio.microsoft.com
2. **Select your "AgentSync Dev Source" environment** (top right dropdown)
3. Click **"Create"** > **"New agent"**
4. Configure:
   - **Name:** `CustomerServiceAgent`
   - **Description:** `Test agent for sandbox deployments`
   - **Language:** English
5. Click **"Create"**

**Add a simple topic:**

1. Go to **Topics** tab
2. Create a new topic: "Test Greeting"
3. Add trigger phrase: "hello"
4. Add response: "Hello! This is a test agent."
5. **Save**

**Optional - Add connection references (for advanced testing):**

1. Add a **SharePoint** connection (if available)
2. Add an **Outlook** connection (if available)

### Step 2.5: Export Test Solution

1. In Copilot Studio, go to **Settings** for your agent
2. Click **"Publish"** to publish the agent
3. Wait for publishing to complete
4. Go to https://make.powerapps.com
5. Select your **"AgentSync Dev Source"** environment
6. Go to **Solutions**
7. Find the solution containing your agent (will have a generated name)
8. Click **"..."** > **"Export solution"**
9. Select:
   - **Export as:** Managed
   - **Package type:** Managed
10. Click **"Export"**
11. Save the ZIP file to your agentsync project:
    ```
    /path/to/agentsync/test-solutions/CustomerServiceAgent.zip
    ```

**Create the test-solutions directory:**

```bash
mkdir -p /path/to/agentsync/test-solutions
```

---

## Phase 3: Azure Infrastructure

### Step 3.1: Create Azure Key Vault (Optional but Recommended)

If you have an Azure subscription:

1. Go to [Azure Portal](https://portal.azure.com)
2. Click **"Create a resource"** > Search for **"Key Vault"**
3. Click **"Create"**
4. Configure:
   - **Subscription:** Your Azure subscription
   - **Resource group:** Create new: `agentsync-sandbox-rg`
   - **Key vault name:** `agentsync-sandbox-kv` (must be globally unique)
   - **Region:** Same as your Power Platform environments
   - **Pricing tier:** Standard
5. Go to **"Access configuration"** tab:
   - **Permission model:** Vault access policy
6. Click **"Review + create"** > **"Create"**

**Grant yourself access:**

1. Once created, go to the Key Vault
2. Go to **"Access policies"**
3. Click **"Create"**
4. Select permissions:
   - **Secret permissions:** Get, List, Set, Delete
5. Select your user account as principal
6. Click **"Create"**

**Add secrets:**

```bash
# Set your sandbox client secret
az keyvault secret set \
  --vault-name agentsync-sandbox-kv \
  --name sandbox-partner-client-secret \
  --value "<your-client-secret-from-step-1.5>"

# Generate and set NextAuth secret
NEXTAUTH_SECRET=$(openssl rand -base64 32)
az keyvault secret set \
  --vault-name agentsync-sandbox-kv \
  --name sandbox-nextauth-secret \
  --value "$NEXTAUTH_SECRET"
```

**Record this value:**

- **Key Vault URL**: e.g., `https://agentsync-sandbox-kv.vault.azure.net`

### Step 3.2: Redis Strategy Decision

**Option A: Local Docker Redis (Free - Recommended for Development)**

```bash
# Start Redis container
docker run -d \
  --name agentsync-sandbox-redis \
  -p 6379:6379 \
  redis:7-alpine

# Verify it's running
redis-cli ping
# Should return: PONG
```

Use connection string: `redis://localhost:6379`

**Option B: Azure Redis Cache ($16/month - Recommended for CI/CD)**

1. Go to Azure Portal > Create resource > **"Azure Cache for Redis"**
2. Configure:
   - **Name:** `agentsync-sandbox-redis`
   - **Location:** Same region
   - **Cache type:** Basic C0 (250 MB)
3. Create and wait for provisioning
4. Get connection string from **"Access keys"** panel

**Recommendation:** Start with Option A (Docker) for local development. Use Option B if you need Azure Redis for CI/CD or team sharing.

---

## Phase 4: Local Configuration

### Step 4.1: Configure Environment Variables

1. Copy the example file:

   ```bash
   cd /path/to/agentsync
   cp .env.sandbox.example .env.sandbox
   ```

2. Edit `.env.sandbox` with your actual values:

   ```bash
   # Open in your editor
   code .env.sandbox  # or vim/nano
   ```

3. Replace all placeholder values:
   ```bash
   PARTNER_TENANT_ID=<your-sandbox-tenant-id-from-step-1.2>
   PARTNER_CLIENT_ID=<your-app-registration-id-from-step-1.3>
   PARTNER_CLIENT_SECRET=<your-client-secret-from-step-1.5>
   SOURCE_ENVIRONMENT_URL=<your-source-env-url-from-step-2.2>
   NEXTAUTH_SECRET=<generate-with: openssl rand -base64 32>
   ```

### Step 4.2: Configure Tenant YAML

1. Copy the example file:

   ```bash
   cp config/tenants.sandbox.example.yaml config/tenants.sandbox.yaml
   ```

2. Edit with your environment details:

   ```bash
   code config/tenants.sandbox.yaml
   ```

3. Replace placeholder IDs with actual values from Phase 2.3

**Important:** You'll need to create connections in each target environment and get their IDs. For now, you can leave the `connectionMappings` empty or add them later.

### Step 4.3: Install Dependencies and Build

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build
```

---

## Phase 5: First Test Deployment

Now let's test a manual deployment to validate everything works!

### Step 5.1: Start Local Services

```bash
# Terminal 1: Start Redis (if using Docker)
docker start agentsync-sandbox-redis

# Terminal 2: Start the web dashboard
pnpm web

# Terminal 3: Start the worker
pnpm worker
```

Use the `.env.sandbox` file:

```bash
# Load sandbox environment
export $(cat .env.sandbox | xargs)

# Then start services
pnpm web
```

### Step 5.2: Deploy via CLI

```bash
# Deploy to Contoso sandbox tenant
pnpm cli deploy \
  --solution ./test-solutions/CustomerServiceAgent.zip \
  --tenant "Contoso Sandbox" \
  --config ./config/tenants.sandbox.yaml
```

**Expected output:**

```
🚀 Starting deployment...
📦 Solution: CustomerServiceAgent
🎯 Target: 1 tenant(s)

Deploying to Contoso Sandbox...
  ✓ Authenticating...
  ✓ Validating environment...
  ✓ Uploading solution...
  ✓ Importing...
  ✓ Configuring connections...
  ✓ Configuring variables...
  ✓ Verifying deployment...
  ✓ Complete!

✅ Deployment succeeded: 1/1 tenants
```

### Step 5.3: Verify Deployment

1. Go to https://make.powerapps.com
2. Switch to **"Contoso Sandbox"** environment
3. Go to **Solutions**
4. You should see **CustomerServiceAgent** solution listed
5. Go to https://copilotstudio.microsoft.com
6. Switch to Contoso Sandbox environment
7. You should see your agent deployed

**If deployment fails:**

- Check logs: `pnpm cli logs` or view worker console output
- Verify authentication: `pnpm cli tenants list`
- See [Troubleshooting](#troubleshooting) section below

---

## Phase 6: CI/CD Integration

Once manual deployments work, set up automated testing.

### Step 6.1: Configure GitHub Secrets

1. Go to your GitHub repository
2. Go to **Settings** > **Secrets and variables** > **Actions**
3. Add the following **secrets**:
   - `AZURE_CREDENTIALS` - Service principal for Key Vault access
   - `SANDBOX_NEXTAUTH_SECRET` - NextAuth secret

4. Add the following **variables**:
   - `SANDBOX_PARTNER_TENANT_ID`
   - `SANDBOX_PARTNER_CLIENT_ID`
   - `SANDBOX_SOURCE_ENV_URL`

**To create Azure credentials for GitHub:**

```bash
az ad sp create-for-rbac \
  --name "GitHub Actions AgentSync Sandbox" \
  --role contributor \
  --scopes /subscriptions/<your-subscription-id>/resourceGroups/agentsync-sandbox-rg \
  --sdk-auth
```

Copy the JSON output to `AZURE_CREDENTIALS` secret.

### Step 6.2: Run E2E Tests

The sandbox E2E workflow is already created. To run it:

1. Go to **Actions** tab in GitHub
2. Select **"Sandbox E2E Tests"** workflow
3. Click **"Run workflow"** > **"Run workflow"**
4. Wait for tests to complete (10-20 minutes)

**Or trigger via label on PR:**

1. Create a pull request
2. Add label: `e2e-test`
3. Workflow will run automatically

---

## Troubleshooting

### Authentication Errors

**Error:** `AADSTS7000215: Invalid client secret provided`

**Solution:**

- Verify `PARTNER_CLIENT_SECRET` in `.env.sandbox` is correct
- Check if secret has expired (regenerate in Azure Portal)
- Ensure no extra spaces or quotes around the secret

---

**Error:** `AADSTS50076: Due to a configuration change made by your administrator...`

**Solution:**

- Your Azure AD might require MFA
- Use a service principal instead of user credentials
- Or disable MFA for the sandbox tenant (not recommended for production)

---

### Power Platform Errors

**Error:** `Failed to import solution: Missing privilege 'prvWriteContact'`

**Solution:**

- Your service principal lacks required permissions
- Grant "Power Platform Administrator" role in Power Platform Admin Center:
  1. Go to https://admin.powerplatform.microsoft.com
  2. Environments > Select environment > Settings > Users + permissions > Application users
  3. Add your app registration
  4. Grant "System Administrator" security role

---

**Error:** `Environment not found or access denied`

**Solution:**

- Verify `environmentUrl` in `tenants.sandbox.yaml` is correct
- Check format: `https://orgname.crm.dynamics.com` (no trailing slash)
- Ensure environment is in the same region as your tenant

---

### Connection Reference Errors

**Error:** `Connection reference 'cr_sharepoint_connection' not found`

**Solution:**

1. Create the connection in target environment:
   - Go to https://make.powerapps.com
   - Select target environment
   - Go to **Data** > **Connections** > **New connection**
   - Select SharePoint > Create
2. Get the connection ID:
   ```bash
   pac solution list --environment <env-url>
   ```
3. Update `connectionMappings` in `tenants.sandbox.yaml`

---

### Redis Connection Errors

**Error:** `Error: connect ECONNREFUSED 127.0.0.1:6379`

**Solution:**

```bash
# Check if Redis is running
docker ps | grep redis

# If not running, start it
docker start agentsync-sandbox-redis

# Or start new container
docker run -d --name agentsync-sandbox-redis -p 6379:6379 redis:7-alpine
```

---

### Key Vault Access Issues

**Error:** `Azure Key Vault: Access denied`

**Solution:**

```bash
# Grant your user access
az keyvault set-policy \
  --name agentsync-sandbox-kv \
  --upn <your-email@domain.com> \
  --secret-permissions get list set delete
```

---

## Next Steps

Once your sandbox is working:

1. ✅ Run through all 5 E2E test scenarios manually
2. ✅ Set up automated E2E tests in CI/CD
3. ✅ Create additional test solutions for different scenarios
4. ✅ Document any custom setup steps for your team
5. ✅ Review [SANDBOX_MAINTENANCE.md](./SANDBOX_MAINTENANCE.md) for ongoing maintenance

---

## Quick Reference

### Useful Commands

```bash
# List all Power Platform environments
pac admin list

# List solutions in an environment
pac solution list --environment <env-url>

# Check Redis connection
redis-cli ping

# View Key Vault secrets
az keyvault secret list --vault-name agentsync-sandbox-kv

# Deploy to sandbox
pnpm cli deploy --config ./config/tenants.sandbox.yaml --solution ./test-solutions/CustomerServiceAgent.zip

# Run tests locally
pnpm test
pnpm test:e2e

# View logs
docker logs agentsync-sandbox-redis
pnpm cli logs
```

### Important URLs

- **Azure Portal:** https://portal.azure.com
- **Power Platform Admin:** https://admin.powerplatform.microsoft.com
- **Copilot Studio:** https://copilotstudio.microsoft.com
- **Power Apps Maker:** https://make.powerapps.com
- **M365 Developer Program:** https://developer.microsoft.com/microsoft-365/dev-program

---

## Support

If you encounter issues not covered here:

1. Check the [main README](../README.md)
2. Review [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) (if available)
3. Search [GitHub Issues](https://github.com/pax8labs/agentsync/issues)
4. Open a new issue or start a discussion

---

**Last updated:** 2026-02-03
**Estimated setup time:** 2-4 hours for first-time setup

# Sandbox Setup (CLI-Only)

This guide configures a sandbox environment for AgentSync CLI testing.

## Prerequisites

- Node.js 20+
- pnpm 9+
- Power Platform CLI (`pac`)
- A Microsoft 365 developer/sandbox tenant

## 1. Install and Build

```bash
pnpm install
pnpm build
```

## 2. Configure Environment

```bash
cp .env.sandbox.example .env.sandbox
```

Set at minimum:

- `PARTNER_TENANT_ID`
- `PARTNER_CLIENT_ID`
- `PARTNER_CLIENT_SECRET`
- `SOURCE_ENVIRONMENT_URL`
- `CONFIG_PATH`

## 3. Create Tenant Config

Create `config/tenants.sandbox.yaml` with your sandbox target environments.

## 4. Validate Access

```bash
DEMO_MODE=false pnpm cli validate --config ./config/tenants.sandbox.yaml
```

## 5. Run Test Deployment Flow

```bash
DEMO_MODE=false pnpm cli export --solution <solution-name>
DEMO_MODE=false pnpm cli deploy --all --solution ./<solution>.zip --config ./config/tenants.sandbox.yaml
DEMO_MODE=false pnpm cli deployments list --config ./config/tenants.sandbox.yaml
```

## Optional: Demo Mode

```bash
DEMO_MODE=true pnpm cli
```

Demo mode uses mock data and does not call Azure AD or Dataverse.

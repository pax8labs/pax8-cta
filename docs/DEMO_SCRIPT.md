# AgentSync CLI Demo Script (10 Minutes)

This script demonstrates the CLI-only OSS workflow.

## 1. Intro (1 min)

"AgentSync lets MSP teams export once and deploy to many customer tenants via GDAP."

## 2. Show Tenant Fleet (2 min)

```bash
DEMO_MODE=true pnpm cli tenants list
```

Highlight tags and enabled/disabled status.

## 3. Show Deployment Plan (2 min)

```bash
DEMO_MODE=true pnpm cli deploy --all --solution ./demo-agent.zip --dry-run
```

Explain targeting and dry-run safety.

## 4. Run Deployment (2 min)

```bash
DEMO_MODE=true pnpm cli deploy --all --solution ./demo-agent.zip
```

Show destination table and summary output.

## 5. Inspect History (2 min)

```bash
DEMO_MODE=true pnpm cli deployments list
DEMO_MODE=true pnpm cli deployments show demo-hist-000
```

## 6. Close (1 min)

"The same commands run in non-demo mode with real Azure AD and Dataverse access."

Optional closing command:

```bash
DEMO_MODE=true pnpm cli status --setup
```

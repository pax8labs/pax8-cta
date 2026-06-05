# Sandbox Maintenance (CLI-Only)

Routine tasks for keeping a CLI sandbox healthy.

## Daily / Weekly Checks

```bash
pnpm --filter @pax8/cta-core build
pnpm --filter @pax8/cta build
pnpm --filter @pax8/cta test -- --run src/__tests__/integration.test.ts
```

## Clean Old Artifacts

```bash
./scripts/cleanup-sandbox.sh
```

This removes old solution files, snapshots, and logs.

## Validate Tenant Connectivity

```bash
DEMO_MODE=false pnpm cli validate --config ./config/tenants.sandbox.yaml
```

## Inspect Deployment History

```bash
DEMO_MODE=false pnpm cli deployments list --config ./config/tenants.sandbox.yaml
```

## Demo Data Reset

```bash
bun run scripts/seed-demo-failures.ts
```

## Shell Sanity Checks

```bash
bash -n scripts/start-demo.sh
bash -n scripts/smoke-test.sh
bash -n scripts/cleanup-sandbox.sh
```

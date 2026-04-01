# AgentSync Scripts

This directory contains helper scripts for CLI-only sandbox setup, demos, and maintenance.

## Scripts

### `start-demo.sh`

Starts AgentSync CLI in demo mode.

```bash
./scripts/start-demo.sh
```

### `smoke-test.sh`

Runs a quick CLI smoke test (build + core commands).

```bash
./scripts/smoke-test.sh
```

### `cleanup-sandbox.sh`

Deletes old sandbox artifacts (solution zips, snapshots, logs).

```bash
./scripts/cleanup-sandbox.sh
```

### `setup-sandbox-environments.sh`

Creates Power Platform sandbox environments for test tenants.

```bash
./scripts/setup-sandbox-environments.sh
```

### `seed-demo-failures.ts`

Seeds demo deployment files with failed entries used by troubleshooting demos.

```bash
bun run scripts/seed-demo-failures.ts
```

## Troubleshooting

```bash
# Make scripts executable
chmod +x ./scripts/*.sh

# Validate shell scripts
bash -n scripts/start-demo.sh
bash -n scripts/smoke-test.sh
bash -n scripts/cleanup-sandbox.sh
```

## See Also

- [Sandbox Setup Guide](../docs/SANDBOX_SETUP.md)
- [Sandbox Maintenance Runbook](../docs/SANDBOX_MAINTENANCE.md)
- [Demo Script](../docs/DEMO_SCRIPT.md)

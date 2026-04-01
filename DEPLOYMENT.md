# Deployment Guide (CLI-Only)

This repository now ships a CLI-focused open-source distribution.

## Local Setup

```bash
pnpm install
pnpm build
pnpm cli
```

For first-time setup:

```bash
agentsync init
agentsync auth login
agentsync validate
```

## Production Usage Pattern

1. Export from the source environment.
2. Validate tenant access and configuration.
3. Deploy directly with `agentsync deploy`.
4. Inspect history via `agentsync deployments list/show`.

Example:

```bash
agentsync export --solution CustomerServiceAgent
agentsync validate
agentsync deploy --all --solution ./CustomerServiceAgent_managed.zip
agentsync deployments list
```

## Running As A Scheduled Job

Use cron or your CI scheduler to run CLI commands.

```bash
# Example: nightly validation
0 2 * * * cd /path/to/agentsync && pnpm cli validate >> /var/log/agentsync-validate.log 2>&1
```

## Docker (CLI Image)

Build the CLI container image:

```bash
docker build --target cli -t agentsync-cli:latest .
```

Run a command:

```bash
docker run --rm -it \
  -v "$PWD/config:/app/config" \
  -v "$PWD/solutions:/app/solutions" \
  -e PARTNER_CLIENT_SECRET="$PARTNER_CLIENT_SECRET" \
  agentsync-cli:latest --help
```

## Required Environment Variables

- `PARTNER_CLIENT_SECRET` (required for non-demo use)
- `CONFIG_PATH` (optional, default `./config/tenants.yaml`)
- `DEMO_MODE` (optional, default `false`)

Use `.env.example` as the baseline template.

## Troubleshooting

- `Failed to acquire token`: verify app credentials and GDAP relationships.
- `No destinations matched`: confirm tenant tags and `enabled` flags.
- `Import failed`: validate source package and target environment prerequisites.

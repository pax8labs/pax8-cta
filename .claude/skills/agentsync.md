# AgentSync CLI Reference

Translate user requests into `agentsync` CLI commands. Run via `node packages/cli/dist/index.js` (or `packages/cli/agentsync` if built).

## Commands

```
agentsync init                                  # Guided setup wizard
agentsync validate                              # Check config, credentials, environments
agentsync validate -t <tenant>                  # Check a specific tenant

agentsync deploy <solution> --all --direct      # Deploy to all tenants (sequential)
agentsync deploy <solution> --tag <tag>         # Deploy to tagged tenants only
agentsync deploy <solution> --all --dry-run     # Preview without deploying
agentsync deploy ./Solution.zip --all           # Deploy a pre-exported zip

agentsync export <solution>                     # Export managed solution zip
agentsync export <solution> --unmanaged         # Export unmanaged

agentsync import ./Solution.zip -t <tenant>     # Import zip to one tenant

agentsync deployments list                      # List recent deployments
agentsync deployments list -s failed --since 7d # Failed deployments last 7 days
agentsync deployments show <id>                 # Deployment details
agentsync deployments watch <id>                # Watch progress live
agentsync deployments retry <id>                # Retry failed tenants
agentsync deployments cancel <id>               # Cancel in-progress
agentsync deployments rollback <id>             # Rollback to previous version

agentsync tenants list                          # List all tenants
agentsync tenants inspect                       # Validate connectivity & permissions
agentsync tenants health                        # Health status for all tenants
agentsync tenants health <tenant>               # Health for one tenant
agentsync tenants show <tenant>                 # Tenant details & deployed agents

agentsync solutions list                        # List solutions in source env
agentsync solutions show <name>                 # Solution details & where deployed
agentsync solutions drift                       # Find version drift across tenants

agentsync analyze <solution>                    # Risk analysis across tenants
agentsync analyze <solution> --tag production   # Risk for production only

agentsync demo on|off|status                    # Toggle demo mode (no credentials needed)
```

## When user asks in natural language

- "deploy X to Y" → `agentsync deploy <X> --tag <Y> --direct` or `--all`
- "check my tenants" / "can I access tenants" → `agentsync tenants inspect`
- "what's deployed" / "deployment status" → `agentsync deployments list`
- "why did it fail" → `agentsync deployments show <id>` then explain the error
- "is tenant X healthy" → `agentsync tenants health <X>`
- "what versions are running" → `agentsync solutions drift`
- "retry the failed deployment" → `agentsync deployments retry <id>`

## Common errors and what they mean

- `Missing privilege 'prvWriteContact'` → GDAP role lacks permissions. Need Power Platform Admin role added in Partner Center.
- `No GDAP relationship` / `No shipping route` → No delegated admin relationship. Set up GDAP in Partner Center for this tenant.
- `GDAP relationship exists but missing roles` → GDAP exists but needs Power Platform Admin role added.
- `403 Forbidden` / permission denied → Service principal lacks required Dataverse roles. Run `agentsync setup -t <tenant>`.
- `401 Unauthorized` / token expired → Credentials invalid or expired. Run `agentsync auth` to refresh, or check env vars.
- `Solution not found` → Solution name doesn't match any in source environment. Run `agentsync solutions list` to see available names.
- `Environment URL not configured` → Tenant config missing environment URL. Run `agentsync init` to auto-discover or set manually in config/tenants.yaml.

## Notes

- Use `--direct` flag on deploy to avoid needing Redis
- Solution arg can be a name (looked up in source env) or a path to a .zip
- Tenant arg can be a name or ID from config
- Config file is at `./config/tenants.yaml` by default (override with `-c`)
- Run `agentsync demo on` first if no production credentials are configured
- All commands support `--help` for full options

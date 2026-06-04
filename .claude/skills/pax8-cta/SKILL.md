---
name: pax8-cta
description: Use when the user asks to deploy, manage, audit, or troubleshoot Power Platform / Copilot Studio solutions ("agents") across multiple Microsoft 365 customer tenants — the tool is branded "Pax8 CTA" but the CLI binary is `agentsync`. Triggers include "deploy <solution> to <tenants>", "what's deployed where", "fleet drift", "tenant health", "GDAP issues", "rollback", "preview a deploy", "is my fleet healthy", and direct mentions of "agentsync", "pax8-cta", "pax8 cta", or the REPL prompt `pax8-cta>`. Run from a checkout of the agentsync repo or anywhere `agentsync` is on PATH. Skip for unrelated Power Platform work that doesn't involve multi-tenant fleet deployment.
tools: Bash, Read, Grep, Glob
---

# Pax8 CTA CLI (`agentsync`)

Multi-tenant deployment for Copilot Studio / Power Platform solutions, via GDAP delegation. The user has a partner Azure AD app, a fleet of customer tenants in `config/tenants.yaml`, and wants to ship the same solution to many tenants without clicking through each one. Translate natural-language requests into `agentsync` commands, run them, and interpret the output.

## Naming — read this first

The product is in the middle of a rebrand. The two names refer to the same tool:

| Surface                 | Name                                                            |
| ----------------------- | --------------------------------------------------------------- |
| **CLI binary you type** | `agentsync`                                                     |
| **npm package**         | `pax8-cta`                                                      |
| **Env vars**            | `PAX8_CTA_*` (e.g. `PAX8_CTA_QUIET`, `PAX8_CTA_DEFAULT_FORMAT`) |
| **Config directory**    | `~/.agentsync/`                                                 |
| **Repo / project root** | `agentsync`                                                     |
| **REPL prompt**         | `pax8-cta>`                                                     |
| **Demo banner**         | "Pax8 CTA CLI"                                                  |
| **User-facing brand**   | "Pax8 CTA"                                                      |

When constructing commands, always use the binary name (`agentsync deploy ...`). When talking about the product to the user, follow their lead — they may say "agentsync", "pax8-cta", or "Pax8 CTA"; treat all three as the same tool.

If credentials aren't configured, suggest `agentsync demo on` first — the CLI ships with mock fleet data so the user can try every command before connecting real tenants.

## Natural-language → command

| User says                             | Run                                                                           |
| ------------------------------------- | ----------------------------------------------------------------------------- |
| "deploy X to enterprise tenants"      | `agentsync deploy X --tag enterprise`                                         |
| "preview the deploy" / "dry run"      | add `--dry-run` (and consider `--json` for structured plan)                   |
| "deploy to one customer"              | `agentsync deploy X --tenant "Contoso"`                                       |
| "deploy a zip I already have"         | `agentsync deploy ./MyAgent.zip --all`                                        |
| "what tenants do I have"              | `agentsync tenants list` (filter with `--tag` / `--search` / `--status`)      |
| "is the fleet healthy"                | `agentsync tenants health`                                                    |
| "drill into tenant X"                 | `agentsync tenants show X --health --agents`                                  |
| "check connectivity / permissions"    | `agentsync tenants inspect` (or per-tenant: `agentsync validate -t X --gdap`) |
| "what's available to ship"            | `agentsync solutions list`                                                    |
| "where is solution X deployed"        | `agentsync solutions show X --tenants`                                        |
| "what versions are running" / "drift" | `agentsync solutions drift --risk`                                            |
| "uninstall X from tenant Y"           | `agentsync solutions remove X -t Y`                                           |
| "what's been deployed recently"       | `agentsync deployments list --limit 10`                                       |
| "show failures from last week"        | `agentsync deployments list --status failed --since 7d`                       |
| "why did deployment X fail"           | `agentsync deployments show <id>` then read the per-tenant errors             |
| "risk-check before I ship"            | `agentsync analyze X --tag production`                                        |
| "set up the partner app on tenant X"  | `agentsync setup -t X` (or `--all`)                                           |
| "store my client secret"              | `agentsync auth login`                                                        |
| "let me try without credentials"      | `agentsync demo on`                                                           |
| "switch back to real mode"            | `agentsync demo off`                                                          |
| "what's my config" / "show settings"  | `agentsync config` (add `--json` for machine-readable)                        |

If the user is in the REPL (`agentsync` with no args), drop the `agentsync` prefix — the REPL also tolerates it if typed.

## Command reference

```
agentsync init [--demo] [--interactive]               Guided setup wizard
agentsync auth login | logout | status                Manage client secret in OS keychain
agentsync validate [-t <tenant>] [--gdap]             Check config + creds + environments
agentsync setup --check | --all | -t <tenant>         Register the partner app as an
                                                       application user in target tenants

agentsync tenants list [--tag X] [--search Q] [--status enabled|disabled|all]
agentsync tenants inspect [-t <tenant>]               Validate connectivity for each tenant
agentsync tenants show <tenant> [--health] [--agents]
agentsync tenants health [<tenant>]
agentsync tenants enable | disable <tenant>
agentsync tenants tag <tenant> --add X --remove Y

agentsync solutions list [-t <tenant>]                Source env (default) or a target tenant
agentsync solutions show <name> [--tenants]
agentsync solutions drift [--risk] [--outdated] [--fix [--force]]
agentsync solutions remove <solution> -t <tenant> [-y]

agentsync export <solution> [--unmanaged] [-o <dir>]
agentsync import <zip> -t <tenant> [--no-publish] [--no-overwrite]

agentsync deploy <solution|zip> [--all | --tag X | --tenant Y] [--dry-run]
                                [--unmanaged] [--keep-package] [--skip-url-replace]
agentsync analyze <solution|zip> [--tag X | --all]    Pre-deploy risk scan

agentsync deployments list [--status failed|success] [--since 7d] [--limit N]
                           [-t <tenant>] [-a <solution>]
agentsync deployments show <id>
agentsync deployments undo <id> [--dry-run] [-y] [--json]    Roll back a bad deploy

agentsync status [--list | --setup | -d <id>]         Setup/deployment status overview

agentsync demo on | off | status | toggle             Mock-data mode for credential-free use
agentsync demo auto                                   Scripted walkthrough demo
agentsync config [--json]                             Show effective settings: demo mode,
                                                       credentials presence, telemetry, paths
```

`deployments` supports `list`, `show`, and `undo` in the OSS CLI. `undo` rolls back a previous deployment by re-importing the prior solution version via `RollbackService`; in demo mode it simulates the per-tenant flow and writes an audit entry. `watch`, `retry`, and `cancel` belonged to a queue-backed mode that's not part of the OSS build.

If the user asks to "undo a bad deploy" or "roll back a deployment", reach for `agentsync deployments undo <id>` (always with confirmation — see policy below).

## Composing commands (JSON & pipelines)

Every command supports `--json` and most lists support `--ids-only`. Use these for parsing and pipelines rather than scraping table output:

```bash
# Get tenant IDs as a flat list
agentsync tenants list --tag production --ids-only

# Drive a per-tenant action from a list
agentsync tenants list --tag production --ids-only \
  | xargs -I{} agentsync deployments list --tenant {} --json

# Parse a deployment to extract failed tenants
agentsync deployments show <id> --json | jq '.tenants[] | select(.status=="failed")'

# Dry-run plan as JSON for review by another tool
agentsync deploy MyAgent --tag production --dry-run --json
```

Global flags (placed anywhere):

- `--json` — structured output (auto-on when stdout is not a TTY)
- `--ids-only` — one ID per line, ideal for `xargs`
- `--quiet` — suppress stdout, exit code only (errors still go to stderr)
- `--verbose` — debug logging

## Error recipes

| Symptom                                                    | Likely cause                                      | Fix                                                                                             |
| ---------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `Missing privilege 'prv...'`                               | GDAP role lacks Power Platform Admin              | Add Power Platform Admin role in Partner Center for that delegated relationship                 |
| `No GDAP relationship` / `No shipping route`               | No delegated admin link                           | Set up GDAP in Partner Center for the customer tenant                                           |
| `403 Forbidden` on Dataverse calls                         | App user not registered in the tenant's Dataverse | `agentsync setup -t <tenant>`                                                                   |
| `401 Unauthorized` / token expired                         | Invalid or missing client secret                  | `agentsync auth status`, then `agentsync auth login` if needed (or set `PARTNER_CLIENT_SECRET`) |
| `Solution not found`                                       | Name mismatch (case-sensitive)                    | `agentsync solutions list` to find the exact name                                               |
| `Environment URL not configured`                           | Tenant config missing `environmentUrl`            | Edit `config/tenants.yaml` or rerun `agentsync init`                                            |
| `Failed to load fleet manifest` (`ERROR_CONFIG_NOT_FOUND`) | Wrong cwd or no config                            | Either `agentsync init`, `cd` to the project, or pass `-c <path>`                               |
| `⚠️ DEMO MODE - Using mock data` banner                    | Demo mode is on (intentional)                     | Inform the user; offer `agentsync demo off` if they expected real data                          |

When a deployment partially fails: `agentsync deployments show <id>` lists per-tenant status and error. Group by error class before recommending fixes — "GDAP not set up on 3 tenants" beats "deploy failed on 3 tenants."

## Confirmation policy

Don't ask the user before every command — that's noise. Ask only when an action would change real-world state in a way that's hard to reverse, or has a wide blast radius. The shape of the right behaviour:

**Run without asking** (read-only or self-contained):

- `tenants list | show | health | inspect`
- `solutions list | show | drift` (without `--fix`)
- `deployments list | show`
- `analyze` (with or without `--tag` / `--all`)
- `validate`, `status`
- `demo status`, `auth status`
- Any `--dry-run`
- Any `--help`

**Confirm first, paraphrasing the impact** (mutates real tenants, infra, or credentials):

- `deploy` without `--dry-run` — _especially_ anything `--all` or `--tag <wide-tag>`. Always summarize: "this will deploy <solution> to <N> tenants matching <selector> — proceed?"
- `deployments undo <id>` — re-imports the previous solution version across the deployment's tenants; mutates real Dataverse state. Always summarize: "this will roll back <solution> on <N> tenants from <id> — proceed?" Pair with `--dry-run` first when unsure.
- `solutions remove` — uninstalls a managed solution from a target tenant; recoverable but disruptive.
- `solutions drift --fix` — issues real updates across the fleet.
- `setup` (any form) — registers an application user inside customer tenants.
- `auth login | logout` — touches the OS keychain.
- `tenants enable | disable | tag` — config edits that change future deploy scope.
- `import` — modifies a target tenant's solution state.
- `export` — usually safe (writes to local `agent packages/`), but mention if it'd overwrite an existing zip.
- `init` — writes a config file; always confirm if one already exists.
- `demo on | off` — flips the user's mode globally; not destructive but surprising if they didn't ask.

**Hard rules regardless of category:**

- Before any deploy that would touch >5 tenants, restate the targets and ask. Even if the user said "yes" to deploys generally earlier in the session.
- A user approving one destructive action does not approve the next one. Re-confirm per action.
- If a command is in demo mode (the `⚠️ DEMO MODE` banner is showing), skip confirmation — nothing real happens. But do tell the user demo mode is on so they know why.
- If the user explicitly says "just do it" / "run everything" / "stop asking," respect that for the rest of the conversation, but still draw the line at admin-bypass-style operations (force pushes, mass deletions, dropping production resources).

When in doubt, prefer asking once over a stuck deployment. The cost of a redundant prompt is small; the cost of an unwanted production change is large.

## Notes & gotchas

- **Solution argument** is either a name (looked up in source env and exported on the fly) or a path to a `.zip`. Prefer the name unless the user has a pre-built zip.
- **Tenant argument** accepts either the friendly name from `config/tenants.yaml` or the tenant GUID.
- **Default targeting** for `deploy` is `--all`. Always check whether the user meant the full fleet or a slice — confirm before running unscoped deploys against >5 tenants.
- **Demo mode is sticky** (`~/.agentsync/cli-config.json`). The per-command `⚠️ DEMO MODE` banner is the signal that what you just ran was mock data — don't claim real changes happened.
- **`--dry-run` before `deploy`** is the safe default for any deployment >1 tenant. Pair with `--json` if the user wants to script approval.
- **Config lives at `./config/tenants.yaml`** by default. Override with `-c <path>` per command.
- **`agentsync init` writes a `config/tenants.yaml`** with example tenants and inline comments showing the schema — point users there rather than dictating the format from memory.
- All commands accept `--help` for the full flag list; run it before guessing flag names you don't see here.

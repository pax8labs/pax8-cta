---
name: pax8-cta
description: Use when the user asks to deploy, manage, audit, or troubleshoot Power Platform / Copilot Studio solutions ("agents") across multiple Microsoft 365 customer tenants — the tool is "Pax8 Cross-Tenant Agents" (short: "Pax8 CTA"); the CLI binary is `pax8-cta`. Triggers include "deploy <solution> to <tenants>", "what's deployed where", "fleet drift", "tenant health", "GDAP issues", "rollback", "preview a deploy", "is my fleet healthy", and direct mentions of "pax8-cta", "Pax8 CTA", "Pax8 Cross-Tenant Agents", or the REPL prompt `pax8-cta>`. Run from a checkout of the pax8-cta repo or anywhere `pax8-cta` is on PATH. Skip for unrelated Power Platform work that doesn't involve multi-tenant fleet deployment.
tools: Bash, Read, Grep, Glob
---

# Pax8 CTA CLI (`pax8-cta`)

Multi-tenant deployment for Copilot Studio / Power Platform solutions, via GDAP delegation. The user has a partner Azure AD app, a fleet of customer tenants in `config/tenants.yaml`, and wants to ship the same solution to many tenants without clicking through each one. Translate natural-language requests into `pax8-cta` commands, run them, and interpret the output.

## Naming

| Surface                 | Name                                                            |
| ----------------------- | --------------------------------------------------------------- |
| **Full product name**   | Pax8 Cross-Tenant Agents                                        |
| **Short name**          | Pax8 CTA                                                        |
| **CLI binary you type** | `pax8-cta`                                                      |
| **npm package**         | `pax8-cta`                                                      |
| **Env vars**            | `PAX8_CTA_*` (e.g. `PAX8_CTA_QUIET`, `PAX8_CTA_DEFAULT_FORMAT`) |
| **Config directory**    | `~/.pax8-cta/`                                                  |
| **Repo / project root** | `pax8-cta`                                                      |
| **REPL prompt**         | `pax8-cta>`                                                     |

When constructing commands, always use the binary name (`pax8-cta deploy ...`). When talking about the product to the user, follow their lead — they may say "pax8-cta", "CTA", or "Pax8 CTA"; treat all as the same tool.

If credentials aren't configured, suggest `pax8-cta demo on` first — the CLI ships with mock fleet data so the user can try every command before connecting real tenants.

## Natural-language → command

| User says                             | Run                                                                         |
| ------------------------------------- | --------------------------------------------------------------------------- |
| "deploy X to enterprise tenants"      | `pax8-cta deploy X --tag enterprise`                                        |
| "preview the deploy" / "dry run"      | add `--dry-run` (and consider `--json` for structured plan)                 |
| "deploy to one customer"              | `pax8-cta deploy X --tenant "Contoso"`                                      |
| "deploy a zip I already have"         | `pax8-cta deploy ./MyAgent.zip --all`                                       |
| "what tenants do I have"              | `pax8-cta tenants list` (filter with `--tag` / `--search` / `--status`)     |
| "is the fleet healthy"                | `pax8-cta tenants health`                                                   |
| "drill into tenant X"                 | `pax8-cta tenants show X --health --agents`                                 |
| "check connectivity / permissions"    | `pax8-cta tenants inspect` (or per-tenant: `pax8-cta validate -t X --gdap`) |
| "what's available to ship"            | `pax8-cta solutions list`                                                   |
| "where is solution X deployed"        | `pax8-cta solutions show X --tenants`                                       |
| "what versions are running" / "drift" | `pax8-cta solutions drift --risk`                                           |
| "uninstall X from tenant Y"           | `pax8-cta solutions remove X -t Y`                                          |
| "what's been deployed recently"       | `pax8-cta deployments list --limit 10`                                      |
| "show failures from last week"        | `pax8-cta deployments list --status failed --since 7d`                      |
| "why did deployment X fail"           | `pax8-cta deployments show <id>` then read the per-tenant errors            |
| "risk-check before I ship"            | `pax8-cta analyze X --tag production`                                       |
| "set up the partner app on tenant X"  | `pax8-cta setup -t X` (or `--all`)                                          |
| "store my client secret"              | `pax8-cta auth login`                                                       |
| "let me try without credentials"      | `pax8-cta demo on`                                                          |
| "switch back to real mode"            | `pax8-cta demo off`                                                         |
| "what's my config" / "show settings"  | `pax8-cta config` (add `--json` for machine-readable)                       |

If the user is in the REPL (`pax8-cta` with no args), drop the `pax8-cta` prefix — the REPL also tolerates it if typed.

## Command reference

```
pax8-cta init [--demo] [--interactive]               Guided setup wizard
pax8-cta auth login | logout | status                Manage client secret in OS keychain
pax8-cta validate [-t <tenant>] [--gdap]             Check config + creds + environments
pax8-cta setup --check | --all | -t <tenant>         Register the partner app as an
                                                       application user in target tenants

pax8-cta tenants list [--tag X] [--search Q] [--status enabled|disabled|all]
pax8-cta tenants inspect [-t <tenant>]               Validate connectivity for each tenant
pax8-cta tenants show <tenant> [--health] [--agents]
pax8-cta tenants health [<tenant>]
pax8-cta tenants enable | disable <tenant>
pax8-cta tenants tag <tenant> --add X --remove Y

pax8-cta solutions list [-t <tenant>]                Source env (default) or a target tenant
pax8-cta solutions show <name> [--tenants]
pax8-cta solutions drift [--risk] [--outdated] [--fix [--force]]
pax8-cta solutions remove <solution> -t <tenant> [-y]

pax8-cta export <solution> [--unmanaged] [-o <dir>]
pax8-cta import <zip> -t <tenant> [--no-publish] [--no-overwrite]

pax8-cta deploy <solution|zip> [--all | --tag X | --tenant Y] [--dry-run]
                                [--unmanaged] [--keep-package] [--skip-url-replace]
pax8-cta analyze <solution|zip> [--tag X | --all]    Pre-deploy risk scan

pax8-cta deployments list [--status failed|success] [--since 7d] [--limit N]
                           [-t <tenant>] [-a <solution>]
pax8-cta deployments show <id>
pax8-cta deployments undo <id> [--dry-run] [-y] [--json]    Roll back a bad deploy

pax8-cta status [--list | --setup | -d <id>]         Setup/deployment status overview

pax8-cta demo on | off | status | toggle             Mock-data mode for credential-free use
pax8-cta demo auto                                   Scripted walkthrough demo
pax8-cta config [--json]                             Show effective settings: demo mode,
                                                       credentials presence, telemetry, paths
```

`deployments` supports `list`, `show`, and `undo` in the OSS CLI. `undo` rolls back a previous deployment by re-importing the prior solution version via `RollbackService`; in demo mode it simulates the per-tenant flow and writes an audit entry. `watch`, `retry`, and `cancel` belonged to a queue-backed mode that's not part of the OSS build.

If the user asks to "undo a bad deploy" or "roll back a deployment", reach for `pax8-cta deployments undo <id>` (always with confirmation — see policy below).

## Composing commands (JSON & pipelines)

Every command supports `--json` and most lists support `--ids-only`. Use these for parsing and pipelines rather than scraping table output:

```bash
# Get tenant IDs as a flat list
pax8-cta tenants list --tag production --ids-only

# Drive a per-tenant action from a list
pax8-cta tenants list --tag production --ids-only \
  | xargs -I{} pax8-cta deployments list --tenant {} --json

# Parse a deployment to extract failed tenants
pax8-cta deployments show <id> --json | jq '.tenants[] | select(.status=="failed")'

# Dry-run plan as JSON for review by another tool
pax8-cta deploy MyAgent --tag production --dry-run --json
```

Global flags (placed anywhere):

- `--json` — structured output (auto-on when stdout is not a TTY)
- `--ids-only` — one ID per line, ideal for `xargs`
- `--quiet` — suppress stdout, exit code only (errors still go to stderr)
- `--verbose` — debug logging

## Error recipes

| Symptom                                                    | Likely cause                                      | Fix                                                                                           |
| ---------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `Missing privilege 'prv...'`                               | GDAP role lacks Power Platform Admin              | Add Power Platform Admin role in Partner Center for that delegated relationship               |
| `No GDAP relationship` / `No shipping route`               | No delegated admin link                           | Set up GDAP in Partner Center for the customer tenant                                         |
| `403 Forbidden` on Dataverse calls                         | App user not registered in the tenant's Dataverse | `pax8-cta setup -t <tenant>`                                                                  |
| `401 Unauthorized` / token expired                         | Invalid or missing client secret                  | `pax8-cta auth status`, then `pax8-cta auth login` if needed (or set `PARTNER_CLIENT_SECRET`) |
| `Solution not found`                                       | Name mismatch (case-sensitive)                    | `pax8-cta solutions list` to find the exact name                                              |
| `Environment URL not configured`                           | Tenant config missing `environmentUrl`            | Edit `config/tenants.yaml` or rerun `pax8-cta init`                                           |
| `Failed to load fleet manifest` (`ERROR_CONFIG_NOT_FOUND`) | Wrong cwd or no config                            | Either `pax8-cta init`, `cd` to the project, or pass `-c <path>`                              |
| `⚠️ DEMO MODE - Using mock data` banner                    | Demo mode is on (intentional)                     | Inform the user; offer `pax8-cta demo off` if they expected real data                         |

When a deployment partially fails: `pax8-cta deployments show <id>` lists per-tenant status and error. Group by error class before recommending fixes — "GDAP not set up on 3 tenants" beats "deploy failed on 3 tenants."

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
- **Demo mode is sticky** (`~/.pax8-cta/cli-config.json`). The per-command `⚠️ DEMO MODE` banner is the signal that what you just ran was mock data — don't claim real changes happened.
- **`--dry-run` before `deploy`** is the safe default for any deployment >1 tenant. Pair with `--json` if the user wants to script approval.
- **Config lives at `./config/tenants.yaml`** by default. Override with `-c <path>` per command.
- **`pax8-cta init` writes a `config/tenants.yaml`** with example tenants and inline comments showing the schema — point users there rather than dictating the format from memory.
- All commands accept `--help` for the full flag list; run it before guessing flag names you don't see here.

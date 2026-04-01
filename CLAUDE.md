# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AgentSync is a multi-tenant Copilot Studio agent deployment tool for MSPs. It exports Power Platform solutions from a source environment and imports them into customer tenants via GDAP (Granular Delegated Admin Privileges).

**The CLI (`packages/cli`) is the primary product** and is intended to be open-sourced as a standalone tool. Development effort should focus here.

The web app (`packages/web`, "Control Tower") is a prototype dashboard that may not be maintained. The worker and mcp-server packages support the web app. Avoid investing significant effort in web/worker/mcp-server unless specifically asked.

## Monorepo Structure

pnpm workspaces with 5 packages:

- **cli** (primary) — Commander.js CLI with interactive REPL mode. Commands: deploy, export, import, agents, tenants, deployments, solutions, validate, analyze, setup, init, auth. Supports standalone binary builds via Bun.
- **core** — Shared business logic: auth (GDAP/Azure AD token management), Dataverse API client, config schema (Zod), deployment services, health checks, risk analysis, rollback, audit logging. Used by both CLI and web.
- **web** (prototype) — Next.js 14 App Router dashboard. NextAuth.js, SWR, TailwindCSS, SQLite via better-sqlite3
- **worker** — BullMQ job processor for background deployments (requires Redis). Supports the web app.
- **mcp-server** — MCP server for Claude Desktop/Cline/Cursor integration

## Commands

```bash
# Install & build
pnpm install && pnpm build

# CLI development
pnpm cli                          # Run CLI
pnpm --filter @agentsync/cli build               # Build CLI only
pnpm --filter @agentsync/cli dev                 # Watch mode

# CLI testing (Vitest, 140+ tests, ~72% coverage)
pnpm --filter @agentsync/cli test                # All CLI tests
pnpm --filter @agentsync/cli test -- --run src/__tests__/init.test.ts  # Single test file
pnpm --filter @agentsync/cli test:coverage       # With coverage
pnpm --filter @agentsync/cli test:ui             # Vitest UI

# All packages
pnpm test                         # Test all
pnpm dev                          # Watch mode all
pnpm lint && pnpm typecheck       # Quality checks
pnpm format:check                 # Prettier check

# Web (prototype — only if needed)
pnpm web                          # Dev server (localhost:3000)
pnpm --filter @agentsync/web test:e2e            # Playwright E2E
```

## Architecture

**Auth flow**: Partner Azure AD app → GDAP delegation → cross-tenant token → Dataverse API calls to customer environments.

**Data flow**: Export solution from source Dataverse → store as .zip → import to each target tenant's Dataverse.

**CLI architecture**: Commander.js commands in `packages/cli/src/commands/`. Interactive REPL mode when invoked with no args. Uses `@agentsync/core` for all business logic. Supports config via `config/tenants.yaml` or `~/.agentsync/cli-config.json`. Can compile to standalone binaries via Bun (`build:binary`, `build:all`).

**Core package**: Service layer pattern — auth, dataverse client, config (Zod schemas), and services (deployment, health, rollback, risk analysis, audit). Shared by CLI and web.

**Demo mode**: Set `DEMO_MODE=true` to bypass Azure AD auth and use mock data — CLI tests run this way by default.

## CLI Testing Patterns

Tests are in `packages/cli/src/__tests__/`. Two approaches:

1. **Subprocess integration tests** (preferred) — use `runCli()` from `test-utils.ts` which spawns the CLI as a child process with `DEMO_MODE=true` and `NO_COLOR=1` set automatically. Use `parseTable()` to assert on CLI table output, `extractJson()` for JSON output.
2. **Unit tests** — import commands directly, mock dependencies with vitest.

Key helpers in `test-utils.ts`: `runCli()`, `runCliExpectSuccess()`, `runCliExpectFailure()`, `parseTable()`, `ConsoleCapture`, `mockSpinner()`, `createMockFetch()`.

Test fixtures (demo tenants, etc.) are in `src/__tests__/fixtures/`.

## Terminology

The README and UI use shipping/logistics metaphors. The actual CLI command names are standard:

| Metaphor   | CLI command        | Meaning                               |
| ---------- | ------------------ | ------------------------------------- |
| pack       | `export`           | Export solution from source Dataverse |
| ship       | `deploy`           | Deploy to multiple tenants            |
| deliver    | `import`           | Import to a single tenant             |
| fleet      | `tenants`          | Customer tenant list                  |
| shipment   | deployment         | A deployment job                      |
| warehouse  | source environment | Where the master agent lives          |
| dockworker | worker             | Background job processor              |
| cargo      | solution           | The .zip solution package             |

## Code Conventions

- TypeScript strict mode, double quotes, 2-space indent, 100 char print width, ES5 trailing commas
- Branch naming: `feature/`, `fix/`, `docs/`, `refactor/`, `test/` prefixes
- Commit style: imperative mood, 50-char summary, explain what/why not how
- CLI entry point (`src/index.ts`) has its own `.env` loader that skips web-only keys (NEXTAUTH\_\*, DEMO_MODE, etc.)

## Key Config Files

- `config/tenants.yaml` — Fleet configuration (tenants, tags, connection mappings, waves)
- `~/.agentsync/cli-config.json` — Per-user CLI settings (credentials, demo mode toggle)
- `.env` / `.env.example` — Credentials and infrastructure settings

## Gotchas

- **`AGENTSYNC_CLI_MODE=true`** — Set at the top of `cli/src/index.ts` to prevent `@agentsync/worker` from auto-starting BullMQ workers when other packages import it.
- **REPL mode** — Running `agentsync` with no args enters an interactive prompt (`AgentSync> `). It recreates the Commander program for each command to avoid stale state. The REPL intercepts `process.exit()` to prevent commands from killing the session.
- **Bun binary builds** — `build:binary` compiles to a standalone executable via Bun. This is separate from the normal `tsc` build. The binary targets are macOS arm64/x64, Linux x64/arm64, Windows x64.
- **CLI .env loading** — The CLI has a custom `.env` parser (not dotenv) that deliberately skips `DEMO_MODE`, `NEXTAUTH_*`, `LOG_LEVEL`, and `NODE_ENV` to avoid conflicts with CLI-managed settings.

## Claude Code Skills

Custom skills are in `.claude/skills/` and `.claude/commands/`. The `/deployments`, `/deploy`, `/fix-failures`, and `/monitor` commands interact with the AgentSync API at localhost:3000.

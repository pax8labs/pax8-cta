# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in this repository.

## Project Overview

Pax8 CTA is now a CLI-focused open-source tool for multi-tenant Copilot Studio deployments via GDAP.

## Monorepo Structure

pnpm workspace with 2 packages:

- **cli** — Commander.js CLI, REPL mode, deploy/export/import/tenants/deployments/solutions/setup/auth/validate/analyze commands.
- **core** — Shared auth, config, Dataverse, Power Platform clients, and deployment services.

## Commands

```bash
# Install & build
pnpm install && pnpm build

# CLI
pnpm cli
pnpm --filter pax8-cta build
pnpm --filter pax8-cta dev

# Tests
pnpm test
pnpm --filter pax8-cta test
pnpm --filter @pax8-cta/core test
```

## Architecture Notes

- Auth flow: Partner Azure AD app -> GDAP delegation -> Dataverse API calls in customer tenants.
- Data flow: export solution ZIP from source -> deploy/import to target tenants.
- CLI loads `.env` with selective key filtering and supports `~/.pax8-cta/cli-config.json`.
- Demo mode: `DEMO_MODE=true` uses mock data and bypasses Azure auth.

## Conventions

- TypeScript strict mode, 2-space indentation, double quotes, trailing commas.
- Commit summaries should be <=50 chars with a type prefix (`feat:`, `fix:`, etc.).
- Prefer CLI/core changes; avoid introducing web/worker-specific assumptions.

## Testing Patterns

- `packages/cli/src/__tests__/test-utils.ts` includes `runCli`, `runCliExpectSuccess`, `runCliExpectFailure`, `parseTable`, `extractJson`.
- Favor subprocess integration tests for command behavior.

## Key Config Files

- `config/tenants.yaml`
- `~/.pax8-cta/cli-config.json`
- `.env` / `.env.example`

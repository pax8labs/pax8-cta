# Changelog

All notable changes to AgentSync will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **URL replacement in deploy** — Solutions are scanned for tenant-specific URLs (SharePoint, Dynamics 365, M365) and automatically replaced per target tenant before import. Use `--skip-url-replace` to opt out.
- **Same-tenant detection in tenants inspect** — Skips GDAP check when partner and destination tenant IDs match, showing "Same-tenant auth" instead of a false failure.
- **Drift detection stories** — Planned: risk-scored drift analysis with gated remediation (#255–#259).

### Fixed

- **Spinner output contaminating JSON** — All spinner/progress output now goes to stderr, keeping stdout clean for `--json` piping.
- **Stale command names** — Help text and error messages updated from old shipping metaphors (`agents list`, `ship`, `fleet list`) to current names (`solutions list`, `deploy`, `tenants list`).
- **Validate wrapping CliError** — `validate -t <nonexistent>` now shows the original error instead of wrapping it in "Config file Invalid".
- **Demo mode persisting unexpectedly** — Demo mode auto-disables when real credentials (`PARTNER_CLIENT_SECRET`) are detected, preventing the trap where `init --demo` leaves all subsequent commands in mock mode.
- **Demo mode warning on stdout** — The `⚠️ DEMO MODE` warning now goes to stderr instead of stdout, preventing JSON output contamination.
- **Deployments JSON key** — `deployments list --json` now uses `"deployments"` as the top-level key, consistent with `tenants list --json` and `solutions list --json`.
- **78 failing web API route tests** — Updated mock patterns across 20+ test files to match current implementations.

## [0.1.0] — 2026-03-09

Initial open source release.

### Added

- **CLI tool** (`agentsync`) with commands: `init`, `validate`, `export`, `import`, `deploy`, `analyze`, `solutions`, `tenants`, `deployments`, `setup`, `auth`, `demo`, `telemetry`.
- **Interactive REPL mode** — Run `agentsync` with no args for an interactive prompt.
- **Guided setup wizard** (`init`) — Device code sign-in, GDAP tenant discovery, environment auto-discovery, credential testing.
- **Multi-tenant deployment** (`deploy`) — Export from source, import to all configured tenants with progress tracking. Supports `--direct` for immediate deployment and `--tag` filtering.
- **Solution management** (`export`, `import`, `solutions list`) — Export managed/unmanaged solutions, import to individual tenants, list solutions in source environment.
- **Tenant management** (`tenants list`, `tenants inspect`, `tenants health`) — Fleet overview, GDAP route inspection, per-tenant health checks.
- **Deployment history** (`deployments list`, `deployments show`) — Query real Dataverse solution history across environments with filtering.
- **Risk analysis** (`analyze`) — Pre-deployment risk scoring with blockers, warnings, and recommendations.
- **Validation** (`validate`) — Config file, credential, tenant connectivity, and source environment checks.
- **App user setup** (`setup`) — Register application users in tenant environments via Dataverse Web API.
- **Auth management** (`auth store`, `auth status`, `auth remove`) — OS keychain integration for client secrets.
- **Demo mode** — Full mock data mode for testing without Azure credentials.
- **Core package** (`@agentsync/core`) — Shared services: Azure AD token management, Dataverse client, GDAP auth, config schema (Zod), health checks, risk analysis, URL templating, audit logging.
- **Standalone binary builds** — Compile to single executables via Bun for macOS (arm64/x64), Linux (x64/arm64), Windows (x64).

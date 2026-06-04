# Changelog

All notable changes to Pax8 CTA will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Rebrand from AgentSync to Pax8 Cross-Tenant Agents (Pax8 CTA)** for OSS launch. **Breaking change.** Affects every public surface — CLI binary (`agentsync` → `pax8-cta`), npm packages (`@agentsync/cli` → `pax8-cta`, `@agentsync/core` → `@pax8-cta/core`), config dir (`~/.agentsync/` → `~/.pax8-cta/`), env vars (`AGENTSYNC_*` → `PAX8_CTA_*`), and the exported error class (`AgentSyncError` → `CtaError`). No backward-compatibility aliases. The Azure-side resources used by the reference setup (Dataverse env `AgentSync-Test2`, security role `AgentSync Deployment Access`, app registration `AgentSync Deployment Tool`) still need to be renamed by an admin in Azure/Power Platform separately — docs reference the new target names (`Pax8CTA-Test2`, `Pax8 CTA Deployment Access`, `Pax8 CTA Deployment Tool`).

### Added

- **GDAP testing suite** — 74 unit tests covering all GdapClient auth logic (#262), plus MSW record/replay integration tests for Graph API calls (#263).
- **OData pagination and retry with backoff** — GdapClient now follows `@odata.nextLink` for paginated Graph API results and retries transient failures with exponential backoff (#267, #268).
- **Token refresh fix** — Refresh access token on each retry attempt in `GdapClient.graphGet` to avoid retrying with an expired token.
- **Structured error codes** — `CtaError` base class with 30+ typed error codes replacing regex-based error matching (#244).
- **Named constants** — Extracted magic numbers throughout core into named constants for clarity and maintainability (#212).
- **Logger configureLogging/resetLogging** — Testable Logger singletons with explicit configuration and reset functions (#209).
- **Business logic extracted to core** — Moved auth-error-parser, environment-setup, and solution-mode-detector from CLI commands into `@pax8-cta/core` for reuse (#241).
- **GDAP scenario simulator** — Generates realistic Graph API test fixtures for GDAP relationship scenarios (#264).
- **Property-based testing** — fast-check property-based tests for GDAP validation and risk analysis (#266).
- **Risk-gated drift fix command** — `agents drift --fix` with `--max-risk`, `--force`, and `--dry-run` flags for safe remediation (#258).
- **Unmanaged customization detection** — Detects unmanaged customizations per tenant as part of drift risk analysis (#259).
- **Improved demo data** — Distinct risk profiles per demo tenant for more realistic risk analysis scenarios (#154).
- **Real-mode CLI test coverage** — 40 tests covering import, export, validate, and analyze in real (non-demo) mode (#210).
- **M365 dev tenant E2E test scaffolding** — Test runner and setup for end-to-end tests against a live M365 developer tenant (#265).
- **Drift risk scoring** — Per-tenant risk scores with actionable recommendations (#256, #257).
- **GDAP validate flag** — `validate --gdap` checks GDAP relationship status for configured tenants.
- **Auto-resolve solution name** — `import` command resolves a solution name to the latest matching zip file.
- **URL replacement in deploy** — Solutions are scanned for tenant-specific URLs (SharePoint, Dynamics 365, M365) and automatically replaced per target tenant before import. Use `--skip-url-replace` to opt out.
- **Same-tenant detection in tenants inspect** — Skips GDAP check when partner and destination tenant IDs match, showing "Same-tenant auth" instead of a false failure.

### Fixed

- **Spinner output contaminating JSON** — All spinner/progress output now goes to stderr, keeping stdout clean for `--json` piping.
- **Stale command names** — Help text and error messages updated from old shipping metaphors (`agents list`, `ship`, `fleet list`) to current names (`solutions list`, `deploy`, `tenants list`).
- **Validate wrapping CliError** — `validate -t <nonexistent>` now shows the original error instead of wrapping it in "Config file Invalid".
- **Demo mode persisting unexpectedly** — Demo mode auto-disables when real credentials (`PARTNER_CLIENT_SECRET`) are detected, preventing the trap where `init --demo` leaves all subsequent commands in mock mode.
- **Demo mode warning on stdout** — The `DEMO MODE` warning now goes to stderr instead of stdout, preventing JSON output contamination.
- **Deployments JSON key** — `deployments list --json` now uses `"deployments"` as the top-level key, consistent with `tenants list --json` and `solutions list --json`.
- **78 failing web API route tests** — Updated mock patterns across 20+ test files to match current implementations.
- **Release workflow command names** — Updated release notes template from shipping metaphors to current CLI commands (#276).

## [0.1.0] — 2026-03-09

Initial open source release.

### Added

- **CLI tool** (`pax8-cta`) with commands: `init`, `validate`, `export`, `import`, `deploy`, `analyze`, `solutions`, `tenants`, `deployments`, `setup`, `auth`, `demo`, `telemetry`.
- **Interactive REPL mode** — Run `pax8-cta` with no args for an interactive prompt.
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
- **Core package** (`@pax8-cta/core`) — Shared services: Azure AD token management, Dataverse client, GDAP auth, config schema (Zod), health checks, risk analysis, URL templating, audit logging.
- **Standalone binary builds** — Compile to single executables via Bun for macOS (arm64/x64), Linux (x64/arm64), Windows (x64).

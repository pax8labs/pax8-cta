# Changelog

All notable changes to Pax8 CTA will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.8] - 2026-06-06

### Fixed

- **Telemetry events were labeled `command: "pax8-cta"` for everything, with no subcommand.** The `postAction` hook in `packages/cli/src/index.ts` was reading `thisCommand` (which is the command the hook was _registered on_ — always `program`, name "pax8-cta") instead of `actionCommand` (the leaf that actually ran). So `pax8-cta tenants list` was tracked as `command="pax8-cta", subcommand=undefined` instead of `command="tenants", subcommand="list"`. v0.1.8 reads `actionCommand` and computes command/subcommand from its position in the command tree. Events captured before v0.1.8 in PostHog will need to be filtered out by date — they're unrecoverably mislabeled.

## [0.1.7] - 2026-06-06

### Fixed

- **Telemetry events were being silently dropped on every CLI exit.** The PostHog client was configured with `flushAt: 10` and `flushInterval: 30000`, but the CLI exits in under a second after a command completes. `shutdownTelemetry()` (which forces the flush) was only called from signal and crash handlers, never from the normal command-completion path. So `pnpm cli telemetry on` then `pax8-cta tenants list` would queue an event in the SDK buffer and then evaporate the buffer when the process exited. Fix: switch `program.parse()` → `await program.parseAsync()` so the action handler resolves, then `await shutdownTelemetry()` to flush the buffer before exit. Also lowered `flushAt` to `1` so the HTTP request starts immediately on each capture.

### Changed

- **Telemetry event property renamed `product` → `app`** to match the convention used by `@pax8/cli` (the Pax8 Marketplace CLI), which tags its events with `app: "pax8-cli"`. CTA events are now tagged `app: "pax8-cta"` (no `@pax8/` scope prefix). Shared PostHog dashboards can now filter cleanly across both Pax8 CLIs using a single property name.

## [0.1.6] - 2026-06-05

### Fixed

- **Telemetry now actually works** (#441). Prior versions wired up PostHog event capture but shipped without a project key baked in, so every `posthog.capture()` call silently no-op'd — opt-in worked at the UX level but no data ever flowed. v0.1.6 bakes the public Pax8 PostHog project key into the build (similar to how Vercel CLI / Next.js / Sentry SDKs ship their public client keys in source). **Telemetry remains opt-in** — users must explicitly run `pax8-cta telemetry on` before any data is sent. All existing privacy guarantees still apply: no tenant IDs, names, solution names, configuration values, or PII are captured. Set `PAX8_CTA_POSTHOG_KEY` to route telemetry elsewhere for local dev / staging, or `PAX8_CTA_TELEMETRY_DISABLED=1` to kill switch.

### Added

- **`product` tag on every telemetry event.** All captured events now carry `product: "@pax8/cta"` so the shared Pax8 PostHog project can distinguish CTA events from any other Pax8 CLI that later adopts the same project.
- **Regression tests for telemetry key shape.** Three new tests (`telemetry-key.test.ts`) catch the previous "dead telemetry" bug: assert the baked-in key is well-formed (`/^phc_[a-zA-Z0-9_-]{20,}$/`), not a placeholder, and that the env-var override path still works for contributors.

## [0.1.5] - 2026-06-05

### Fixed

- **Replaced abandoned `keytar` with `@napi-rs/keyring`** (#436). The `keytar` package was archived upstream in 2024 and its `prebuild-install` dependency was the source of the `npm warn deprecated` on every install. `@napi-rs/keyring` is the actively maintained equivalent with the same OS keychain support (macOS / Windows / Linux). The on-disk credential format is unchanged — service name `"pax8-cta-cli"` is preserved verbatim — so anyone who ran `auth login` on a prior version will keep their stored secret without re-entering it.
- **`pax8-cta status` (no args)** (#434) now shows a clean missing-required-argument error pointing to `deployments list`, instead of the misleading legacy `'status --list' is not available in the open-source CLI` message.
- **`pax8-cta tenants inspect <name>`** (#435) now actually filters to that tenant rather than ignoring the positional and running fleet-wide. Reuses the same `findTenantMatches` helper as `solutions remove -t`, so substring matching, exact-match disambiguation, and "did you mean" hints behave consistently across the CLI. Inactive tenants (e.g. demo `Crown Auto Group`) are now reachable by name from `inspect`, where the fleet-wide path would have hidden them.

### Known issue

- **`uuid@8.3.2` deprecation warning persists on `npm install`.** Comes transitively from `@azure/msal-node@5.1.2` (Microsoft's official auth SDK). Our `pnpm.overrides` forces `uuid@11` during local development, but npm does not honor a dependency's `pnpm.overrides` at consumer install time. Until Microsoft bumps the pin in `@azure/msal-node`, the warning will appear on `npm install @pax8/cta`. It's informational — installs and auth still work.

## [0.1.4] - 2026-06-05

### Changed

- **npm packages renamed to live under the `@pax8` org.** **Breaking change to install commands.** Pax8 publishes multiple OSS products under `@pax8/*` (e.g. `@pax8/cli` for the marketplace); CTA now joins them:
  - `pax8-cta` → `@pax8/cta`
  - `@pax8-cta/core` → `@pax8/cta-core`

  The CLI binary name stays `pax8-cta` — only the npm package name changes. Update your install command:

  ```bash
  # Before
  npm install -g pax8-cta

  # After
  npm install -g @pax8/cta
  ```

  The previous package names (`pax8-cta@0.1.0–0.1.3`, `@pax8-cta/core@0.1.0–0.1.3`) have been unpublished. No production users existed yet, so there's no transition window — all docs, install scripts, and the GitHub repo now reference the new names.

## [0.1.3] - 2026-06-05

### Fixed

- **Bun-compiled binaries crashed on startup.** The v0.1.2 GitHub Release binaries (downloaded via `install.sh`/`install.ps1`) errored with `ENOENT: no such file or directory, open '/$bunfs/package.json'` because the runtime `package.json` read introduced in v0.1.2 doesn't work inside Bun's single-file binary virtual filesystem. Switched to a static `import pkgJson from "../package.json" with { type: "json" }` so Bun inlines the JSON at compile time while Node still resolves it normally from disk for the npm-installed CLI. v0.1.2 binaries are still on GitHub Releases but should not be used.
- **`install.sh` checksum verification failed.** The script renamed the downloaded binary from its platform-suffixed name (e.g. `pax8-cta-macos-arm64`) to `pax8-cta` before running `sha256sum -c`, but the `.sha256` file references the original filename, so the check always failed. Now compares hashes directly instead of relying on filename matching. `install.ps1` already did the right thing.

## [0.1.2] - 2026-06-04

### Fixed

- **`pax8-cta --version` reports the actual installed version.** Previously the version was hardcoded in `src/index.ts`, so `--version` continued to report `0.1.0` even after the package was bumped to `0.1.1`. Now reads from `package.json` at runtime.

## [0.1.1] - 2026-06-04

### Added

- **`@pax8/cta-core` README** — v0.1.0 of `@pax8/cta-core` shipped without a package-level README, so the npm page rendered empty. v0.1.1 adds it.

### Fixed

- **EBADENGINE warning on install** — pinned `posthog-node` to `5.21.0` (the last version with the looser `>=20` engines requirement) so users on Node 20.12–20.19 or 22.0–22.21 no longer see `npm warn EBADENGINE` when installing the CLI. `posthog-node` 5.22+ tightened to `^20.20.0 || >=22.22.0`.

### Internal

- First release published via GitHub Actions trusted publishers (OIDC) rather than a local OTP-gated publish. v0.1.0 was the bootstrap.

## [0.1.0] - 2026-06-04 — Initial OSS release

### Changed

- **Rebrand from AgentSync to Pax8 Cross-Tenant Agents (Pax8 CTA)** for OSS launch. **Breaking change.** Affects every public surface — CLI binary (`agentsync` → `pax8-cta`), npm packages (`@agentsync/cli` → `pax8-cta`, `@agentsync/core` → `@pax8/cta-core`), config dir (`~/.agentsync/` → `~/.pax8-cta/`), env vars (`AGENTSYNC_*` → `PAX8_CTA_*`), and the exported error class (`AgentSyncError` → `CtaError`). No backward-compatibility aliases. The Azure-side resources used by the reference setup (Dataverse env `AgentSync-Test2`, security role `AgentSync Deployment Access`, app registration `AgentSync Deployment Tool`) still need to be renamed by an admin in Azure/Power Platform separately — docs reference the new target names (`Pax8CTA-Test2`, `Pax8 CTA Deployment Access`, `Pax8 CTA Deployment Tool`).

### Added

- **GDAP testing suite** — 74 unit tests covering all GdapClient auth logic (#262), plus MSW record/replay integration tests for Graph API calls (#263).
- **OData pagination and retry with backoff** — GdapClient now follows `@odata.nextLink` for paginated Graph API results and retries transient failures with exponential backoff (#267, #268).
- **Token refresh fix** — Refresh access token on each retry attempt in `GdapClient.graphGet` to avoid retrying with an expired token.
- **Structured error codes** — `CtaError` base class with 30+ typed error codes replacing regex-based error matching (#244).
- **Named constants** — Extracted magic numbers throughout core into named constants for clarity and maintainability (#212).
- **Logger configureLogging/resetLogging** — Testable Logger singletons with explicit configuration and reset functions (#209).
- **Business logic extracted to core** — Moved auth-error-parser, environment-setup, and solution-mode-detector from CLI commands into `@pax8/cta-core` for reuse (#241).
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
- **Core package** (`@pax8/cta-core`) — Shared services: Azure AD token management, Dataverse client, GDAP auth, config schema (Zod), health checks, risk analysis, URL templating, audit logging.
- **Standalone binary builds** — Compile to single executables via Bun for macOS (arm64/x64), Linux (x64/arm64), Windows (x64).

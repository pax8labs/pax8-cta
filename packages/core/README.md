# @pax8-cta/core

Core logic for [Pax8 Cross-Tenant Agents (Pax8 CTA)](https://github.com/pax8labs/pax8-cta) — the multi-tenant Copilot Studio deployment toolkit for MSPs.

This package contains the shared building blocks used by the [`pax8-cta`](https://www.npmjs.com/package/pax8-cta) CLI: GDAP-delegated authentication, Dataverse / Power Platform clients, solution import/export, deployment orchestration, risk analysis, and drift detection.

## When to install this directly

If you're a CLI user, **install [`pax8-cta`](https://www.npmjs.com/package/pax8-cta) instead** — it depends on this package and bundles the command surface you actually want:

```bash
npm install -g pax8-cta
```

Install `@pax8-cta/core` directly only if you're:

- Embedding deployment logic into your own tooling (custom dashboards, scheduled jobs, internal automation)
- Building an alternative front-end (web UI, MCP server, Slack bot) on top of the same primitives
- Writing tests or fixtures that need access to the mock clients and demo data

## Installation

```bash
npm install @pax8-cta/core
```

Requires Node `>=20.12.0`.

## Usage

```ts
import { Client } from "@pax8-cta/core";

const client = new Client({
  partnerTenantId: process.env.PARTNER_TENANT_ID!,
  partnerClientId: process.env.PARTNER_CLIENT_ID!,
  partnerClientSecret: process.env.PARTNER_CLIENT_SECRET!,
});

// List GDAP-delegated customer tenants
const tenants = await client.listTenants();

// Deploy a solution across tenants
await client.deploySolution({
  solutionZip: "./CustomerServiceAgent_managed.zip",
  tenantIds: tenants.map((t) => t.id),
});
```

See the [main repository](https://github.com/pax8labs/pax8-cta) for full documentation, GDAP setup instructions, and the CLI command reference.

## Stability

This package is published primarily as an implementation detail of the `pax8-cta` CLI. While we try to keep the surface stable, the public API may change between minor versions before v1.0. Pin exact versions if you depend on it directly.

## License

Apache-2.0 — see [LICENSE](https://github.com/pax8labs/pax8-cta/blob/main/LICENSE).

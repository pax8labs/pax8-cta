# Open Source Release Request — AgentSync

**Tier:** 2 — Substantial Project
**Date:** March 16, 2026
**Submitted by:** Josh Dulberger

---

## 1. Project Information

- **Project name:** AgentSync (pending rename — see Section 2)
- **Internal repository:** [`pax8labs/agentsync`](https://github.com/pax8labs/agentsync) (current, private)
- **Public repository (target):** `pax8-oss/TBD` (to be created — fresh repo per Section 8, name pending legal clearance)
- **Description:** Multi-tenant Copilot Studio deployment tool for MSPs.
- **Version:** 0.1.0
- **Technical lead:** Josh Dulberger
- **Business owner:** Josh Dulberger

---

## 2. Naming — Pending Legal Clearance

The project's current working name, "AgentSync," poses a trademark risk due to AgentSync, Inc. (agentsync.io) — a well-funded ($150M+) company in the insurance and HR compliance space. While the products are in different categories, sharing a name with an established entity of that size invites unnecessary legal exposure. We need to select and clear a new name before publishing to the `pax8-oss` GitHub org and `@pax8` npm scope.

Six candidate names have been researched across npm, GitHub, web presence, and USPTO. Full details are in the attached [naming-options-for-legal.xlsx](naming-options-for-legal.xlsx). Summary:

| Name              | Risk Level | Product Fit                                      | Key Risk                                                      |
| ----------------- | ---------- | ------------------------------------------------ | ------------------------------------------------------------- |
| **StudioShip**    | Low        | High — "ship" is the developer verb for deploy   | None found                                                    |
| **StudioPort**    | Low        | High — plays on import/export CLI commands       | Defunct 1990s audio product, no active claims                 |
| **StudioRelay**   | Low        | High — relay/handoff concept                     | Relay Studio (Danish agency, reversed word order)             |
| **ProliferAgent** | Medium     | Medium — new metaphor, distinctive               | Proliferate.com (AI agent platform) in adjacent space         |
| **StudioSync**    | Medium     | High — directly references Copilot Studio + sync | WordPress "Studio Sync" feature; Microsoft "Studio" trademark |
| **StudioCast**    | Low-Medium | High — broadcast metaphor                        | Defunct Studiocast entity                                     |

All Studio-prefixed names should be checked against Microsoft's trademark guidelines for "Studio" (Copilot Studio, Visual Studio), though using "Studio" in the name of a tool that deploys Copilot Studio agents may be welcomed by Microsoft as ecosystem support.

**Action for Legal:** Run a formal trademark clearance search on the top 2-3 preferred names and confirm selection before we create the public repository.

---

## 3. Initial Assessment

**Project description:**
AgentSync enables managed service providers (MSPs) to export Copilot Studio agents from a source Dataverse environment and deploy them across hundreds of customer tenants via GDAP — in roughly 2 minutes per tenant after initial setup. It solves the "deploy once, copy-paste forever" problem that blocks Power Platform adoption at MSP scale.

**Target community:** Pax8 partners (MSPs), Microsoft Power Platform practitioners, Copilot Studio developers.

**Attestations:**

- [x] Code does not have Pax8 internal dependencies
  - _Internal references scrubbed in [PR #275](https://github.com/pax8labs/agentsync/pull/275). Demo fixtures reference "pax8" as sample tenant data only — not internal systems._
- [x] No proprietary information disclosed
  - _No proprietary algorithms. The GDAP auth patterns use public Microsoft Graph APIs ([`gdap-client.ts`](https://github.com/pax8labs/agentsync/blob/main/packages/core/src/auth/gdap-client.ts), [`token-manager.ts`](https://github.com/pax8labs/agentsync/blob/main/packages/core/src/auth/token-manager.ts)). Deployment orchestration is novel but not trade-secret-level._
- [x] No marketplace structure/systems exposed
  - _No references to Pax8 marketplace internals, billing systems, or partner data schemas._
- [x] Telemetry disclosed
  - _CLI includes anonymous usage telemetry via PostHog, enabled by default. Fully disclosed in the [README](https://github.com/pax8labs/agentsync/blob/main/README.md) with opt-out via `agentsync telemetry off` or `AGENTSYNC_TELEMETRY_DISABLED=1`. Respects the [`DO_NOT_TRACK`](https://consoledonottrack.com/) standard._
- [x] No secrets or API keys
  - _[`.env.example`](https://github.com/pax8labs/agentsync/blob/main/.env.example) and [`.env.sandbox.example`](https://github.com/pax8labs/agentsync/blob/main/.env.sandbox.example) are clean templates. Credential scan completed in [PR #275](https://github.com/pax8labs/agentsync/pull/275). `.env` is [gitignored](https://github.com/pax8labs/agentsync/blob/main/.gitignore) and not tracked in git history — it will not be included in the public repo. Demo secret replaced with placeholder value._

**Resource commitment:**

- **Primary maintainer:** Josh Dulberger
- **Secondary maintainer:** Cassie Brown

---

## 4. Technical Review

**Code quality:**

- [x] Meets coding standards
  - _Strict TypeScript (5.3.3), ESLint, Prettier, [Husky pre-commit hooks](https://github.com/pax8labs/agentsync/tree/main/.husky). Monorepo with [pnpm workspaces](https://github.com/pax8labs/agentsync/blob/main/pnpm-workspace.yaml)._
- [x] README complete ([`README.md`](https://github.com/pax8labs/agentsync/blob/main/README.md))
  - [x] Project overview
  - [x] Installation instructions (npm, standalone binaries for macOS/Linux/Windows, from source)
  - [x] Usage examples (14 CLI commands documented with examples)
  - [x] Contribution guidelines ([`CONTRIBUTING.md`](https://github.com/pax8labs/agentsync/blob/main/CONTRIBUTING.md) — publish-only model, no outside PRs)
  - [x] License information (Apache 2.0)
- [x] API docs present
  - _CLI help text is comprehensive. [MCP server](https://github.com/pax8labs/agentsync/tree/main/packages/mcp-server) documented. No separate API reference site yet — reasonable for v0.1.0._
- [x] Tests present and passing
  - _511+ [core tests](https://github.com/pax8labs/agentsync/tree/main/packages/core/src/__tests__), ~180 [CLI tests](https://github.com/pax8labs/agentsync/tree/main/packages/cli/src/__tests__). Vitest + MSW + fast-check (property-based). [CI workflow](https://github.com/pax8labs/agentsync/blob/main/.github/workflows/ci.yml) runs lint, typecheck, and full test suite with Redis service._
- [x] Clean git history (no sensitive commits)
  - _Internal reference scrub completed ([PR #275](https://github.com/pax8labs/agentsync/pull/275)). Fresh repo recommended for public release (see Section 8)._

---

## 5. Legal Requirements

**Documentation:**

- [x] Apache 2.0 [`LICENSE`](https://github.com/pax8labs/agentsync/blob/main/LICENSE) in repo root
  - _Copyright 2024 Pax8, Inc. Headers applied to all source files ([PR #277](https://github.com/pax8labs/agentsync/pull/277) / commit 99897f8)._
- [x] [`CONTRIBUTING.md`](https://github.com/pax8labs/agentsync/blob/main/CONTRIBUTING.md) present
  - _Publish-only model: issues welcome, no outside PRs, fork-friendly, security disclosure instructions._
- [x] [`CODE_OF_CONDUCT.md`](https://github.com/pax8labs/agentsync/blob/main/CODE_OF_CONDUCT.md)
  - _Contributor Covenant adopted._
- [ ] Patent considerations
  - _For Legal:_ Apache 2.0 includes an express patent grant. The GDAP deployment orchestration pattern is novel but likely not patentable (it composes public Microsoft APIs). Legal should confirm Pax8 has no filed or pending patents that this code would implicate.

**Compliance:**

- [x] Third-party licenses reviewed
  - _Production license audit of the CLI package (the publishable artifact):_

    | License                 | Count | Packages                                                                                                                                          |
    | ----------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
    | MIT                     | 14    | @azure/identity, @azure/msal-node, better-sqlite3, chalk, cli-table3, commander, conf, inquirer, keytar, node-fetch, open, ora, posthog-node, zod |
    | Apache-2.0              | 2     | @agentsync/cli, @agentsync/core                                                                                                                   |
    | ISC                     | 1     | yaml                                                                                                                                              |
    | MIT OR GPL-3.0-or-later | 1     | jszip                                                                                                                                             |

  - _No copyleft-only dependencies. jszip is dual-licensed MIT/GPL-3.0+ — MIT applies._
  - _Note:_ The [web dashboard](https://github.com/pax8labs/agentsync/tree/main/packages/web) (`@agentsync/web`) includes Anthropic SDK and Google Generative AI SDK. These are MIT-licensed and live in the private `web` package (not published to npm), so no license conflict for the open-source CLI release.

- [x] License compatibility checked
  - _All production dependencies are MIT or Apache 2.0 compatible._
- [ ] Export control
  - _For Legal:_ Standard encryption (TLS, MSAL token handling). No custom cryptographic implementations. Should be straightforward but needs formal sign-off.

---

## 6. Business Review (Tier 2)

### Strategic Alignment

AgentSync makes Copilot Studio deployable at MSP scale, turning a manual, per-tenant process into a 2-minute automated deployment. By open-sourcing the tool, Pax8 drives Power Platform adoption across the marketplace — every MSP using AgentSync is deploying Microsoft workloads through Pax8's ecosystem. The tool creates partner lock-in through utility, not restriction.

### Resource Allocation

Estimated 3-5 hours/week, breaking down as:

- Issue triage: ~1-2 hrs/week (expect low volume at v0.1.0)
- Security reports: acknowledgment within 2 business days, initial assessment within 5 business days
- Releases: 2-4 hrs per release on a monthly cadence
- Scales down as project stabilizes

### Maintenance Plan

- **Response time for issues:** Triage within 3 business days
- **Response time for security reports:** Acknowledgment within 2 business days, assessment within 5 business days (per [`SECURITY.md`](https://github.com/pax8labs/agentsync/blob/main/SECURITY.md))
- **Release cadence:** Monthly patch releases, quarterly minor releases
- **Dependency updates:** [Dependabot configured](https://github.com/pax8labs/agentsync/blob/main/.github/dependabot.yml) ([PR #277](https://github.com/pax8labs/agentsync/pull/277)), automated PR flow
- **Code ownership:** [`CODEOWNERS`](https://github.com/pax8labs/agentsync/blob/main/.github/CODEOWNERS) in place

### Success Metrics (6-month targets)

| Metric                                 | 6-Month Target           | Notes                                                              |
| -------------------------------------- | ------------------------ | ------------------------------------------------------------------ |
| npm downloads (weekly)                 | 50-100                   | Niche audience — not a general-purpose library                     |
| GitHub stars                           | 100-200                  | Signals awareness in the Power Platform community                  |
| Partner adoption                       | 5-10 MSPs actively using | Primary success indicator                                          |
| Issues opened                          | 20+                      | Sign of engagement, not failure                                    |
| Pax8 marketplace Power Platform growth | Measurable uptick        | Hard to attribute solely to AgentSync but directionally meaningful |

### Competition Impact

**What a competitor could learn:**
The GDAP authentication patterns ([`GdapClient`](https://github.com/pax8labs/agentsync/blob/main/packages/core/src/auth/gdap-client.ts), [`TokenManager`](https://github.com/pax8labs/agentsync/blob/main/packages/core/src/auth/token-manager.ts)) document how to discover and use delegated admin relationships programmatically. The [Dataverse solution import/export orchestration](https://github.com/pax8labs/agentsync/blob/main/packages/core/src/services/deployment-service.ts) shows how to manage Power Platform solutions across tenants. The [staged rollout / wave deployment pattern](https://github.com/pax8labs/agentsync/blob/main/packages/core/src/services/waves.ts) is a useful operational blueprint.

**Why it's net positive for Pax8:**
Everything in the code uses public Microsoft APIs (Graph, Dataverse Web API, Power Platform Admin API). Microsoft's own documentation covers the same endpoints — AgentSync's value is in the orchestration and UX, not secret API access. The tool only works if you have GDAP relationships, which means you're already a Microsoft partner, likely already in Pax8's ecosystem. Open-sourcing it makes Pax8's ecosystem stickier: partners who build deployment workflows around AgentSync are operationally tied to Pax8's tooling and marketplace. A competitor could fork it, but they'd need to maintain it, extend it, and build community around it — under Apache 2.0 with Pax8's name on the original.

**Bottom line:** The GDAP patterns are the highest-risk component, but they're built on public APIs any competent developer could figure out from Microsoft's docs. The tool as a whole makes Pax8's partner ecosystem more valuable. Net positive.

### Roadmap (Next 2-3 Milestones)

| Milestone  | What's in it                                                                                                                                                                                                                      | Rationale                                                                                         |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **v0.2.0** | [MCP server](https://github.com/pax8labs/agentsync/tree/main/packages/mcp-server) GA, [drift detection](https://github.com/pax8labs/agentsync/blob/main/packages/core/src/services/drift-analyzer.ts) improvements, CLI UX polish | MCP server exists internally at v1.0.0 — publishing it gives AI-native partners a reason to adopt |
| **v0.3.0** | [Web dashboard](https://github.com/pax8labs/agentsync/tree/main/packages/web) (Control Tower) public beta, [webhook integrations](https://github.com/pax8labs/agentsync/blob/main/packages/core/src/services/webhook.ts)          | The web package exists but is private — opening it up is a big adoption driver                    |
| **v1.0.0** | Stable API surface, [Helm chart](https://github.com/pax8labs/agentsync/tree/main/helm) for self-hosted deployment, partner certification                                                                                          | Signals production-readiness to risk-averse MSPs                                                  |

---

## 7. Risk Assessment

**Security:**

- [x] Security scan done
  - _[Dependabot configured](https://github.com/pax8labs/agentsync/blob/main/.github/dependabot.yml). No known CVEs in current dependency tree at time of review._
- [x] No hardcoded secrets
  - _Credential scan completed ([PR #275](https://github.com/pax8labs/agentsync/pull/275)). `.env` is gitignored and untracked — demo secret replaced with placeholder._
- [x] Dependencies up to date
  - _Dependabot will automate ongoing updates ([PR #277](https://github.com/pax8labs/agentsync/pull/277))._
- [ ] Known vulnerabilities addressed
  - **Action item:** Run `pnpm audit` and document results before final submission.
- [x] [`SECURITY.md`](https://github.com/pax8labs/agentsync/blob/main/SECURITY.md) present
  - _Responsible disclosure via security@pax8.com, 2-day acknowledgment, 5-day assessment._

---

## 8. Git History Decision

**Recommendation: Fresh repo.**

A clean initial commit with a comprehensive [`CHANGELOG`](https://github.com/pax8labs/agentsync/blob/main/CHANGELOG.md) is more professional than 277+ PRs of internal development history. The open-source community cares about what the code does today, not how it got here. A fresh repo eliminates any risk of leaked internal context in older commit messages (JIRA tickets, @-mentions of internal channels, etc.) and aligns with Pax8's clean-presentation standard.

---

## 9. Approval Sign-off (Tier 2)

### Technical Approval

- **Name:** Scott Bates
- **Date:**
- **Comments:**

### Security Approval

- **Name:** Matt Dunham
- **Date:**
- **Comments:**

### Legal Approval

- **Name:** Mel Storey
- **Date:**
- **Comments:**

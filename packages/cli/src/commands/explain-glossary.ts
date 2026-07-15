/**
 * Copyright 2024 Pax8, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Static glossary for `pax8-cta explain <term>`. Fully local — no API,
 * no config. Terms cover the CTA domain: GDAP/auth, Power Platform
 * solutions, cross-tenant deployments, and the operational vocabulary
 * the CLI surfaces (drift, risk bands, etc.). Ported from the sibling
 * `@pax8/cli` glossary (#656); this file is the CTA-specific content.
 */

export type GlossaryCategory = "gdap" | "solution" | "deployment" | "platform" | "operational";

export interface GlossaryEntry {
  /** Canonical kebab-case slug. Lowercase, hyphen-separated. */
  term: string;
  /**
   * Alternate forms that resolve to this entry. Matched after the same
   * normalization applied to user input (lowercase, `_`/whitespace → `-`).
   */
  aliases?: readonly string[];
  category: GlossaryCategory;
  /** One sentence. Always shown. */
  short: string;
  /** Additional context (1–3 sentences). Optional. */
  detail?: string;
  /** Related canonical terms, shown as cross-references. */
  seeAlso?: readonly string[];
  /** Where the concept shows up in the CLI, e.g. a command. */
  reference?: string;
}

export const GLOSSARY: readonly GlossaryEntry[] = [
  // ── GDAP & auth ──────────────────────────────────────────────────────────
  {
    term: "gdap",
    aliases: ["granular-delegated-admin-privileges", "granular-delegated-admin"],
    category: "gdap",
    short:
      "Granular Delegated Admin Privileges — scoped, time-bound admin access a customer grants a partner.",
    detail:
      "CTA acts across a customer fleet through GDAP relationships: the customer delegates specific Entra roles to the partner for a fixed window, instead of the all-or-nothing legacy DAP model. Every Dataverse call CTA makes runs under a GDAP relationship in the target tenant.",
    seeAlso: ["dap", "tenant", "service-principal"],
    reference: "pax8-cta auth",
  },
  {
    term: "dap",
    aliases: ["delegated-admin-privileges", "legacy-dap"],
    category: "gdap",
    short:
      "Delegated Admin Privileges — the legacy, unscoped predecessor to GDAP, now deprecated by Microsoft.",
    detail:
      "DAP granted a partner standing Global Admin over a customer tenant with no scoping or expiry. GDAP replaced it; CTA does not rely on DAP.",
    seeAlso: ["gdap"],
  },
  {
    term: "tenant",
    aliases: ["customer-tenant", "m365-tenant", "entra-tenant"],
    category: "gdap",
    short: "A single customer's Microsoft 365 / Entra ID directory — the unit CTA deploys into.",
    detail:
      "A deployment fans a solution out across many tenants. Tenants are configured in config/tenants.yaml and can be filtered by tag.",
    seeAlso: ["deployment", "gdap"],
    reference: "pax8-cta tenants list",
  },
  {
    term: "app-registration",
    aliases: ["app-reg", "application-registration", "azure-ad-app"],
    category: "gdap",
    short: "The partner-side Entra application whose identity CTA authenticates as.",
    detail:
      "CTA authenticates with the partner's app registration (client ID + secret), then exercises GDAP delegation to reach each customer tenant's Dataverse.",
    seeAlso: ["service-principal", "gdap"],
    reference: "pax8-cta auth",
  },
  {
    term: "service-principal",
    aliases: ["sp", "enterprise-application"],
    category: "gdap",
    short: "The instantiated identity of the partner app inside a specific tenant.",
    detail:
      "An app registration is the global definition; a service principal is its local presence in a tenant. GDAP consent creates the service principal CTA operates through in each customer directory.",
    seeAlso: ["app-registration", "gdap"],
  },

  // ── Solutions ────────────────────────────────────────────────────────────
  {
    term: "solution",
    category: "solution",
    short:
      "A packaged unit of Power Platform components (agents, flows, tables) that CTA deploys as one artifact.",
    detail:
      "Solutions are the transport mechanism for Copilot Studio agents and their dependencies. CTA exports a solution from a source environment and imports it into each target tenant.",
    seeAlso: ["managed-solution", "unmanaged-solution", "export", "import"],
    reference: "pax8-cta solutions",
  },
  {
    term: "managed-solution",
    aliases: ["managed"],
    category: "solution",
    short:
      "A locked, deployment-ready solution whose components can't be edited in the target environment.",
    detail:
      "Managed solutions are what you ship to customers: components are read-only and the whole solution can be cleanly upgraded or removed. CTA deploys managed solutions to tenants.",
    seeAlso: ["unmanaged-solution", "solution"],
  },
  {
    term: "unmanaged-solution",
    aliases: ["unmanaged"],
    category: "solution",
    short:
      "An editable development solution — the authoring form, not meant for customer deployment.",
    detail:
      "You build in an unmanaged solution in a dev environment, then export it as managed for distribution.",
    seeAlso: ["managed-solution", "solution"],
  },
  {
    term: "publisher",
    category: "solution",
    short:
      "The identity that owns a solution's customizations and defines its component name prefix.",
    detail:
      "Every solution belongs to a publisher, which sets the customization prefix (e.g. `pax8_`). Consistent publishers matter for clean upgrades across tenants.",
    seeAlso: ["solution"],
  },
  {
    term: "drift",
    category: "solution",
    short:
      "Divergence between the solution version deployed in a tenant and the current source version.",
    detail:
      "A tenant is 'drifted' when its installed solution is behind (or diverges from) the source. `solutions drift` reports per-tenant drift; `--fix` plans upgrades, skipping high-risk tenants with an inline reason.",
    seeAlso: ["deployment", "risk-band", "analyze"],
    reference: "pax8-cta solutions drift",
  },

  // ── Deployments ──────────────────────────────────────────────────────────
  {
    term: "deployment",
    aliases: ["deploy"],
    category: "deployment",
    short: "A fan-out that installs one solution into many tenants as a single tracked operation.",
    detail:
      "A deployment records per-tenant status (in progress / completed / failed) so partial fleet rollouts are auditable and resumable.",
    seeAlso: ["tenant", "solution", "import"],
    reference: "pax8-cta deploy",
  },
  {
    term: "export",
    category: "deployment",
    short: "Pull a solution out of a source Power Platform environment as a ZIP for deployment.",
    detail:
      "Export is the first half of the pipeline: `export` produces the solution ZIP that `deploy`/`import` then installs into target tenants.",
    seeAlso: ["import", "solution", "deployment"],
    reference: "pax8-cta export",
  },
  {
    term: "import",
    category: "deployment",
    short: "Install a solution ZIP into a target tenant's environment.",
    detail:
      "Import is the per-tenant install step a deployment performs across the fleet. CTA fails fast on Microsoft-managed solutions and surfaces import errors per tenant.",
    seeAlso: ["export", "deployment", "tenant"],
    reference: "pax8-cta import",
  },
  {
    term: "analyze",
    aliases: ["analysis"],
    category: "deployment",
    short: "A pre-deployment risk assessment across the tenant fleet, before anything is changed.",
    detail:
      "`analyze` inspects each tenant and assigns a risk band so you can see what a deployment would touch — and which tenants a `--fix` would skip — without committing.",
    seeAlso: ["risk-band", "drift", "deployment"],
    reference: "pax8-cta analyze",
  },

  // ── Power Platform ───────────────────────────────────────────────────────
  {
    term: "dataverse",
    aliases: ["cds", "common-data-service"],
    category: "platform",
    short: "Microsoft's data platform underneath Power Platform, where solution components live.",
    detail:
      "CTA talks to each tenant's Dataverse Web API to import solutions and read deployment state. The Dataverse instance is scoped to a Power Platform environment.",
    seeAlso: ["environment", "solution"],
  },
  {
    term: "environment",
    aliases: ["power-platform-environment", "env"],
    category: "platform",
    short: "A container within a tenant that holds a Dataverse instance and its solutions.",
    detail:
      "A tenant can have several environments (dev/test/prod). Deployments target a specific environment per tenant.",
    seeAlso: ["dataverse", "tenant"],
  },
  {
    term: "copilot-studio",
    aliases: ["copilot", "power-virtual-agents", "pva"],
    category: "platform",
    short:
      "Microsoft's low-code product for building conversational agents — what CTA deploys across a fleet.",
    detail:
      "Copilot Studio agents (formerly Power Virtual Agents) are packaged into solutions and deployed to customer tenants at scale by CTA.",
    seeAlso: ["solution", "deployment"],
  },

  // ── Operational ──────────────────────────────────────────────────────────
  {
    term: "risk-band",
    aliases: ["risk-level", "risk"],
    category: "operational",
    short:
      "A per-tenant risk classification (e.g. low / medium / high) that gates automated fixes.",
    detail:
      "`analyze` and `solutions drift --fix` assign each tenant a risk band; high-risk tenants are skipped by `--fix` with an inline reason so an operator can act on them deliberately.",
    seeAlso: ["analyze", "drift"],
    reference: "pax8-cta analyze",
  },
];

const NORMALIZE_RE = /[\s_]+/g;

/** Normalize user input to a canonical slug: lowercase, `_`/space → `-`. */
export function normalizeTerm(input: string): string {
  return input
    .toLowerCase()
    .replace(NORMALIZE_RE, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const INDEX = ((): Map<string, GlossaryEntry> => {
  const m = new Map<string, GlossaryEntry>();
  for (const entry of GLOSSARY) {
    m.set(entry.term, entry);
    for (const alias of entry.aliases ?? []) {
      const key = normalizeTerm(alias);
      // A collision means two entries claim the same alias — an authoring
      // bug. Fail loud so the contract test catches it at startup.
      if (m.has(key) && m.get(key) !== entry) {
        throw new Error(
          `explain-glossary: alias "${alias}" (normalized "${key}") collides across "${
            m.get(key)!.term
          }" and "${entry.term}"`
        );
      }
      m.set(key, entry);
    }
  }
  return m;
})();

/** Look up a term (canonical slug or any alias). Returns undefined on miss. */
export function lookupTerm(input: string): GlossaryEntry | undefined {
  return INDEX.get(normalizeTerm(input));
}

/** Every canonical term slug, for "did you mean" ranking. */
export function allCanonicalTerms(): string[] {
  return GLOSSARY.map((e) => e.term);
}

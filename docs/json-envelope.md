# JSON envelope contract (`--json`)

Every pax8-cta command that emits `--json` wraps its payload in one standardized
envelope so that MCP tools, agents, and shell pipelines bind to a single, stable
schema instead of a per-command ad-hoc object. This document is the canonical
contract: shape, field guarantees, and versioning policy. Introduced in #465.

> Human/table output is **not** governed by this contract. The same data,
> rendered for a terminal, keeps its bespoke layout. Only the `--json` surface
> (and the non-TTY default, which is JSON) is standardized.

## Shape

```jsonc
{
  "meta": {
    "command": "solutions drift",        // command path, space-joined
    "generatedAt": "2026-07-02T17:03:11.482Z", // ISO-8601
    "durationMs": 1834,                   // optional; present when timed
    "version": 1                          // envelope schema version
  },
  "data": [ /* ... */ ] | { /* ... */ },  // array for lists, object for shows
  "summary": { /* ... */ },               // optional aggregates
  "nextActions": [                        // optional; omitted when empty
    {
      "label": "Fix outdated tenants",
      "command": "pax8-cta solutions drift --fix",
      "args": ["pax8-cta", "solutions", "drift", "--fix"],
      "description": "Deploy the current version to risk-eligible outdated tenants"
    }
  ]
}
```

## Field guarantees

- **`meta`** — always present.
  - `meta.command` — the command path (e.g. `"tenants list"`, `"deploy"`). Stable per command.
  - `meta.generatedAt` — ISO-8601 UTC timestamp of when the envelope was built.
  - `meta.durationMs` — optional; wall-clock command duration in ms when the command tracks it.
  - `meta.version` — the envelope schema version (currently `1`). Bumped only on a breaking change to the envelope shape.
- **`data`** — always present. The primary payload:
  - an **array** for list commands (`tenants list`, `tenants health` fleet view, `deployments list`, `solutions drift --risk`);
  - an **object** for single-item shows and summaries (`analyze`, `deploy`, `tenants health <name>`, `solutions drift` fleet summary).
- **`summary`** — optional. A flat object of aggregates (counts, deltas, pagination). Omitted when a command has nothing to aggregate.
- **`nextActions`** — optional. The machine-consumable version of the human-facing "Next step:" hints. **Omitted entirely when there is nothing to suggest** (never emitted as an empty array).

## `nextActions[]` — the argv contract

Each entry carries BOTH a `command` display string AND an `args` argv array. They
exist for different consumers and must not be conflated:

- **`command`** is for **human display only**. It interpolates user-supplied
  values (tenant names, solution names) with best-effort quoting and is lossy on
  edge cases. **Never hand it to a shell and never tokenize it.**
- **`args`** is the canonical machine form. `args[0]` is always the binary
  (`"pax8-cta"`). Agent runtimes **spawn `args.slice(1)` directly as an argv
  array** so shell metacharacters in user-supplied values can never break out.

This mirrors the sibling pax8-cli `nextActions` argv contract (their #562) and the
`orderArgs` / `orderCommand` pairing.

- `label` — short human label (always present).
- `command` — display string (always present).
- `args` — argv array; `args[0] === "pax8-cta"` (always present).
- `description` — optional longer explanation.

## Standardized commands

| Command                                  | `data`                       | `summary`                                  | `nextActions`                |
| ---------------------------------------- | ---------------------------- | ------------------------------------------ | ---------------------------- |
| `tenants list --json`                    | array of tenants             | `{ total, active }`                        | —                            |
| `tenants health --json` (fleet)          | array of per-tenant health   | `{ total, healthy, unhealthy }`            | drift, when any degraded     |
| `tenants health <name> --json`           | health object                | —                                          | drift, when degraded         |
| `deployments list --json`                | array of deployments         | `{ total, limit, offset, hasMore }`        | next page, when more exist   |
| `solutions drift --json` (fleet summary) | drift summary object         | —                                          | `--fix`, when outdated       |
| `solutions drift --risk --json` (fleet)  | array of DriftRows           | fleet risk summary                         | `--fix`, when fleet outdated |
| `solutions drift --tenant --json`        | tenant version-status object | —                                          | —                            |
| `solutions drift --tenant --risk --json` | tenant drift analysis object | —                                          | —                            |
| `solutions drift --fix --json`           | `{ plan }` object            | `{ willFix, willSkip, maxRisk, dryRun }`   | —                            |
| `analyze --json`                         | RiskAnalysis object          | `{ score, canProceed, blockers, tenants }` | deploy / re-analyze          |
| `deploy --json` (demo & live)            | deploy result object         | counts                                     | show / review failures       |
| `deploy --dry-run --json`                | dry-run plan object          | plan summary                               | run for real, when clean     |

Commands not yet migrated (e.g. `deployments show`, `deployments undo`,
`solutions show`, `solutions list`, `status`, `validate`, `export`, `import`)
still emit their prior shapes. Migrating them is follow-up work — see the PR for
#465.

## Versioning policy

- `meta.version` starts at `1`.
- Additive changes (new optional `summary` keys, new `nextActions` entries, a new
  optional `meta` field) do **not** bump the version.
- A breaking change to the envelope structure — renaming/removing `data`,
  `meta`, `summary`, or `nextActions`, or changing the `nextActions` argv
  contract — bumps `meta.version` and is called out in the changelog.
- Consumers should read `meta.version` and treat an unrecognized (higher) version
  defensively.

## Consuming from an agent (recommended pattern)

```js
const env = JSON.parse(stdout);
if (env.meta.version !== 1) {
  /* handle unknown version */
}

const rows = env.data; // array or object per command
const counts = env.summary; // may be undefined

for (const action of env.nextActions ?? []) {
  // Spawn the argv form directly. NEVER shell out `action.command`.
  spawn(action.args[0], action.args.slice(1));
}
```

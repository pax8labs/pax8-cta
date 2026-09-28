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
 * Standardized `--json` envelope for pax8-cta commands (#465).
 *
 * Every command that emits `--json` wraps its payload in one shape so that
 * MCP tools and other agent consumers bind to a single, stable schema rather
 * than a per-command ad-hoc object. See `docs/json-envelope.md` for the full
 * contract, field guarantees, and versioning policy.
 *
 * Shape:
 *   {
 *     "meta": { "command", "generatedAt", "durationMs?", "version" },
 *     "data": <array for lists | object for single-item shows>,
 *     "summary?": { ...aggregates },
 *     "nextActions?": [ { "label", "command", "args", "description?" } ]
 *   }
 *
 * Human/table output is untouched — this only governs the `--json` surface.
 */

/** The CLI binary name — first element of every `nextActions[].args` array. */
export const CLI_BIN = "pax8-cta";

/** Envelope schema version. Bumped only on a breaking change to the shape. */
export const ENVELOPE_VERSION = 1;

/**
 * A structured "here's what to do next" entry — the machine-consumable
 * counterpart to the human-facing "Next step: …" hints.
 *
 * Carries BOTH a `command` display string AND an `args` argv array. The two
 * exist for different consumers and must not be conflated:
 *
 *   - `command` is for HUMAN DISPLAY ONLY. It interpolates user-supplied
 *     values (tenant names, solution names) with best-effort quoting and is
 *     lossy on edge cases — never hand it to a shell and never tokenize it.
 *   - `args` is the canonical machine form. The first element is always
 *     `CLI_BIN` (`"pax8-cta"`); agent runtimes spawn `args.slice(1)` directly
 *     as an argv array so shell metacharacters in user values can never break
 *     out. Same contract as pax8-cli's `nextActions` argv pattern (#562).
 */
export interface NextAction {
  /** Short human label, e.g. "Deploy to outdated tenants". */
  label: string;
  /** Display-only command string. Never execute this. */
  command: string;
  /** Canonical argv array; args[0] === CLI_BIN. Spawn args.slice(1). */
  args: string[];
  /** Optional longer description of what the action does / why. */
  description?: string;
}

/** Observability metadata attached to every envelope. */
export interface EnvelopeMeta {
  /** Command path, e.g. "tenants list" or "solutions drift". */
  command: string;
  /** ISO-8601 timestamp of when the envelope was generated. */
  generatedAt: string;
  /** Wall-clock duration of the command in milliseconds, when known. */
  durationMs?: number;
  /** Envelope schema version. */
  version: number;
}

/** The standardized `--json` envelope. */
export interface JsonEnvelope<T> {
  meta: EnvelopeMeta;
  data: T;
  summary?: Record<string, unknown>;
  nextActions?: NextAction[];
}

export interface JsonEnvelopeOptions {
  /** Command path for `meta.command`, e.g. "tenants list". Required. */
  command: string;
  /** Optional aggregates surfaced under `summary`. */
  summary?: Record<string, unknown>;
  /** Optional structured next-step actions. Omitted from output when empty. */
  nextActions?: NextAction[];
  /** Optional command duration in ms; populates `meta.durationMs`. */
  durationMs?: number;
  /**
   * Override the generated-at timestamp. Primarily for tests that need a
   * deterministic envelope; production callers should omit this.
   */
  generatedAt?: string;
}

/**
 * Build a `NextAction` from a label and an argv array (WITHOUT the binary
 * prefix — e.g. `["deploy", "MySolution", "--all"]`). The binary is prepended
 * automatically so callers can't forget it, and the display `command` string
 * is derived from the same source of truth as `args`.
 *
 * Example:
 *   nextAction("Deploy to outdated tenants", ["solutions", "drift", "--fix"])
 *   → {
 *       label: "Deploy to outdated tenants",
 *       command: "pax8-cta solutions drift --fix",
 *       args: ["pax8-cta", "solutions", "drift", "--fix"],
 *     }
 */
export function nextAction(
  label: string,
  argv: readonly string[],
  description?: string
): NextAction {
  const args = [CLI_BIN, ...argv];
  const action: NextAction = {
    label,
    command: displayCommandFromArgs(args),
    args,
  };
  if (description !== undefined) action.description = description;
  return action;
}

/**
 * Wrap a payload in the standard envelope. `data` is passed through verbatim
 * (array for list commands, object for single-item shows). Optional `summary`
 * and `nextActions` are attached only when present so the output stays lean.
 */
export function jsonEnvelope<T>(data: T, opts: JsonEnvelopeOptions): JsonEnvelope<T> {
  const meta: EnvelopeMeta = {
    command: opts.command,
    generatedAt: opts.generatedAt ?? new Date().toISOString(),
    version: ENVELOPE_VERSION,
  };
  if (opts.durationMs !== undefined) meta.durationMs = opts.durationMs;

  const envelope: JsonEnvelope<T> = { meta, data };
  if (opts.summary !== undefined) envelope.summary = opts.summary;
  if (opts.nextActions !== undefined && opts.nextActions.length > 0) {
    envelope.nextActions = opts.nextActions;
  }
  return envelope;
}

/**
 * Serialize an envelope to stdout as pretty-printed JSON. Centralized here so
 * every command emits identical formatting (2-space indent, trailing newline
 * via console.log) and so a future change (e.g. compact mode) has one seam.
 */
export function emitEnvelope<T>(data: T, opts: JsonEnvelopeOptions): void {
  console.log(JSON.stringify(jsonEnvelope(data, opts), null, 2));
}

/**
 * Render an argv array as a human-readable command string. Quotes any element
 * containing whitespace or shell-meaningful characters so the rendered form is
 * unambiguous to a reader. DISPLAY ONLY — consumers must use the `args` array
 * directly and never tokenize this string. Mirrors pax8-cli's
 * `displayCommandFromArgs` (#562).
 */
export function displayCommandFromArgs(args: readonly string[]): string {
  return args.map(displayQuoteArg).join(" ");
}

function displayQuoteArg(arg: string): string {
  if (arg === "") return '""';
  // Conservative whitelist — alnum plus flag-friendly punctuation that never
  // needs quoting. Anything else gets double-quoted with `"` and `\` escaped.
  if (/^[A-Za-z0-9_./:=,@+-]+$/.test(arg)) return arg;
  return `"${arg.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

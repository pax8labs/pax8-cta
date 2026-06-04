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
 * TTY-aware output helper for agentsync CLI commands.
 *
 * - When stdout is a TTY (interactive terminal): defaults to "table"
 * - When stdout is piped (subprocess / LLM agent): defaults to "json"
 *
 * Commands should resolve their format via:
 *   const fmt = (opts.json && "json") || (opts.quiet && "quiet") || getDefaultFormat();
 *   output(rows, { format: fmt, columns });
 */

import Table from "cli-table3";
import { isQuietMode } from "./spinner.js";

// ============================================================================
// Public API types
// ============================================================================

export type OutputFormat = "table" | "json" | "csv" | "quiet" | "ids-only";

export interface Column<T> {
  /** Property key on T to read the raw value from */
  key: keyof T & string;
  /** Column header displayed in table output */
  header: string;
  /**
   * Optional formatter applied to the cell value before rendering.
   * Receives the raw value and the full row. Must return a string.
   * For table output the returned string may contain ANSI codes.
   * For JSON output the raw value (not this formatter's result) is used.
   */
  format?: (value: unknown, row: T) => string;
}

// ============================================================================
// Format detection
// ============================================================================

/**
 * Returns "table" when stdout is an interactive TTY, otherwise "json".
 * Downstream callers (LLM agents, shell pipelines) therefore receive clean
 * JSON without needing to pass --json explicitly.
 *
 * This reads from the `PAX8_CTA_DEFAULT_FORMAT` environment variable which
 * is set by the CLI entry point (`src/index.ts`) based on `process.stdout.isTTY`.
 * Reading the env var rather than `isTTY` directly means unit tests (which run
 * in a non-TTY vitest worker) still default to "table" unless the CLI binary
 * is explicitly invoked as a subprocess.
 *
 * Always returns "quiet" when quiet mode is active, overriding TTY detection.
 */
export function getDefaultFormat(): OutputFormat {
  // Quiet mode wins over all TTY/env-based defaults.
  if (isQuietMode()) return "quiet";
  if (process.env.PAX8_CTA_DEFAULT_FORMAT === "json") return "json";
  if (process.env.PAX8_CTA_DEFAULT_FORMAT === "table") return "table";
  // Fallback: "table" is the safe default when called in-process (unit tests,
  // programmatic use). The CLI entry point (src/index.ts) sets
  // PAX8_CTA_DEFAULT_FORMAT based on isTTY before any commands run, so
  // subprocess invocations that pipe stdout automatically get "json".
  return "table";
}

/**
 * Resolve the effective output format from command option flags.
 *
 * Precedence (highest → lowest):
 *   1. quiet mode (--quiet flag or PAX8_CTA_QUIET env var) — silent wins.
 *      If both --quiet and --json are set, --quiet takes effect.
 *   2. --ids-only flag (mutually exclusive with --json/--csv; root program guards this)
 *   3. --json flag
 *   4. TTY-aware default from getDefaultFormat()
 */
export function resolveFormat(opts: {
  json?: boolean;
  quiet?: boolean;
  idsOnly?: boolean;
}): OutputFormat {
  // --quiet (or env-based quiet) wins over --json. Silent wins.
  if (opts.quiet || isQuietMode()) return "quiet";
  if (opts.idsOnly) return "ids-only";
  if (opts.json) return "json";
  return getDefaultFormat();
}

// ============================================================================
// Core output function
// ============================================================================

/**
 * Render rows in the requested format.
 *
 * @param rows    - Array of data objects to render.
 * @param opts.format   - Output format. Defaults to `getDefaultFormat()`.
 * @param opts.columns  - Column definitions (header + key + optional formatter).
 * @param opts.idKey    - Key whose value is used for "ids-only" format.
 *
 * @throws Error for "csv" (reserved for a future issue).
 */
export function output<T extends object>(
  rows: T[],
  opts: {
    format?: OutputFormat;
    columns: Column<T>[];
    idKey?: keyof T & string;
  }
): void {
  const format = opts.format ?? getDefaultFormat();

  switch (format) {
    case "json":
      outputJson(rows);
      break;

    case "table":
      outputTable(rows, opts.columns);
      break;

    case "quiet":
      // Produce no output — caller is responsible for any success messaging
      break;

    case "csv":
      throw new Error("--csv not yet implemented (see #346 in the issue tracker)");

    case "ids-only":
      outputIdsOnly(rows, opts.idKey, opts.columns);
      break;

    default: {
      // TypeScript exhaustive check
      const _never: never = format;
      throw new Error(`Unknown output format: ${_never}`);
    }
  }
}

// ============================================================================
// Internal renderers
// ============================================================================

function outputJson<T>(rows: T[]): void {
  console.log(JSON.stringify(rows, null, 2));
}

/**
 * Print one ID per line to stdout — no headers, no chrome, no colors.
 *
 * Resolution order for the id field:
 *  1. opts.idKey if provided
 *  2. A column whose key is "id"
 *  3. Error — caller must set idKey or add an "id" column
 */
function outputIdsOnly<T extends object>(
  rows: T[],
  idKey: (keyof T & string) | undefined,
  columns: Column<T>[]
): void {
  // Resolve the key to use
  const key: keyof T & string =
    idKey ??
    (columns.find((c) => c.key === "id")?.key as (keyof T & string) | undefined) ??
    (() => {
      throw new Error(
        "ids-only format: no id key found. " +
          'Either pass idKey to output() or add a column with key "id". ' +
          'Example: output(rows, { format: "ids-only", columns, idKey: "tenantId" })'
      );
    })();

  for (const row of rows) {
    const value = row[key];
    process.stdout.write((value == null ? "" : String(value)) + "\n");
  }
}

function outputTable<T extends object>(rows: T[], columns: Column<T>[]): void {
  const table = new Table({
    head: columns.map((c) => c.header),
    style: { head: ["cyan"] },
  });

  for (const row of rows) {
    table.push(
      columns.map((col) => {
        const raw = row[col.key];
        return col.format ? col.format(raw, row) : raw == null ? "" : String(raw);
      })
    );
  }

  console.log(table.toString());
}

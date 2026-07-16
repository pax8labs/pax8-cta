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
 * Contract tests for the standardized `--json` envelope (#465).
 *
 * Each command that emits `--json` must produce, on stdout, a single JSON
 * object of the shape:
 *
 *   {
 *     meta: { command: string, generatedAt: ISO-8601, version: 1, durationMs? },
 *     data: array | object,
 *     summary?: object,
 *     nextActions?: [ { label, command, args: [ "pax8-cta", ... ], description? } ]
 *   }
 *
 * We validate the envelope structurally (a lightweight in-repo schema check)
 * rather than pulling in a JSON-Schema dependency. The check enforces every
 * field guarantee documented in docs/json-envelope.md.
 */

import { describe, it, expect } from "vitest";
import { runCli } from "./test-utils.js";

const CLI_BIN = "pax8-cta";

interface EnvelopeShapeResult {
  ok: boolean;
  errors: string[];
}

/**
 * Structurally validate an envelope. Returns collected errors so a failing
 * test message shows exactly which guarantee broke.
 */
function validateEnvelope(value: unknown, expectedCommand: string): EnvelopeShapeResult {
  const errors: string[] = [];
  const push = (m: string) => errors.push(m);

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, errors: ["envelope is not a plain object"] };
  }
  const env = value as Record<string, unknown>;

  // meta
  const meta = env.meta as Record<string, unknown> | undefined;
  if (!meta || typeof meta !== "object") {
    push("missing meta object");
  } else {
    if (meta.command !== expectedCommand) {
      push(
        `meta.command === ${JSON.stringify(meta.command)}, want ${JSON.stringify(expectedCommand)}`
      );
    }
    if (
      typeof meta.generatedAt !== "string" ||
      Number.isNaN(Date.parse(meta.generatedAt as string))
    ) {
      push(`meta.generatedAt not an ISO-8601 string: ${JSON.stringify(meta.generatedAt)}`);
    }
    if (meta.version !== 1) push(`meta.version === ${JSON.stringify(meta.version)}, want 1`);
    if (meta.durationMs !== undefined && typeof meta.durationMs !== "number") {
      push("meta.durationMs present but not a number");
    }
  }

  // data — must exist; array or object are both valid.
  if (!("data" in env)) push("missing data");

  // summary — optional; when present must be a plain object.
  if ("summary" in env) {
    const s = env.summary;
    if (typeof s !== "object" || s === null || Array.isArray(s)) {
      push("summary present but not a plain object");
    }
  }

  // nextActions — optional; when present must be a non-empty array of the
  // { label, command, args } contract, with args[0] === "pax8-cta".
  if ("nextActions" in env) {
    const actions = env.nextActions;
    if (!Array.isArray(actions)) {
      push("nextActions present but not an array");
    } else {
      if (actions.length === 0) push("nextActions present but empty (should be omitted)");
      actions.forEach((a, i) => {
        const act = a as Record<string, unknown>;
        if (typeof act.label !== "string") push(`nextActions[${i}].label not a string`);
        if (typeof act.command !== "string") push(`nextActions[${i}].command not a string`);
        if (!Array.isArray(act.args)) {
          push(`nextActions[${i}].args not an array`);
        } else {
          if (act.args[0] !== CLI_BIN) {
            push(`nextActions[${i}].args[0] === ${JSON.stringify(act.args[0])}, want "${CLI_BIN}"`);
          }
          if (!act.args.every((x) => typeof x === "string")) {
            push(`nextActions[${i}].args has a non-string element`);
          }
        }
        if (act.description !== undefined && typeof act.description !== "string") {
          push(`nextActions[${i}].description present but not a string`);
        }
      });
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Each standardized command + its expected `meta.command` and whether `data`
 * should be an array (list) or object (single show / summary).
 */
const CASES: Array<{
  name: string;
  argv: string[];
  command: string;
  dataKind: "array" | "object";
}> = [
  {
    name: "tenants list",
    argv: ["tenants", "list", "--json"],
    command: "tenants list",
    dataKind: "array",
  },
  {
    name: "tenants health (fleet)",
    argv: ["tenants", "health", "--json"],
    command: "tenants health",
    dataKind: "array",
  },
  {
    name: "tenants health (single)",
    argv: ["tenants", "health", "Contoso", "--json"],
    command: "tenants health",
    dataKind: "object",
  },
  {
    name: "deployments list",
    argv: ["deployments", "list", "--json", "--limit", "5"],
    command: "deployments list",
    dataKind: "array",
  },
  {
    name: "solutions drift (summary)",
    argv: ["solutions", "drift", "--json"],
    command: "solutions drift",
    dataKind: "object",
  },
  {
    name: "solutions drift --risk (fleet)",
    argv: ["solutions", "drift", "--risk", "--json"],
    command: "solutions drift",
    dataKind: "array",
  },
  {
    name: "solutions drift --tenant (single)",
    argv: ["solutions", "drift", "--tenant", "Contoso", "--json"],
    command: "solutions drift",
    dataKind: "object",
  },
  {
    name: "solutions drift --tenant --risk (single)",
    argv: ["solutions", "drift", "--tenant", "Contoso", "--risk", "--json"],
    command: "solutions drift",
    dataKind: "object",
  },
  {
    name: "solutions drift --fix",
    argv: ["solutions", "drift", "--fix", "--json", "--yes"],
    command: "solutions drift",
    dataKind: "object",
  },
  {
    name: "analyze",
    argv: ["analyze", "CustomerServiceAgent", "--all", "--json"],
    command: "analyze",
    dataKind: "object",
  },
  {
    name: "deploy (demo success)",
    argv: ["deploy", "CustomerServiceAgent", "--tag", "enterprise", "--json"],
    command: "deploy",
    dataKind: "object",
  },
  {
    name: "deploy --dry-run",
    argv: ["deploy", "CustomerServiceAgent", "--all", "--dry-run", "--json"],
    command: "deploy",
    dataKind: "object",
  },
];

describe("standardized --json envelope contract (#465)", () => {
  for (const c of CASES) {
    it(`${c.name} --json validates against the envelope schema`, async () => {
      const result = await runCli(c.argv, {
        env: { NO_COLOR: "1", DEMO_MODE: "true" },
        timeout: 60000,
      });

      // stdout must be a single parseable JSON object — no chrome.
      let parsed: unknown;
      expect(() => {
        parsed = JSON.parse(result.stdout);
      }, `stdout was not valid JSON:\n${result.stdout}`).not.toThrow();

      const check = validateEnvelope(parsed, c.command);
      expect(check.errors, check.errors.join("\n")).toEqual([]);
      expect(check.ok).toBe(true);

      const env = parsed as { data: unknown };
      if (c.dataKind === "array") {
        expect(Array.isArray(env.data)).toBe(true);
      } else {
        expect(typeof env.data === "object" && env.data !== null && !Array.isArray(env.data)).toBe(
          true
        );
      }
    }, 60000);
  }
});

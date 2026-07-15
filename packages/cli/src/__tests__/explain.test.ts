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

import { describe, it, expect } from "vitest";
import { runCli, runCliExpectFailure, expectJson } from "./test-utils.js";

interface EntryJson {
  term: string;
  category: string;
  short: string;
  detail: string | null;
  seeAlso: string[];
  reference: string | null;
}
interface ListJson {
  terms: Array<{ term: string; category: string; short: string }>;
}

describe("pax8-cta explain", () => {
  it("looks up a term and emits the full entry as JSON", async () => {
    const result = await runCli(["explain", "gdap", "--json"]);
    expect(result.exitCode).toBe(0);
    const entry = expectJson<EntryJson>(result.stdout);
    expect(entry.term).toBe("gdap");
    expect(entry.category).toBe("gdap");
    expect(entry.short.length).toBeGreaterThan(0);
    expect(entry.seeAlso).toContain("tenant");
  });

  it("normalizes case/space/underscore and resolves aliases", async () => {
    // Variadic args + a multi-word alias, no shell quoting — should resolve to
    // the canonical slug `managed-solution`.
    const result = await runCli(["explain", "managed", "solution", "--json"]);
    expect(result.exitCode).toBe(0);
    expect(expectJson<EntryJson>(result.stdout).term).toBe("managed-solution");
  });

  it("--list emits every term grouped, as JSON", async () => {
    const result = await runCli(["explain", "--list", "--json"]);
    expect(result.exitCode).toBe(0);
    const list = expectJson<ListJson>(result.stdout);
    expect(list.terms.length).toBeGreaterThan(5);
    expect(list.terms.map((t) => t.term)).toContain("gdap");
  });

  it("errors on an unknown term with a 'did you mean' suggestion", async () => {
    // A near-miss typo of a real term should surface the fuzzy suggestion.
    const result = await runCliExpectFailure(["explain", "deploymnt", "--json"]);
    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain("No glossary entry");
    expect(result.output).toContain("deployment");
  });

  it("rejects --list combined with a term (usage error)", async () => {
    const result = await runCliExpectFailure(["explain", "--list", "gdap", "--json"]);
    expect(result.exitCode).toBe(2);
    expect(result.output).toContain("mutually exclusive");
  });
});

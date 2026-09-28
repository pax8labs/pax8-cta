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
import {
  jsonEnvelope,
  nextAction,
  displayCommandFromArgs,
  CLI_BIN,
  ENVELOPE_VERSION,
} from "./envelope.js";

describe("jsonEnvelope", () => {
  it("wraps data with meta (command + generatedAt + version)", () => {
    const env = jsonEnvelope([1, 2, 3], {
      command: "tenants list",
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(env.data).toEqual([1, 2, 3]);
    expect(env.meta.command).toBe("tenants list");
    expect(env.meta.generatedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(env.meta.version).toBe(ENVELOPE_VERSION);
  });

  it("defaults generatedAt to an ISO-8601 timestamp", () => {
    const env = jsonEnvelope({ ok: true }, { command: "analyze" });
    expect(env.meta.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(() => new Date(env.meta.generatedAt).toISOString()).not.toThrow();
  });

  it("omits summary and nextActions when not supplied", () => {
    const env = jsonEnvelope([], { command: "deployments list" });
    expect(env).not.toHaveProperty("summary");
    expect(env).not.toHaveProperty("nextActions");
  });

  it("attaches summary when supplied", () => {
    const env = jsonEnvelope([], {
      command: "tenants list",
      summary: { total: 4, active: 3 },
    });
    expect(env.summary).toEqual({ total: 4, active: 3 });
  });

  it("attaches durationMs only when supplied", () => {
    expect(jsonEnvelope([], { command: "x" }).meta.durationMs).toBeUndefined();
    expect(jsonEnvelope([], { command: "x", durationMs: 42 }).meta.durationMs).toBe(42);
  });

  it("drops an empty nextActions array (stays lean)", () => {
    const env = jsonEnvelope([], { command: "x", nextActions: [] });
    expect(env).not.toHaveProperty("nextActions");
  });

  it("keeps a populated nextActions array", () => {
    const env = jsonEnvelope([], {
      command: "x",
      nextActions: [nextAction("Do it", ["deploy", "Foo"])],
    });
    expect(env.nextActions).toHaveLength(1);
  });
});

describe("nextAction", () => {
  it("prepends the CLI binary to args and derives the display command", () => {
    const a = nextAction("Fix outdated tenants", ["solutions", "drift", "--fix"]);
    expect(a.label).toBe("Fix outdated tenants");
    expect(a.args).toEqual([CLI_BIN, "solutions", "drift", "--fix"]);
    expect(a.args[0]).toBe(CLI_BIN);
    expect(a.command).toBe("pax8-cta solutions drift --fix");
  });

  it("quotes user-supplied values in the display string but keeps args intact", () => {
    const a = nextAction("Check tenant", ["solutions", "drift", "--tenant", "Contoso Corp"]);
    // Display string quotes the space-containing value...
    expect(a.command).toBe('pax8-cta solutions drift --tenant "Contoso Corp"');
    // ...but the argv slot is a single, un-tokenized element.
    expect(a.args).toEqual([CLI_BIN, "solutions", "drift", "--tenant", "Contoso Corp"]);
  });

  it("carries a description only when supplied", () => {
    expect(nextAction("x", ["y"]).description).toBeUndefined();
    expect(nextAction("x", ["y"], "why").description).toBe("why");
  });
});

describe("displayCommandFromArgs", () => {
  it("leaves flag-friendly args unquoted", () => {
    expect(displayCommandFromArgs(["pax8-cta", "deployments", "list", "--offset", "20"])).toBe(
      "pax8-cta deployments list --offset 20"
    );
  });

  it("quotes args containing whitespace and escapes embedded quotes", () => {
    expect(displayCommandFromArgs(["a b"])).toBe('"a b"');
    expect(displayCommandFromArgs(['say "hi"'])).toBe('"say \\"hi\\""');
  });

  it("renders an empty arg as an explicit empty string", () => {
    expect(displayCommandFromArgs([""])).toBe('""');
  });
});

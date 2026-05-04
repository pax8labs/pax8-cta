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

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { output, getDefaultFormat, type Column, type OutputFormat } from "../lib/output.js";
import { ConsoleCapture, stripAnsi, extractJson, runCli } from "./test-utils.js";

// ============================================================================
// Test fixtures
// ============================================================================

interface Fruit {
  name: string;
  color: string;
  count: number;
}

const FRUITS: Fruit[] = [
  { name: "Apple", color: "red", count: 3 },
  { name: "Banana", color: "yellow", count: 5 },
  { name: "Cherry", color: "red", count: 12 },
];

const FRUIT_COLUMNS: Column<Fruit>[] = [
  { key: "name", header: "Name" },
  { key: "color", header: "Color" },
  { key: "count", header: "Count" },
];

// ============================================================================
// getDefaultFormat()
// ============================================================================

describe("getDefaultFormat()", () => {
  afterEach(() => {
    // Reset env var after each test so defaults are restored
    delete process.env.AGENTSYNC_DEFAULT_FORMAT;
  });

  it("returns 'table' when AGENTSYNC_DEFAULT_FORMAT=table", () => {
    process.env.AGENTSYNC_DEFAULT_FORMAT = "table";
    expect(getDefaultFormat()).toBe("table");
  });

  it("returns 'json' when AGENTSYNC_DEFAULT_FORMAT=json", () => {
    process.env.AGENTSYNC_DEFAULT_FORMAT = "json";
    expect(getDefaultFormat()).toBe("json");
  });

  it("falls back to 'table' when env var is unset (safe default for in-process use)", () => {
    delete process.env.AGENTSYNC_DEFAULT_FORMAT;
    expect(getDefaultFormat()).toBe("table");
  });
});

// ============================================================================
// output() — JSON format
// ============================================================================

describe("output() — json format", () => {
  let capture: ConsoleCapture;

  beforeEach(() => {
    capture = new ConsoleCapture();
    capture.start();
  });

  afterEach(() => {
    capture.stop();
  });

  it("prints a valid JSON array", () => {
    output(FRUITS, { format: "json", columns: FRUIT_COLUMNS });

    const logs = capture.getLogs();
    expect(logs).toHaveLength(1);

    const parsed = JSON.parse(logs[0]) as Fruit[];
    expect(parsed).toHaveLength(3);
    expect(parsed[0].name).toBe("Apple");
    expect(parsed[2].count).toBe(12);
  });

  it("serialises all keys (not just column keys)", () => {
    output(FRUITS, { format: "json", columns: FRUIT_COLUMNS });
    const parsed = JSON.parse(capture.getLogs()[0]) as Fruit[];
    expect(parsed[0]).toHaveProperty("color", "red");
  });

  it("handles an empty array", () => {
    output([], { format: "json", columns: FRUIT_COLUMNS });
    const parsed = JSON.parse(capture.getLogs()[0]);
    expect(parsed).toEqual([]);
  });
});

// ============================================================================
// output() — table format
// ============================================================================

describe("output() — table format", () => {
  let capture: ConsoleCapture;

  beforeEach(() => {
    capture = new ConsoleCapture();
    capture.start();
  });

  afterEach(() => {
    capture.stop();
  });

  it("includes column headers", () => {
    output(FRUITS, { format: "table", columns: FRUIT_COLUMNS });
    const tableOutput = stripAnsi(capture.getLogs().join("\n"));
    expect(tableOutput).toContain("Name");
    expect(tableOutput).toContain("Color");
    expect(tableOutput).toContain("Count");
  });

  it("includes row values", () => {
    output(FRUITS, { format: "table", columns: FRUIT_COLUMNS });
    const tableOutput = stripAnsi(capture.getLogs().join("\n"));
    expect(tableOutput).toContain("Apple");
    expect(tableOutput).toContain("Banana");
    expect(tableOutput).toContain("Cherry");
    expect(tableOutput).toContain("yellow");
    expect(tableOutput).toContain("12");
  });

  it("applies column formatters", () => {
    const columnsWithFormatter: Column<Fruit>[] = [
      ...FRUIT_COLUMNS.slice(0, 2),
      {
        key: "count",
        header: "Count",
        format: (v) => `${v} pcs`,
      },
    ];

    output(FRUITS, { format: "table", columns: columnsWithFormatter });
    const tableOutput = stripAnsi(capture.getLogs().join("\n"));
    expect(tableOutput).toContain("3 pcs");
    expect(tableOutput).toContain("12 pcs");
  });

  it("renders null/undefined values as empty string", () => {
    const withNull = [{ name: "Orange", color: null as unknown as string, count: 0 }];
    output(withNull, { format: "table", columns: FRUIT_COLUMNS });
    const tableOutput = capture.getLogs().join("\n");
    // Should not throw; null cell renders as empty
    expect(tableOutput).toContain("Orange");
  });
});

// ============================================================================
// output() — quiet format
// ============================================================================

describe("output() — quiet format", () => {
  let capture: ConsoleCapture;

  beforeEach(() => {
    capture = new ConsoleCapture();
    capture.start();
  });

  afterEach(() => {
    capture.stop();
  });

  it("produces no console output", () => {
    output(FRUITS, { format: "quiet", columns: FRUIT_COLUMNS });
    expect(capture.getLogs()).toHaveLength(0);
    expect(capture.getErrors()).toHaveLength(0);
  });
});

// ============================================================================
// output() — unimplemented formats
// ============================================================================

describe("output() — unimplemented formats", () => {
  it("throws for csv", () => {
    expect(() => output(FRUITS, { format: "csv" as OutputFormat, columns: FRUIT_COLUMNS })).toThrow(
      /csv.*not yet implemented/i
    );
  });

  it("throws for ids-only", () => {
    expect(() =>
      output(FRUITS, { format: "ids-only" as OutputFormat, columns: FRUIT_COLUMNS })
    ).toThrow(/ids-only.*not yet implemented/i);
  });
});

// ============================================================================
// Subprocess test — piped stdout produces JSON (no ANSI/table)
// ============================================================================

describe("subprocess: agentsync tenants list with piped stdout", () => {
  it("outputs JSON when stdout is not a TTY", async () => {
    // runCli() spawns via child_process (stdout is not a TTY by default).
    // getDefaultFormat() detects process.stdout.isTTY === undefined and returns "json".
    const result = await runCli(["tenants", "list"], {
      // DEMO_MODE is already set by runCli; NO_COLOR prevents ANSI in output
      env: { NO_COLOR: "1" },
      timeout: 60000,
    });

    expect(result.exitCode).toBe(0);

    // stdout should parse as JSON (the tenants envelope)
    const json = extractJson<{ tenants: unknown[]; total: number }>(result.stdout);
    expect(json).not.toBeNull();
    expect(Array.isArray(json!.tenants)).toBe(true);
    expect(typeof json!.total).toBe("number");

    // No box-drawing characters (table borders)
    expect(result.stdout).not.toMatch(/[┌┐└┘├┤┬┴┼─│]/);
  }, 60000);
});

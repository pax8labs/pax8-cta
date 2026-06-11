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
 * Test utilities for CLI testing
 *
 * Provides helpers for:
 * - Capturing console output
 * - Running CLI commands as subprocess
 * - Mocking API responses
 * - Parsing CLI table output
 * - Managing test environment
 */

import { vi } from "vitest";
import { createRequire } from "node:module";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PACKAGE_ROOT = resolve(__dirname, "../..");
const CLI_BUILD_TIMEOUT = 120000;
let cliBuildPromise: Promise<void> | null = null;
const require = createRequire(import.meta.url);
const { spawn } = require("node:child_process") as typeof import("node:child_process");
const { existsSync, statSync, readdirSync } = require("node:fs") as typeof import("node:fs");

/**
 * Find the most recent mtime in a directory tree, scoped to source files we
 * actually compile. Returns 0 if the directory does not exist.
 */
function newestMtime(dir: string, extensions: ReadonlyArray<string>): number {
  if (!existsSync(dir)) return 0;
  let newest = 0;
  const stack: string[] = [dir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      // Skip __tests__ — test edits should not trigger an expensive rebuild;
      // the runner re-imports test sources directly through vite-node.
      if (entry.isDirectory()) {
        if (entry.name === "__tests__" || entry.name === "node_modules") continue;
        stack.push(join(current, entry.name));
        continue;
      }
      if (!extensions.some((ext) => entry.name.endsWith(ext))) continue;
      try {
        const stat = statSync(join(current, entry.name));
        if (stat.mtimeMs > newest) newest = stat.mtimeMs;
      } catch {
        // ignore unreadable entries
      }
    }
  }
  return newest;
}

/**
 * The CLI subprocess tests exercise `dist/index.js`, so any change to a
 * compiled source file (`src/`) must be reflected there before tests run. A
 * stale `dist/` produced before recent source changes silently invalidates
 * subprocess assertions (see issue #364). We rebuild when either:
 *   1. `dist/index.js` is missing entirely, or
 *   2. any `src/**` source file is newer than `dist/index.js`.
 *
 * Rebuilds also include `packages/core` because the CLI imports compiled core
 * artifacts at runtime.
 */
async function ensureCliBuilt(): Promise<void> {
  const cliDistPath = resolve(CLI_PACKAGE_ROOT, "dist/index.js");
  const cliSrcDir = resolve(CLI_PACKAGE_ROOT, "src");
  const coreSrcDir = resolve(CLI_PACKAGE_ROOT, "../core/src");

  let needsBuild = !existsSync(cliDistPath);
  if (!needsBuild) {
    const distMtime = statSync(cliDistPath).mtimeMs;
    const newestSrc = Math.max(
      newestMtime(cliSrcDir, [".ts", ".tsx"]),
      newestMtime(coreSrcDir, [".ts", ".tsx"])
    );
    if (newestSrc > distMtime) {
      needsBuild = true;
    }
  }

  if (!needsBuild) {
    return;
  }

  if (!cliBuildPromise) {
    cliBuildPromise = new Promise<void>((resolveBuild, rejectBuild) => {
      const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
      // Build core first (CLI imports compiled artifacts from `@pax8/cta-core`),
      // then build CLI. Using `-r build` from the workspace root would do both,
      // but we drive them sequentially here so an error in core surfaces clearly.
      const workspaceRoot = resolve(CLI_PACKAGE_ROOT, "../..");
      const proc = spawn(
        pnpmCommand,
        ["-r", "--filter", "@pax8/cta-core", "--filter", "@pax8/cta", "build"],
        {
          cwd: workspaceRoot,
          env: process.env,
        }
      );

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      const timeoutId = setTimeout(() => {
        proc.kill(process.platform === "win32" ? "SIGKILL" : "SIGTERM");
        rejectBuild(new Error(`CLI build timed out after ${CLI_BUILD_TIMEOUT}ms`));
      }, CLI_BUILD_TIMEOUT);

      proc.on("close", (code) => {
        clearTimeout(timeoutId);
        if (code === 0) {
          resolveBuild();
          return;
        }
        rejectBuild(
          new Error(
            `CLI build failed with exit code ${code ?? 1}:\n` +
              `Stdout: ${stdout}\n` +
              `Stderr: ${stderr}`
          )
        );
      });

      proc.on("error", (err) => {
        clearTimeout(timeoutId);
        rejectBuild(err);
      });
    }).finally(() => {
      cliBuildPromise = null;
    });
  }

  await cliBuildPromise;
}

/**
 * Capture console output during test execution
 */
export class ConsoleCapture {
  private originalLog: typeof console.log;
  private originalError: typeof console.error;
  private logs: string[] = [];
  private errors: string[] = [];

  constructor() {
    this.originalLog = console.log;
    this.originalError = console.error;
  }

  start() {
    this.logs = [];
    this.errors = [];

    console.log = vi.fn((...args: any[]) => {
      this.logs.push(args.map((a) => String(a)).join(" "));
    });

    console.error = vi.fn((...args: any[]) => {
      this.errors.push(args.map((a) => String(a)).join(" "));
    });
  }

  stop() {
    console.log = this.originalLog;
    console.error = this.originalError;
  }

  getLogs(): string[] {
    return this.logs;
  }

  getErrors(): string[] {
    return this.errors;
  }

  getAllOutput(): string {
    return [...this.logs, ...this.errors].join("\n");
  }

  clear() {
    this.logs = [];
    this.errors = [];
  }
}

/**
 * Mock process.exit to prevent tests from actually exiting
 */
export function mockProcessExit() {
  const exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: string | number | null) => {
    throw new Error(`process.exit(${code})`);
  }) as any;

  return exitSpy;
}

/**
 * Mock environment variables
 */
export function mockEnv(vars: Record<string, string>) {
  const original = { ...process.env };

  Object.assign(process.env, vars);

  return () => {
    process.env = original;
  };
}

/**
 * Strip ANSI color codes from string
 */
export function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*[JKmsu]/g, "");
}

/**
 * Check if string contains text (ignoring ANSI codes)
 */
export function containsText(output: string, text: string): boolean {
  return stripAnsi(output).includes(text);
}

/**
 * Mock ora spinner to avoid animation in tests
 */
export function mockSpinner(): Record<string, unknown> {
  return {
    start: vi.fn(function (this: any, text?: string) {
      if (text) this.text = text;
      return this;
    }),
    succeed: vi.fn(function (this: any, text?: string) {
      if (text) console.log(text);
      return this;
    }),
    fail: vi.fn(function (this: any, text?: string) {
      if (text) console.error(text);
      return this;
    }),
    warn: vi.fn(function (this: any, text?: string) {
      if (text) console.log(text);
      return this;
    }),
    info: vi.fn(function (this: any, text?: string) {
      if (text) console.log(text);
      return this;
    }),
    stop: vi.fn().mockReturnThis(),
    text: "",
  };
}

// ============================================================================
// CLI Runner - Execute CLI as subprocess for integration tests
// ============================================================================

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  /** Combined stdout + stderr */
  output: string;
  /** Duration in milliseconds */
  duration: number;
}

export interface CliRunnerOptions {
  /** Environment variables to set */
  env?: Record<string, string>;
  /** Working directory */
  cwd?: string;
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Input to send to stdin */
  stdin?: string;
}

/**
 * Run the CLI as a subprocess and capture output
 *
 * @example
 * ```ts
 * const result = await runCli(['deployments', 'list', '--status', 'failed']);
 * expect(result.exitCode).toBe(0);
 * expect(result.stdout).toContain('DEPLOYMENT ID');
 * ```
 */
export async function runCli(args: string[], options: CliRunnerOptions = {}): Promise<CliResult> {
  const { env = {}, cwd = CLI_PACKAGE_ROOT, timeout = 30000, stdin } = options;

  const startTime = Date.now();
  await ensureCliBuilt();
  const cliPath = resolve(CLI_PACKAGE_ROOT, "dist/index.js");

  // Strip PAX8_CTA_DEFAULT_FORMAT from the inherited env. The vitest worker
  // mutates this in-process for `output.test.ts`'s `getDefaultFormat()` tests
  // (and vitest's default `threads` pool shares process.env across files), so
  // a concurrent subprocess can inherit a contaminated "table" or "json"
  // instead of deriving its own from `process.stdout.isTTY`. The CLI's entry
  // point sets the var defensively based on isTTY when it's unset — stripping
  // here lets that detection run cleanly. Tests that need an explicit format
  // still pass it via the `env` option, which overrides this default below.
  const parentEnv: NodeJS.ProcessEnv = { ...process.env };
  delete parentEnv.PAX8_CTA_DEFAULT_FORMAT;

  return new Promise((resolvePromise, reject) => {
    const proc = spawn(process.execPath, [cliPath, ...args], {
      cwd,
      env: {
        ...parentEnv,
        DEMO_MODE: "true", // Default to demo mode in tests
        NO_COLOR: "1", // Disable colors for easier parsing
        ...env,
      },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    if (stdin) {
      proc.stdin.write(stdin);
      proc.stdin.end();
    }

    const timeoutId = setTimeout(() => {
      proc.kill(process.platform === "win32" ? "SIGKILL" : "SIGTERM");
      reject(new Error(`CLI command timed out after ${timeout}ms`));
    }, timeout);

    proc.on("close", (code) => {
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;

      resolvePromise({
        exitCode: code ?? 1,
        stdout,
        stderr,
        output: stdout + stderr,
        duration,
      });
    });

    proc.on("error", (err) => {
      clearTimeout(timeoutId);
      reject(err);
    });
  });
}

/**
 * Run CLI and expect success (exit code 0)
 */
export async function runCliExpectSuccess(
  args: string[],
  options?: CliRunnerOptions
): Promise<CliResult> {
  const result = await runCli(args, options);
  if (result.exitCode !== 0) {
    throw new Error(
      `CLI command failed with exit code ${result.exitCode}:\n` +
        `Args: ${args.join(" ")}\n` +
        `Stdout: ${result.stdout}\n` +
        `Stderr: ${result.stderr}`
    );
  }
  return result;
}

/**
 * Run CLI and expect failure (non-zero exit code)
 */
export async function runCliExpectFailure(
  args: string[],
  options?: CliRunnerOptions
): Promise<CliResult> {
  const result = await runCli(args, options);
  if (result.exitCode === 0) {
    throw new Error(
      `CLI command unexpectedly succeeded:\n` +
        `Args: ${args.join(" ")}\n` +
        `Stdout: ${result.stdout}`
    );
  }
  return result;
}

// ============================================================================
// Table Parsing - Parse CLI table output for assertions
// ============================================================================

export interface ParsedTable {
  headers: string[];
  rows: Record<string, string>[];
  rawRows: string[][];
}

/**
 * Parse CLI table output (cli-table3 format) into structured data
 *
 * @example
 * ```ts
 * const result = await runCli(['tenants', 'list']);
 * const table = parseTable(result.stdout);
 * expect(table.headers).toContain('TENANT');
 * expect(table.rows[0]['TENANT']).toBe('Contoso Corporation');
 * ```
 */
export function parseTable(output: string): ParsedTable {
  const lines = stripAnsi(output)
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .filter((line) => !line.match(/^[┌└├─┬┴┼┐┘┤]+$/)); // Filter box-drawing borders

  const headers: string[] = [];
  const rawRows: string[][] = [];

  for (const line of lines) {
    const separator = line.includes("│") ? "│" : line.includes("|") ? "|" : null;
    if (!separator) continue;

    const cells = line
      .split(separator)
      .map((cell) => cell.trim())
      .filter((cell) => cell !== "");

    // Skip boxed notices/log lines that are not tabular rows.
    if (cells.length < 2) continue;

    if (headers.length === 0) {
      // First row with data is headers.
      headers.push(...cells);
    } else if (cells.length === headers.length) {
      rawRows.push(cells);
    }
  }

  // Convert to records
  const rows = rawRows.map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, i) => {
      record[header] = row[i] || "";
    });
    return record;
  });

  return { headers, rows, rawRows };
}

/**
 * Extract a specific column from parsed table
 */
export function getColumn(table: ParsedTable, columnName: string): string[] {
  return table.rows.map((row) => row[columnName] || "");
}

/**
 * Find row by column value
 */
export function findRow(
  table: ParsedTable,
  columnName: string,
  value: string
): Record<string, string> | undefined {
  return table.rows.find((row) => row[columnName]?.toLowerCase().includes(value.toLowerCase()));
}

// ============================================================================
// Mock API Helper - For mocking HTTP responses
// ============================================================================

export interface MockApiResponse {
  status?: number;
  data?: unknown;
  error?: string;
}

/**
 * Create a mock fetch function for API testing
 *
 * @example
 * ```ts
 * const mockFetch = createMockFetch({
 *   '/api/deployments': { data: mockDeployments },
 *   '/api/tenants': { data: mockTenants },
 * });
 *
 * vi.stubGlobal('fetch', mockFetch);
 * ```
 */
export function createMockFetch(responses: Record<string, MockApiResponse>): typeof fetch {
  return vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const path = new URL(url, "http://localhost").pathname;

    const mockResponse = responses[path];

    if (!mockResponse) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (mockResponse.error) {
      return new Response(JSON.stringify({ error: mockResponse.error }), {
        status: mockResponse.status || 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(mockResponse.data), {
      status: mockResponse.status || 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}

// ============================================================================
// JSON Output Helpers
// ============================================================================

/**
 * Extract and parse JSON from CLI output
 *
 * Handles cases where JSON is mixed with other output
 */
export function extractJson<T = unknown>(output: string): T | null {
  const cleaned = stripAnsi(output);

  // Try to find JSON array or object
  const jsonMatch = cleaned.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]) as T;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Assert that output is valid JSON and return parsed value
 */
export function expectJson<T = unknown>(output: string): T {
  const json = extractJson<T>(output);
  if (json === null) {
    throw new Error(`Expected valid JSON in output:\n${output}`);
  }
  return json;
}

// ============================================================================
// Test Data Helpers
// ============================================================================

/**
 * Generate a unique test ID
 */
export function testId(prefix = "test"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const { timeout = 5000, interval = 100 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Condition not met within ${timeout}ms`);
}

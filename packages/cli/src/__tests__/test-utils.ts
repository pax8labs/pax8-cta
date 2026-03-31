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
import { spawn } from "child_process";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_BUILD_TIMEOUT = 120000;
let cliBuildPromise: Promise<void> | null = null;

async function ensureCliBuilt(cwd: string): Promise<void> {
  const cliDistPath = resolve(cwd, "dist/index.js");

  if (existsSync(cliDistPath)) {
    return;
  }

  if (!cliBuildPromise) {
    cliBuildPromise = new Promise<void>((resolveBuild, rejectBuild) => {
      const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
      const proc = spawn(pnpmCommand, ["build"], {
        cwd,
        env: process.env,
      });

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
  const { env = {}, cwd = resolve(__dirname, "../.."), timeout = 30000, stdin } = options;

  const startTime = Date.now();
  await ensureCliBuilt(cwd);
  const cliPath = resolve(cwd, "dist/index.js");

  return new Promise((resolvePromise, reject) => {
    const proc = spawn(process.execPath, [cliPath, ...args], {
      cwd,
      env: {
        ...process.env,
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

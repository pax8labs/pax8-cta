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

import chalk from "chalk";
import { formatError, printError, AgentSyncError } from "./error-handler.js";

/**
 * Base CLI error with exit code.
 * Exit code 1 = runtime error (config not found, network failure, etc.)
 */
export class CliError extends Error {
  constructor(
    message: string,
    public exitCode: number = 1
  ) {
    super(message);
    this.name = "CliError";
  }
}

/**
 * Usage error — invalid options, missing required args, etc.
 * Exit code 2.
 */
export class UsageError extends CliError {
  constructor(message: string) {
    super(message, 2);
    this.name = "UsageError";
  }
}

/**
 * Spinner-like interface for cleanup. Matches the ora spinner API subset we use.
 */
interface SpinnerLike {
  fail: (text?: string) => void;
  isSpinning?: boolean;
}

/**
 * Detect whether JSON output mode is active.
 *
 * Two signals (OR'd):
 *   1. `--json` is present anywhere in process.argv (simple substring check).
 *   2. stdout is not a TTY (piped/redirected).
 *
 * Exported so that issue #345 (proper Commander-driven --json flag) can replace
 * this with a single authoritative source of truth once that flag lands.
 */
export function isJsonOutputMode(): boolean {
  return process.argv.includes("--json") || !process.stdout.isTTY;
}

/**
 * Build the JSON error payload from any error value.
 *
 * Schema:
 * ```json
 * {
 *   "error": {
 *     "code": "...",
 *     "message": "...",
 *     "causes": [...],
 *     "recovery": [...],
 *     "context": { ... }
 *   }
 * }
 * ```
 *
 * Plain `Error` / unknown become `{ error: { message } }`.
 * Stack traces are never included.
 */
function buildJsonError(error: unknown): Record<string, unknown> {
  // ZodError — duck-typed so we don't need to import zod directly in the CLI package.
  // ZodError instances always have an `errors` array of `{ path, message }` objects.
  if (error instanceof Error && error.name === "ZodError" && Array.isArray((error as any).errors)) {
    const zodErrors = (error as any).errors as Array<{
      path: (string | number)[];
      message: string;
    }>;
    return {
      error: {
        code: "ERROR_VALIDATION",
        message: "Validation failed",
        causes: zodErrors.map((e) => `${e.path.join(".")}: ${e.message}`),
        recovery: ["Check the input values and retry"],
      },
    };
  }

  // AgentSyncError (CLI structured error) — emit all fields directly
  if (error instanceof AgentSyncError) {
    const payload: Record<string, unknown> = {
      code: error.code,
      message: error.message,
      causes: error.causes,
      recovery: error.recovery,
    };
    if (error.context && Object.keys(error.context).length > 0) {
      payload.context = error.context;
    }
    return { error: payload };
  }

  // CliError / UsageError — already actionable (message authored by the
  // caller). Emit the message verbatim instead of running it through the
  // regex formatter, which can mis-classify "X not found" messages as a
  // generic ERROR_CONFIG_NOT_FOUND. (Issue #360.)
  if (error instanceof CliError) {
    return {
      error: {
        code: error.exitCode === 2 ? "ERROR_USAGE" : "ERROR_CLI",
        message: error.message,
      },
    };
  }

  // For any other error, run through the structured formatter and emit result
  try {
    const structured = formatError(error);
    const payload: Record<string, unknown> = {
      code: structured.code,
      message: structured.message,
      causes: structured.causes,
      recovery: structured.recovery,
    };
    if (structured.context && Object.keys(structured.context).length > 0) {
      payload.context = structured.context;
    }
    return { error: payload };
  } catch {
    // Ultimate fallback — plain Error or unknown
    const message = error instanceof Error ? error.message : String(error);
    return { error: { message } };
  }
}

/**
 * Standard error handler for CLI commands.
 *
 * - Stops the spinner with a fail message
 * - When JSON mode is active (--json flag or piped stdout), emits a single JSON
 *   object to stderr with structured `code`, `message`, `causes`, and `recovery`
 *   fields — suitable for LLM-agent consumption.
 * - Otherwise, uses the human-formatted handler (formatError/printError).
 * - Exits with the appropriate code (1=runtime, 2=usage).
 */
export function handleCommandError(
  error: unknown,
  spinner?: SpinnerLike | null,
  failMessage?: string
): never {
  // Stop the spinner before any output
  if (spinner) {
    spinner.fail(failMessage ? chalk.red(failMessage) : chalk.red("Command failed"));
  }

  if (isJsonOutputMode()) {
    // JSON mode: emit structured payload to stderr, no human-formatted text
    const payload = buildJsonError(error);
    process.stderr.write(JSON.stringify(payload) + "\n");
    process.exit(error instanceof CliError ? error.exitCode : 1);
  }

  // Human-readable mode (original behaviour preserved exactly)
  if (error instanceof CliError) {
    if (!spinner && failMessage) {
      console.error(chalk.red(failMessage));
    }
    // CliError messages are already actionable — print directly
    console.error(chalk.red(`\nError: ${error.message}`));
    process.exit(error.exitCode);
  }

  if (!spinner && failMessage) {
    console.error(chalk.red(failMessage));
  }

  const structured = formatError(error);
  printError(structured);
  process.exit(1);
}

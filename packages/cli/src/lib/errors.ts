/**
 * Copyright 2024 Pax8 Labs
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
import { formatError, printError } from "./error-handler.js";

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
 * Standard error handler for CLI commands.
 *
 * - Stops the spinner with a fail message
 * - For runtime errors, uses the structured error handler (formatError/printError)
 *   to provide actionable recovery guidance
 * - For usage errors, prints a concise message
 * - Exits with the appropriate code (1=runtime, 2=usage)
 */
export function handleCommandError(
  error: unknown,
  spinner?: SpinnerLike | null,
  failMessage?: string
): never {
  // Determine exit code and message
  if (error instanceof CliError) {
    if (spinner) {
      spinner.fail(chalk.red(failMessage || error.message));
    } else if (failMessage) {
      console.error(chalk.red(failMessage));
    }

    // CliError messages are already actionable — print directly
    console.error(chalk.red(`\nError: ${error.message}`));

    process.exit(error.exitCode);
  }

  // Unknown/unexpected errors: use structured error handler
  if (spinner) {
    spinner.fail(chalk.red(failMessage || "Command failed"));
  } else if (failMessage) {
    console.error(chalk.red(failMessage));
  }

  const structured = formatError(error);
  printError(structured);
  process.exit(1);
}

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
import type { Command } from "commander";
import { question, closeInput } from "./input.js";
import { setReplMode } from "./spinner.js";

class ReplExitIntercepted extends Error {
  constructor(public code: number) {
    super(`process.exit(${code}) intercepted`);
  }
}

export async function startRepl(createProgram: () => Command): Promise<void> {
  setReplMode(true);
  console.log();
  console.log(chalk.gray("Interactive mode - Type 'help' for commands or 'exit' to quit"));
  console.log();

  while (true) {
    const line = await question(chalk.cyan("AgentSync> "));
    const input = line.trim();

    if (!input) {
      continue;
    }

    if (input === "exit" || input === "quit") {
      console.log(chalk.gray("Goodbye!"));
      closeInput();
      break;
    }

    try {
      // Parse the input as commander arguments
      const args = parseCommandLine(input);

      // Tolerate shell-style invocations: muscle memory from running
      // `agentsync foo bar` outside the REPL shouldn't surface as an error.
      if (args[0] === "agentsync") {
        args.shift();
      }

      // Create a fresh program instance for this command
      const program = createProgram();

      // Subcommand instances are module-level singletons, so Commander's
      // parsed option/arg state from a previous REPL iteration leaks into
      // the next parse. Clear it before each command runs.
      resetCommandState(program);

      // Prevent commander from calling process.exit() on help/errors.
      // exitOverride must be set on all subcommands too.
      program.exitOverride();
      for (const cmd of program.commands) {
        cmd.exitOverride();
        for (const sub of cmd.commands) {
          sub.exitOverride();
        }
      }

      // Intercept process.exit() so command error handlers don't kill the REPL
      const originalExit = process.exit;
      process.exit = ((code?: number) => {
        throw new ReplExitIntercepted(code ?? 0);
      }) as never;

      try {
        await program.parseAsync(args, { from: "user" });
      } finally {
        process.exit = originalExit;
      }
    } catch (error) {
      if (error instanceof ReplExitIntercepted) {
        // Command called process.exit() — already printed its own error, just continue
        console.log();
        continue;
      }
      if (error instanceof Error && "code" in error) {
        const commanderError = error as { code: string; message: string };
        if (
          commanderError.code === "commander.unknownCommand" ||
          commanderError.code === "commander.unknownOption"
        ) {
          console.error(chalk.red(`Unknown command: ${input}`));
          console.log(chalk.gray("Type 'help' to see available commands"));
        } else if (
          commanderError.code === "commander.help" ||
          commanderError.code === "commander.helpDisplayed"
        ) {
          // Help was displayed, do nothing
        } else if (commanderError.code === "commander.version") {
          // Version was displayed, do nothing
        } else {
          console.error(chalk.red(commanderError.message));
        }
      } else {
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      }
    }

    console.log();
  }
}

function resetCommandState(cmd: Command): void {
  // Commander stores parsed values on the Command instance; with shared
  // subcommand singletons, those values persist across parseAsync calls.
  // Cast through unknown to reach the private fields without `any`.
  const internal = cmd as unknown as {
    _optionValues: Record<string, unknown>;
    processedArgs: unknown[];
    options: Array<{ attributeName: () => string; defaultValue?: unknown }>;
  };
  internal._optionValues = {};
  internal.processedArgs = [];
  // Re-apply Commander option defaults. Wiping _optionValues drops not just
  // user-set values but also the defaults that were applied at .option() time,
  // so options like `-c, --config <path>` arrive as undefined inside actions
  // unless we restore them here.
  for (const opt of internal.options) {
    if (opt.defaultValue !== undefined) {
      internal._optionValues[opt.attributeName()] = opt.defaultValue;
    }
  }
  for (const sub of cmd.commands) {
    resetCommandState(sub);
  }
}

export function parseCommandLine(input: string): string[] {
  const args: string[] = [];
  let current = "";
  let inQuotes = false;
  let quoteChar = "";

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if ((char === '"' || char === "'") && !inQuotes) {
      inQuotes = true;
      quoteChar = char;
    } else if (char === quoteChar && inQuotes) {
      inQuotes = false;
      quoteChar = "";
    } else if (char === " " && !inQuotes) {
      if (current) {
        args.push(current);
        current = "";
      }
    } else {
      current += char;
    }
  }

  if (current) {
    args.push(current);
  }

  return args;
}

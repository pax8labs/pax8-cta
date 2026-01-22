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

import { createInterface } from "node:readline/promises";
import chalk from "chalk";
import type { Command } from "commander";

export async function startRepl(createProgram: () => Command): Promise<void> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.cyan("AgentSync> "),
  });

  console.log();
  console.log(chalk.gray("Interactive mode - Type 'help' for commands or 'exit' to quit"));
  console.log();

  rl.prompt();

  for await (const line of rl) {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      continue;
    }

    if (input === "exit" || input === "quit") {
      console.log(chalk.gray("Goodbye!"));
      rl.close();
      break;
    }

    try {
      // Parse the input as commander arguments
      const args = parseCommandLine(input);

      // Create a fresh program instance for this command
      const program = createProgram();

      // Capture output instead of exiting on error
      program.exitOverride();

      await program.parseAsync(args, { from: "user" });
    } catch (error) {
      if (error instanceof Error && "code" in error) {
        const commanderError = error as { code: string; message: string };
        if (commanderError.code === "commander.unknownCommand") {
          console.error(chalk.red(`Unknown command: ${input}`));
          console.log(chalk.gray("Type 'help' to see available commands"));
        } else if (commanderError.code === "commander.help") {
          // Help was displayed, do nothing
        } else {
          console.error(chalk.red(commanderError.message));
        }
      } else {
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      }
    }

    console.log();
    rl.prompt();
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

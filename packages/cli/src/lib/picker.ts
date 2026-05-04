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
 * Shared interactive picker helpers.
 *
 * When a CLI command needs an arg the user didn't provide, we want to drop
 * into a small numbered picker — but ONLY when we know we're talking to a
 * real human in a terminal. Scripts, pipelines, and `--json` / `--quiet`
 * callers must never hang waiting on stdin.
 *
 * These helpers consolidate the TTY/flag check and the prompt-rendering
 * logic that started life inline in `analyze.ts`.
 */

import chalk from "chalk";
import { question } from "./input.js";
import { isQuietMode } from "./spinner.js";

export interface InteractivePromptOptions {
  /** Caller passed `--json`. */
  json?: boolean;
  /** Caller passed `--quiet`. */
  quiet?: boolean;
}

/**
 * True when we can safely prompt the user for input.
 *
 * Returns false when:
 *   - `--json` is set (we'd corrupt the JSON output)
 *   - `--quiet` is set (or `AGENTSYNC_QUIET` env)
 *   - stdout or stdin isn't a TTY (piped, redirected, CI, etc.)
 */
export function isInteractivePrompt(opts: InteractivePromptOptions = {}): boolean {
  if (opts.json) return false;
  if (opts.quiet) return false;
  if (isQuietMode()) return false;
  if (!process.stdout.isTTY) return false;
  if (!process.stdin.isTTY) return false;
  return true;
}

export interface PickFromListOptions<T> {
  /** Header line printed before the numbered list (e.g. "Pick a tenant:"). */
  prompt: string;
  /** How to render each item; defaults to `String(item)`. */
  label?: (item: T) => string;
  /** Optional secondary hint shown in gray after the label (e.g. tags). */
  hint?: (item: T) => string | undefined;
  /**
   * Whether to prompt at all. Defaults to `isInteractivePrompt()` —
   * callers who already have an opts bag should pass that bag in via
   * `isInteractivePrompt(opts)` so `--json`/`--quiet` are respected.
   */
  isInteractive?: boolean;
  /** Label for the "skip" option (item 0). Defaults to "skip". */
  skipLabel?: string;
}

/**
 * Render a numbered list and return the chosen item.
 *
 * Returns `undefined` for any non-selection: empty list, non-interactive
 * environment, user picked `0`, hit Enter without typing, or typed
 * something that isn't a valid number in range.
 *
 * If the list has exactly one item we still prompt — but as a y/n confirm,
 * because picking #1 from a list of 1 is just confirming a default.
 */
export async function pickFromList<T>(
  items: T[],
  opts: PickFromListOptions<T>
): Promise<T | undefined> {
  if (items.length === 0) return undefined;

  const interactive = opts.isInteractive ?? isInteractivePrompt();
  if (!interactive) return undefined;

  const labelOf = opts.label ?? ((item: T) => String(item));
  const hintOf = opts.hint ?? (() => undefined);

  if (items.length === 1) {
    const only = items[0];
    const hint = hintOf(only);
    const suffix = hint ? chalk.gray(`  [${hint}]`) : "";
    const ok = await confirm(`${opts.prompt} ${chalk.bold(labelOf(only))}${suffix}? [y/N] `);
    return ok ? only : undefined;
  }

  console.log(chalk.cyan(opts.prompt));
  items.forEach((item, i) => {
    const hint = hintOf(item);
    const hintText = hint ? chalk.gray(`  [${hint}]`) : "";
    console.log(`  ${i + 1}) ${labelOf(item)}${hintText}`);
  });
  console.log(chalk.gray(`  0) ${opts.skipLabel ?? "skip"}`));

  const answer = await question(chalk.cyan("> "));
  const choice = parseInt(answer.trim(), 10);
  if (!Number.isInteger(choice) || choice < 1 || choice > items.length) {
    return undefined;
  }
  return items[choice - 1];
}

/**
 * Yes/no prompt. Returns `true` only for `y` or `yes` (case-insensitive).
 * Anything else — including blank input — is `false`, so the safe default
 * is always "no".
 */
export async function confirm(prompt: string): Promise<boolean> {
  const answer = await question(prompt);
  return /^(y|yes)$/i.test(answer.trim());
}

/**
 * Quote a value for shell-friendly display (e.g. `running: deploy ...`).
 * Wraps in double quotes when the value contains whitespace.
 */
export function quoteIfNeeded(value: string): string {
  return /\s/.test(value) ? `"${value}"` : value;
}

/**
 * Print "running: <command>" so the user learns the flag form they could
 * have typed directly. Caller is responsible for actually running the
 * command — this just echoes it.
 */
export function printRunningCommand(parts: string[]): void {
  const formatted = parts.map(quoteIfNeeded).join(" ");
  console.log(chalk.gray(`\nrunning: ${formatted}\n`));
}

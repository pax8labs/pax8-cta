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
 * Shared wiring for the `command_executed` event.
 *
 * Both entry points — one-shot `pax8-cta <cmd>` invocations (index.ts) and
 * interactive REPL sessions (repl.ts) — register the same hook through here.
 * The REPL previously registered nothing at all, so an entire usage mode of
 * the CLI emitted zero telemetry.
 */

import type { Command } from "commander";
import { trackCommand } from "./telemetry.js";
import { isDemoModeEnabled } from "../commands/demo.js";

/**
 * Split a Commander leaf command into the `{ command, subcommand }` pair
 * `@pax8/cli` uses: `command` is the root verb and `subcommand` is the full
 * dotted path.
 *
 *   pax8-cta deploy ...     → { command: "deploy", subcommand: undefined }
 *   pax8-cta tenants list   → { command: "tenants", subcommand: "tenants.list" }
 *
 * Commander's postAction callback receives `actionCommand`, the leaf command
 * that actually ran; `thisCommand` is always the program the hook was
 * registered on and would report "pax8-cta" with no subcommand for everything.
 */
export function describeCommand(
  program: Command,
  actionCommand: Command
): { command: string; subcommand?: string } {
  const path: string[] = [];
  for (let cmd: Command | null = actionCommand; cmd && cmd !== program; cmd = cmd.parent) {
    path.unshift(cmd.name());
  }
  const command = path[0] ?? actionCommand.name();
  return {
    command,
    subcommand: path.length > 1 ? path.join(".") : undefined,
  };
}

/**
 * Best-effort machine-readable failure code for a thrown error, using the
 * `ERROR_*` vocabulary CTA already emits in its `--json` error envelope
 * (see lib/errors.ts) so telemetry and agent-facing output agree.
 */
export function errorCodeFor(error: unknown): string {
  if (error && typeof error === "object") {
    const code = (error as { code?: unknown }).code;
    // Commander tags its own failures as "commander.unknownCommand" etc.
    if (typeof code === "string" && code.startsWith("commander.")) {
      return `ERROR_USAGE_${code.slice("commander.".length).toUpperCase()}`;
    }
    if (typeof code === "string" && code.startsWith("ERROR_")) return code;
    if ((error as { name?: unknown }).name === "ZodError") return "ERROR_VALIDATION";
    const exitCode = (error as { exitCode?: unknown }).exitCode;
    if (exitCode === 2) return "ERROR_USAGE";
    if (typeof exitCode === "number") return "ERROR_CLI";
  }
  return "ERROR_INTERNAL";
}

/**
 * Register the `command_executed` success hook on a program instance.
 *
 * `startedAt` is a callback rather than a value because the REPL reuses one
 * registration site across many invocations and needs a per-command clock.
 */
export function attachCommandTelemetry(program: Command, startedAt: () => number): void {
  program.hook("postAction", (_thisCommand, actionCommand) => {
    const { command, subcommand } = describeCommand(program, actionCommand);

    trackCommand({
      command,
      subcommand,
      // Flag names only, never their values — see the privacy note in telemetry.ts.
      flags: Object.keys(actionCommand.opts()),
      success: true,
      durationMs: Date.now() - startedAt(),
      demoMode: isDemoModeEnabled(),
    });
  });
}

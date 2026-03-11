/**
 * Shared readline management.
 *
 * Node.js doesn't handle multiple readline interfaces on process.stdin well.
 * This module provides a single, reusable readline so the REPL and
 * interactive commands (like init) never fight over stdin.
 */

import { createInterface, type Interface as RlInterface } from "node:readline/promises";

let rl: RlInterface | null = null;
// A timer that keeps the event loop alive while readline exists.
// Necessary because libraries (ora, dynamic imports) can unref/pause
// stdin between prompts, letting Node.js exit prematurely.
let keepAlive: ReturnType<typeof setInterval> | null = null;

function get(): RlInterface {
  if (!rl) {
    rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    keepAlive = setInterval(() => {}, 2_147_483_647); // max safe interval
    rl.once("close", () => {
      rl = null;
      if (keepAlive) {
        clearInterval(keepAlive);
        keepAlive = null;
      }
    });
  }
  return rl;
}

/**
 * Prompt the user for input. Safe to call from anywhere —
 * reuses a single readline interface on process.stdin.
 */
export async function question(prompt: string): Promise<string> {
  return get().question(prompt);
}

/**
 * Close the shared readline (e.g. on exit).
 */
export function closeInput(): void {
  if (rl) {
    rl.close();
    rl = null;
  }
  if (keepAlive) {
    clearInterval(keepAlive);
    keepAlive = null;
  }
}

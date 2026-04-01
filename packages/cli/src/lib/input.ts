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
 * Prompt for sensitive input without echoing typed characters.
 * Falls back to standard question() in non-interactive environments.
 */
export async function questionHidden(prompt: string): Promise<string> {
  if (
    !process.stdin.isTTY ||
    typeof (process.stdin as NodeJS.ReadStream).setRawMode !== "function"
  ) {
    return question(prompt);
  }

  // If readline is currently active, close it before raw hidden input.
  // Otherwise readline listeners can still echo typed characters.
  if (rl) {
    closeInput();
  }

  const stdin = process.stdin as NodeJS.ReadStream;
  const stdout = process.stdout;
  const wasRaw = !!stdin.isRaw;

  return new Promise((resolve, reject) => {
    let value = "";

    const cleanup = () => {
      stdin.off("data", onData);
      if (!wasRaw) {
        stdin.setRawMode(false);
      }
      stdin.pause();
    };

    const onData = (chunk: Buffer) => {
      const input = chunk.toString("utf8");
      if (input.startsWith("\u001b")) {
        return; // Ignore escape sequences (arrow keys, etc.)
      }

      for (const char of input) {
        // Enter/Return
        if (char === "\r" || char === "\n") {
          stdout.write("\n");
          cleanup();
          resolve(value);
          return;
        }

        // Ctrl+C
        if (char === "\u0003") {
          cleanup();
          reject(new Error("Input cancelled"));
          return;
        }

        // Backspace/Delete
        if (char === "\u007f" || char === "\b" || char === "\x08") {
          if (value.length > 0) {
            value = value.slice(0, -1);
          }
          continue;
        }

        value += char;
      }
    };

    try {
      stdout.write(prompt);
      if (!wasRaw) {
        stdin.setRawMode(true);
      }
      stdin.resume();
      stdin.on("data", onData);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
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

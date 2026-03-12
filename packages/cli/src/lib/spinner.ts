/**
 * REPL-safe spinner wrapper.
 *
 * ora's spinner animation corrupts readline's terminal state,
 * breaking subsequent prompts in the REPL. This module provides
 * the same API but falls back to plain console.log when stdin
 * is being shared with readline (i.e. in REPL / interactive mode).
 */

import ora from "ora";

/** True when running inside the interactive REPL. */
let replMode = false;

export function setReplMode(enabled: boolean): void {
  replMode = enabled;
}

export interface Spinner {
  text: string;
  start(text?: string): Spinner;
  stop(): Spinner;
  succeed(text?: string): Spinner;
  fail(text?: string): Spinner;
  warn(text?: string): Spinner;
  info(text?: string): Spinner;
}

function createPlainSpinner(text?: string): Spinner {
  let currentText = text ?? "";
  const self: Spinner = {
    get text() {
      return currentText;
    },
    set text(t: string) {
      currentText = t;
    },
    start(t?: string) {
      if (t) currentText = t;
      return self;
    },
    stop() {
      return self;
    },
    succeed(t?: string) {
      console.error(`✔ ${t ?? currentText}`);
      return self;
    },
    fail(t?: string) {
      console.error(`✖ ${t ?? currentText}`);
      return self;
    },
    warn(t?: string) {
      console.error(`⚠ ${t ?? currentText}`);
      return self;
    },
    info(t?: string) {
      console.error(`ℹ ${t ?? currentText}`);
      return self;
    },
  };
  return self;
}

/**
 * Drop-in replacement for `ora(text).start()`.
 *
 * In REPL mode returns a plain-text spinner that won't corrupt readline.
 * Outside the REPL returns a real ora spinner with animation.
 */
export { createSpinner as spinner };

export function createSpinner(text?: string): Spinner {
  if (replMode) {
    return createPlainSpinner(text);
  }
  return ora({ text, stream: process.stderr }) as unknown as Spinner;
}

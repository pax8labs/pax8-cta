/**
 * REPL-safe spinner wrapper.
 *
 * ora's spinner animation corrupts readline's terminal state,
 * breaking subsequent prompts in the REPL. This module provides
 * the same API but falls back to plain console.log when stdin
 * is being shared with readline (i.e. in REPL / interactive mode).
 *
 * In quiet mode (--quiet flag or AGENTSYNC_QUIET=1) all spinners are
 * replaced with a no-op implementation that produces zero output.
 */

import ora from "ora";

/** True when running inside the interactive REPL. */
let replMode = false;

export function setReplMode(enabled: boolean): void {
  replMode = enabled;
}

/**
 * Returns true when the process is running in quiet mode.
 *
 * Quiet mode is active when either:
 *   - `--quiet` appears anywhere in the raw argv (catches global flag before
 *     Commander has finished parsing subcommands), or
 *   - the environment variable `AGENTSYNC_QUIET` is set to "1" or "true"
 *     (allows CI pipelines to opt in without modifying every invocation).
 */
export function isQuietMode(): boolean {
  return (
    process.argv.includes("--quiet") ||
    process.env.AGENTSYNC_QUIET === "1" ||
    process.env.AGENTSYNC_QUIET === "true"
  );
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

/** No-op spinner used in quiet mode — produces zero output on any method call. */
function createNoOpSpinner(text?: string): Spinner {
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
      if (t) currentText = t;
      return self;
    },
    fail(t?: string) {
      if (t) currentText = t;
      return self;
    },
    warn(t?: string) {
      if (t) currentText = t;
      return self;
    },
    info(t?: string) {
      if (t) currentText = t;
      return self;
    },
  };
  return self;
}

/**
 * Drop-in replacement for `ora(text).start()`.
 *
 * - In quiet mode returns a no-op spinner that produces zero output.
 * - In REPL mode returns a plain-text spinner that won't corrupt readline.
 * - Otherwise returns a real ora spinner with animation.
 */
export { createSpinner as spinner };

export function createSpinner(text?: string): Spinner {
  if (isQuietMode()) {
    return createNoOpSpinner(text);
  }
  if (replMode) {
    return createPlainSpinner(text);
  }
  return ora({ text, stream: process.stderr }) as unknown as Spinner;
}

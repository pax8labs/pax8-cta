/**
 * REPL-safe spinner wrapper.
 *
 * ora's spinner animation corrupts readline's terminal state,
 * breaking subsequent prompts in the REPL. This module provides
 * the same API but falls back to plain console.log when stdin
 * is being shared with readline (i.e. in REPL / interactive mode).
 */

import ora from "ora";
import { isPirateMode, pirateSpinner } from "./theme.js";

/** True when running inside the interactive REPL. */
let replMode = false;

export function setReplMode(enabled: boolean): void {
  replMode = enabled;
}

export function isReplMode(): boolean {
  return replMode;
}

export function formatCommandExample(suffix: string): string {
  return replMode ? suffix : `agentsync ${suffix}`;
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

function tr(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  return isPirateMode() ? pirateSpinner(text) : text;
}

function createPlainSpinner(text?: string): Spinner {
  let currentText = tr(text) ?? "";
  const self: Spinner = {
    get text() {
      return currentText;
    },
    set text(t: string) {
      currentText = tr(t) ?? "";
    },
    start(t?: string) {
      if (t) currentText = tr(t) ?? "";
      return self;
    },
    stop() {
      return self;
    },
    succeed(t?: string) {
      console.error(`✔ ${tr(t) ?? currentText}`);
      return self;
    },
    fail(t?: string) {
      console.error(`✖ ${tr(t) ?? currentText}`);
      return self;
    },
    warn(t?: string) {
      console.error(`⚠ ${tr(t) ?? currentText}`);
      return self;
    },
    info(t?: string) {
      console.error(`ℹ ${tr(t) ?? currentText}`);
      return self;
    },
  };
  return self;
}

function wrapOraWithPirate(s: Spinner): Spinner {
  const wrapper: Spinner = {
    get text() {
      return s.text;
    },
    set text(t: string) {
      s.text = tr(t) ?? "";
    },
    start(t?: string) {
      s.start(tr(t));
      return wrapper;
    },
    stop() {
      s.stop();
      return wrapper;
    },
    succeed(t?: string) {
      s.succeed(tr(t));
      return wrapper;
    },
    fail(t?: string) {
      s.fail(tr(t));
      return wrapper;
    },
    warn(t?: string) {
      s.warn(tr(t));
      return wrapper;
    },
    info(t?: string) {
      s.info(tr(t));
      return wrapper;
    },
  };
  return wrapper;
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
  const oraSpinner = ora({ text: tr(text), stream: process.stderr }) as unknown as Spinner;
  return isPirateMode() ? wrapOraWithPirate(oraSpinner) : oraSpinner;
}

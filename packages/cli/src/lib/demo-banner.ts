/**
 * Copyright 2024 Pax8, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import chalk from "chalk";
import { isQuietMode } from "./spinner.js";

/**
 * One-shot demo banner.
 *
 * In a long-lived process (the REPL especially) we don't want every
 * command to repeat "⚠️  DEMO MODE - …" — once per process is enough
 * to set context. Banners go to stderr so JSON / quiet stdout stays
 * clean for tooling.
 */
let bannerShown = false;

export function showDemoBanner(): void {
  if (bannerShown || isQuietMode()) return;
  bannerShown = true;
  console.error(chalk.yellow("\n⚠️  DEMO MODE — using mock data\n"));
}

/**
 * Reset the once-per-process flag. For tests only.
 */
export function resetDemoBannerForTests(): void {
  bannerShown = false;
}

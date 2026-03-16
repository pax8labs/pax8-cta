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

import { isDemoModeEnabled } from "../commands/demo.js";
import { isDemoMode as isDemoModeCore } from "@agentsync/core";

/**
 * Check if demo mode is active from any source (CLI config, env var, or core).
 * Consolidates the two checks (`isDemoModeEnabled() || isDemoModeCore()`) that
 * were scattered across every command.
 */
export function isDemo(): boolean {
  return isDemoModeEnabled() || isDemoModeCore();
}

/**
 * Execute `demoHandler` when demo mode is active, otherwise `realHandler`.
 *
 * Usage:
 * ```ts
 * .action(async (options) => {
 *   await withDemoMode(
 *     () => runDemo(options),
 *     () => runReal(options),
 *   );
 * });
 * ```
 */
export async function withDemoMode<T>(
  demoHandler: () => T | Promise<T>,
  realHandler: () => T | Promise<T>
): Promise<T> {
  if (isDemo()) {
    return demoHandler();
  }
  return realHandler();
}

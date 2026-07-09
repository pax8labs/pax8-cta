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

import { resolve } from "node:path";
import {
  filterTenantsByTags,
  isDemoMode as isDemoModeCore,
  loadConfig,
  type TenantConfig,
} from "@pax8/cta-core";
import { getDemoTenants, isDemoModeEnabled } from "../commands/demo.js";
import { identifyUser } from "./telemetry.js";

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

export type LoadedConfig = Awaited<ReturnType<typeof loadConfig>>;

export interface ConfigOptions {
  config?: string;
}

export interface TenantSelectionOptions extends ConfigOptions {
  all?: boolean;
  tag?: string[];
}

/**
 * Resolve config once and branch by mode in a shared wrapper.
 */
export async function withResolvedConfig<T>(
  options: ConfigOptions,
  demoHandler: () => T | Promise<T>,
  realHandler: (config: LoadedConfig) => T | Promise<T>
): Promise<T> {
  if (isDemo()) {
    return demoHandler();
  }

  const configPath = resolve(process.cwd(), options.config ?? "./config/tenants.yaml");
  const config = await loadConfig(configPath);
  // Attribute telemetry to the authenticated partner identity now that
  // credentials are resolved (no-op when telemetry is disabled).
  identifyUser({ tenantId: config.partner?.tenantId, clientId: config.partner?.clientId });
  return realHandler(config);
}

/**
 * Resolve destinations once and pass the resolved context to command handlers.
 */
export async function withResolvedDestinations<T>(
  options: TenantSelectionOptions,
  demoHandler: (destinations: TenantConfig[]) => T | Promise<T>,
  realHandler: (context: { config: LoadedConfig; destinations: TenantConfig[] }) => T | Promise<T>
): Promise<T> {
  if (isDemo()) {
    return demoHandler(getDemoTenants(options));
  }

  const configPath = resolve(process.cwd(), options.config ?? "./config/tenants.yaml");
  const config = await loadConfig(configPath);
  // Attribute telemetry to the authenticated partner identity now that
  // credentials are resolved (no-op when telemetry is disabled).
  identifyUser({ tenantId: config.partner?.tenantId, clientId: config.partner?.clientId });
  const destinations = options.all
    ? config.tenants.filter((tenant) => tenant.enabled)
    : filterTenantsByTags(config, options.tag ?? []);

  return realHandler({ config, destinations });
}

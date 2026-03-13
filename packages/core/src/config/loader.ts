/**
 * Copyright 2024 Pax8 Labs
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

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { Config, ConfigSchema } from "./schema.js";
import { ConfigValidationError, ErrorCode } from "../errors.js";

/**
 * @deprecated Use ConfigValidationError from @agentsync/core/errors instead.
 * Kept for backwards compatibility.
 */
export class ConfigError extends ConfigValidationError {
  override readonly name = "ConfigValidationError" as const;

  constructor(message: string, cause?: unknown) {
    // Map generic messages to error codes
    let code: ErrorCode = ErrorCode.CONFIG_INVALID;
    if (message.includes("not found")) {
      code = ErrorCode.CONFIG_NOT_FOUND;
    } else if (message.includes("Failed to read")) {
      code = ErrorCode.CONFIG_READ_FAILED;
    } else if (message.includes("Failed to parse")) {
      code = ErrorCode.CONFIG_PARSE_FAILED;
    } else if (message.includes("Missing client secret")) {
      code = ErrorCode.CONFIG_SECRET_MISSING;
    }
    super(code, message, undefined, cause ? { cause } : undefined);
  }
}

/**
 * Get environment variable overrides for config
 * Returns partial config that can be merged with file-based config
 */
function getEnvOverrides(): Partial<Config> | null {
  const partnerTenantId = process.env.PARTNER_TENANT_ID;
  const partnerClientId = process.env.PARTNER_CLIENT_ID;
  const sourceTenantId = process.env.SOURCE_TENANT_ID;
  const sourceEnvironmentUrl = process.env.SOURCE_ENVIRONMENT_URL;

  // If none of the env vars are set, return null
  if (!partnerTenantId && !partnerClientId && !sourceTenantId && !sourceEnvironmentUrl) {
    return null;
  }

  const overrides: Partial<Config> = {};

  // Apply partner overrides if any partner env vars are set
  if (partnerTenantId || partnerClientId) {
    overrides.partner = {} as Config["partner"];
    if (partnerTenantId) {
      overrides.partner.tenantId = partnerTenantId;
    }
    if (partnerClientId) {
      overrides.partner.clientId = partnerClientId;
    }
  }

  // Apply source overrides if any source env vars are set
  if (sourceTenantId || sourceEnvironmentUrl) {
    overrides.source = {} as Config["source"];
    if (sourceTenantId) {
      overrides.source.tenantId = sourceTenantId;
    }
    if (sourceEnvironmentUrl) {
      overrides.source.environmentUrl = sourceEnvironmentUrl;
    }
  }

  return overrides;
}

/**
 * Load configuration from environment variables only (for Vercel/serverless)
 * This is only used when NO config file exists and ALL required env vars are set
 */
function loadConfigFromEnvOnly(): Config | null {
  const partnerTenantId = process.env.PARTNER_TENANT_ID;
  const partnerClientId = process.env.PARTNER_CLIENT_ID;
  const sourceTenantId = process.env.SOURCE_TENANT_ID;
  const sourceEnvironmentUrl = process.env.SOURCE_ENVIRONMENT_URL;

  // Only use env-only mode if ALL required vars are set
  if (!partnerTenantId || !partnerClientId || !sourceTenantId || !sourceEnvironmentUrl) {
    return null;
  }

  // Parse TENANTS_JSON if provided (for multi-tenant via env)
  let tenants: Config["tenants"] = [];
  const tenantsJson = process.env.TENANTS_JSON;
  if (tenantsJson) {
    try {
      tenants = JSON.parse(tenantsJson);
    } catch {
      throw new ConfigError("Invalid TENANTS_JSON - must be valid JSON array");
    }
  }

  const config: Config = {
    version: "2.0",
    partner: {
      tenantId: partnerTenantId,
      clientId: partnerClientId,
    },
    source: {
      tenantId: sourceTenantId,
      environmentUrl: sourceEnvironmentUrl,
    },
    tenants,
  };

  // Validate the config
  const result = ConfigSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new ConfigError(`Invalid environment configuration:\n${issues}`);
  }

  return result.data;
}

/**
 * Load and validate configuration from YAML file with optional env var overrides
 *
 * Priority:
 * - Tenants ALWAYS come from config file (never from env vars)
 * - Env vars can override partner/source config fields
 * - Secrets (like PARTNER_CLIENT_SECRET) come from env vars via getClientSecret()
 */
export async function loadConfig(configPath: string): Promise<Config> {
  // Check if config file exists
  if (!existsSync(configPath)) {
    // If no config file, try to load entirely from env vars (serverless mode)
    const envConfig = loadConfigFromEnvOnly();
    if (envConfig) {
      return envConfig;
    }

    throw new ConfigError(
      `Config file not found: ${configPath}\n` +
        "Either create the config file or set ALL environment variables:\n" +
        "  PARTNER_TENANT_ID, PARTNER_CLIENT_ID, SOURCE_TENANT_ID, SOURCE_ENVIRONMENT_URL"
    );
  }

  // Load config from file
  let content: string;
  try {
    content = await readFile(configPath, "utf-8");
  } catch (error) {
    throw new ConfigError(`Failed to read config file: ${configPath}`, error);
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(content);
  } catch (error) {
    throw new ConfigError(`Failed to parse YAML in config file: ${configPath}`, error);
  }

  // Apply environment variable overrides
  const envOverrides = getEnvOverrides();
  if (envOverrides) {
    // Merge env overrides with file config
    // Partner and source fields are merged field-by-field
    // Tenants ALWAYS come from file config
    const fileConfig = parsed as Partial<Config>;

    if (envOverrides.partner) {
      fileConfig.partner = {
        ...fileConfig.partner,
        ...envOverrides.partner,
      } as Config["partner"];
    }

    if (envOverrides.source) {
      fileConfig.source = {
        ...fileConfig.source,
        ...envOverrides.source,
      } as Config["source"];
    }

    parsed = fileConfig;
  }

  const result = ConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new ConfigError(`Invalid configuration:\n${issues}`);
  }

  return result.data;
}

/**
 * Get client secret from environment variable
 */
export function getClientSecret(envVar: string = "PARTNER_CLIENT_SECRET"): string {
  const secret = process.env[envVar];
  if (!secret) {
    throw new ConfigError(`Missing client secret. Set the ${envVar} environment variable.`);
  }
  return secret;
}

/**
 * Filter tenants by tags
 */
export function filterTenantsByTags(config: Config, tags: string[]): Config["tenants"] {
  if (tags.length === 0) {
    return config.tenants.filter((t) => t.enabled);
  }

  return config.tenants.filter(
    (tenant) => tenant.enabled && tags.some((tag) => tenant.tags?.includes(tag))
  );
}

/**
 * Filter tenants by name (partial match)
 */
export function filterTenantsByName(config: Config, namePattern: string): Config["tenants"] {
  const pattern = namePattern.toLowerCase();
  return config.tenants.filter(
    (tenant) => tenant.enabled && tenant.name.toLowerCase().includes(pattern)
  );
}

/**
 * Get a single tenant by ID
 */
export function getTenantById(config: Config, tenantId: string): Config["tenants"][0] | undefined {
  return config.tenants.find((t) => t.tenantId === tenantId);
}

/**
 * Find a tenant by ID, name, or environment URL
 *
 * Matches tenants using the following strategies (in order):
 * 1. Exact match on tenantId (UUID)
 * 2. Case-insensitive exact match on name
 * 3. Case-insensitive partial match on environmentUrl
 *
 * This is useful when multiple environments share the same Azure AD tenant,
 * allowing users to specify tenants by name or URL instead of just tenant ID.
 *
 * @param config - The configuration containing tenant definitions
 * @param identifier - The tenant identifier (ID, name, or environment URL)
 * @returns The matching tenant config, or undefined if not found
 *
 * @example
 * ```typescript
 * // Match by tenant ID
 * findTenant(config, "12345678-1234-1234-1234-123456789012");
 *
 * // Match by name (case-insensitive)
 * findTenant(config, "production");
 * findTenant(config, "Production"); // same result
 *
 * // Match by environment URL (partial, case-insensitive)
 * findTenant(config, "contoso.crm.dynamics.com");
 * findTenant(config, "contoso"); // same result
 * ```
 */
export function findTenant(config: Config, identifier: string): Config["tenants"][0] | undefined {
  // Strategy 1: Try matching by tenant ID (exact match)
  let tenant = config.tenants.find((t) => t.tenantId === identifier);
  if (tenant) {
    return tenant;
  }

  // Strategy 2: Try matching by name (case-insensitive exact match)
  tenant = config.tenants.find((t) => t.name.toLowerCase() === identifier.toLowerCase());
  if (tenant) {
    return tenant;
  }

  // Strategy 3: Try matching by environment URL (partial match, case-insensitive)
  tenant = config.tenants.find((t) =>
    t.environmentUrl.toLowerCase().includes(identifier.toLowerCase())
  );
  if (tenant) {
    return tenant;
  }

  return undefined;
}

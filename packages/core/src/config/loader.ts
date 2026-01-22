import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { Config, ConfigSchema } from "./schema.js";

export class ConfigError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "ConfigError";
  }
}

/**
 * Load configuration from environment variables (for Vercel/serverless)
 * Returns null if required env vars are not set
 */
function loadConfigFromEnv(): Config | null {
  const partnerTenantId = process.env.PARTNER_TENANT_ID;
  const partnerClientId = process.env.PARTNER_CLIENT_ID;
  const sourceTenantId = process.env.SOURCE_TENANT_ID;
  const sourceEnvironmentUrl = process.env.SOURCE_ENVIRONMENT_URL;

  // If none of the env vars are set, return null to fall back to file
  if (!partnerTenantId && !partnerClientId && !sourceTenantId && !sourceEnvironmentUrl) {
    return null;
  }

  // If some are set but not all, throw an error
  if (!partnerTenantId || !partnerClientId || !sourceTenantId || !sourceEnvironmentUrl) {
    throw new ConfigError(
      "Incomplete environment configuration. When using env vars, you must set all of: " +
      "PARTNER_TENANT_ID, PARTNER_CLIENT_ID, SOURCE_TENANT_ID, SOURCE_ENVIRONMENT_URL"
    );
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
 * Load and validate configuration from environment variables or YAML file
 * Priority: env vars > config file
 */
export async function loadConfig(configPath: string): Promise<Config> {
  // First, try to load from environment variables
  const envConfig = loadConfigFromEnv();
  if (envConfig) {
    return envConfig;
  }

  // Fall back to config file
  if (!existsSync(configPath)) {
    throw new ConfigError(
      `Config file not found: ${configPath}\n` +
      "Either create the config file or set environment variables:\n" +
      "  PARTNER_TENANT_ID, PARTNER_CLIENT_ID, SOURCE_TENANT_ID, SOURCE_ENVIRONMENT_URL"
    );
  }

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
    throw new ConfigError(
      `Missing client secret. Set the ${envVar} environment variable.`
    );
  }
  return secret;
}

/**
 * Filter tenants by tags
 */
export function filterTenantsByTags(
  config: Config,
  tags: string[]
): Config["tenants"] {
  if (tags.length === 0) {
    return config.tenants.filter((t) => t.enabled);
  }

  return config.tenants.filter(
    (tenant) =>
      tenant.enabled &&
      tags.some((tag) => tenant.tags?.includes(tag))
  );
}

/**
 * Filter tenants by name (partial match)
 */
export function filterTenantsByName(
  config: Config,
  namePattern: string
): Config["tenants"] {
  const pattern = namePattern.toLowerCase();
  return config.tenants.filter(
    (tenant) =>
      tenant.enabled &&
      tenant.name.toLowerCase().includes(pattern)
  );
}

/**
 * Get a single tenant by ID
 */
export function getTenantById(
  config: Config,
  tenantId: string
): Config["tenants"][0] | undefined {
  return config.tenants.find((t) => t.tenantId === tenantId);
}

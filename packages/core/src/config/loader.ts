import { readFile } from "node:fs/promises";
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
 * Load and validate configuration from a YAML file
 */
export async function loadConfig(configPath: string): Promise<Config> {
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

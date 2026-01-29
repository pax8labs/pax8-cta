/**
 * Redis utility functions
 *
 * Shared utilities for Redis connection handling across the codebase.
 */

/**
 * Redis connection options compatible with BullMQ
 */
export interface RedisConnectionOptions {
  host: string;
  port: number;
  password?: string;
  username?: string;
  maxRetriesPerRequest: null;
}

/**
 * Default Redis port
 */
export const DEFAULT_REDIS_PORT = 6379;

/**
 * Default Redis URL for local development
 */
export const DEFAULT_REDIS_URL = "redis://localhost:6379";

/**
 * Parse a Redis URL into BullMQ-compatible connection options
 *
 * @param url - Redis connection URL (e.g., "redis://user:pass@host:port")
 * @returns RedisOptions compatible with BullMQ
 *
 * @example
 * ```ts
 * const options = parseRedisUrl("redis://localhost:6379");
 * const queue = new Queue("my-queue", { connection: options });
 * ```
 */
export function parseRedisUrl(url: string): RedisConnectionOptions {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || String(DEFAULT_REDIS_PORT), 10),
    password: parsed.password || undefined,
    username: parsed.username || undefined,
    // Required for BullMQ to work properly
    maxRetriesPerRequest: null,
  };
}

/**
 * Build a Redis URL from individual components
 *
 * @param options - Connection options
 * @returns Redis connection URL string
 */
export function buildRedisUrl(options: {
  host?: string;
  port?: number;
  password?: string;
  username?: string;
}): string {
  const { host = "localhost", port = DEFAULT_REDIS_PORT, password, username } = options;

  let url = "redis://";

  if (username && password) {
    url += `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`;
  } else if (password) {
    url += `:${encodeURIComponent(password)}@`;
  }

  url += `${host}:${port}`;

  return url;
}

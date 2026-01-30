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

/**
 * Format a Redis connection error into a user-friendly message with actionable guidance
 *
 * @param error - The original error from Redis/ioredis/BullMQ
 * @param redisUrl - The Redis URL that was being connected to
 * @returns A formatted error message with guidance on how to fix the issue
 */
export function formatRedisError(error: Error, redisUrl?: string): string {
  const errorMessage = error.message || String(error);

  // Connection refused - Redis server not running
  if (errorMessage.includes("ECONNREFUSED") || errorMessage.includes("connect ECONNREFUSED")) {
    const parsed = redisUrl ? new URL(redisUrl) : null;
    const host = parsed?.hostname || "localhost";
    const port = parsed?.port || "6379";

    return [
      `Redis connection failed: Unable to connect to ${host}:${port}`,
      "",
      "Redis is required for deployment job processing. To start Redis:",
      "",
      "  Option 1 - Docker (recommended):",
      "    docker-compose up redis",
      "",
      "  Option 2 - Docker standalone:",
      `    docker run -d --name agentsync-redis -p ${port}:6379 \\`,
      "      -v agentsync-redis-data:/data \\",
      "      redis:7-alpine redis-server --appendonly yes",
      "",
      "  Option 3 - Local install:",
      "    macOS: brew services start redis",
      "    Ubuntu: sudo systemctl start redis",
      "",
      "For serverless deployments without Redis, use the /api/deployments/process endpoint.",
    ].join("\n");
  }

  // Authentication failure
  if (errorMessage.includes("NOAUTH") || errorMessage.includes("AUTH")) {
    return [
      "Redis authentication failed",
      "",
      "Check your REDIS_URL environment variable includes the correct password:",
      "  redis://:yourpassword@hostname:6379",
      "",
      "Or for username and password:",
      "  redis://username:password@hostname:6379",
    ].join("\n");
  }

  // Connection timeout
  if (errorMessage.includes("ETIMEDOUT") || errorMessage.includes("timeout")) {
    return [
      "Redis connection timed out",
      "",
      "This could mean:",
      "  - Redis server is overloaded",
      "  - Network connectivity issues",
      "  - Firewall blocking the connection",
      "",
      "Check that Redis is running and accessible from this machine.",
    ].join("\n");
  }

  // DNS resolution failure
  if (errorMessage.includes("ENOTFOUND") || errorMessage.includes("getaddrinfo")) {
    const parsed = redisUrl ? new URL(redisUrl) : null;
    const host = parsed?.hostname || "unknown host";

    return [
      `Redis host not found: ${host}`,
      "",
      "Check your REDIS_URL environment variable:",
      "  - Verify the hostname is correct",
      "  - For local development, use: redis://localhost:6379",
    ].join("\n");
  }

  // Generic fallback with the original error
  return [
    `Redis connection error: ${errorMessage}`,
    "",
    "Ensure Redis is running and REDIS_URL is configured correctly.",
    "For local development: docker-compose up redis",
  ].join("\n");
}

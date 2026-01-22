import { z } from 'zod';
import { ValidationError } from './errors.js';

/**
 * Configuration schema with validation
 */
const ConfigSchema = z.object({
  // AgentSync API configuration
  apiBaseUrl: z
    .string()
    .url('API_BASE_URL must be a valid URL')
    .default('http://localhost:3000'),

  // Request timeouts
  requestTimeoutMs: z
    .number()
    .int()
    .min(1000)
    .max(300000)
    .default(30000),

  // Retry configuration
  maxRetries: z.number().int().min(0).max(10).default(3),
  retryDelayMs: z.number().int().min(100).max(10000).default(1000),
  retryBackoffMultiplier: z.number().min(1).max(10).default(2),

  // Circuit breaker configuration
  circuitBreakerThreshold: z.number().int().min(1).max(100).default(5),
  circuitBreakerResetMs: z.number().int().min(1000).max(300000).default(60000),

  // Logging
  logLevel: z
    .enum(['error', 'warn', 'info', 'debug'])
    .default('info'),
  logFormat: z.enum(['json', 'pretty']).default('json'),

  // MCP server info
  serverName: z.string().default('agentsync-mcp'),
  serverVersion: z.string().default('1.0.0'),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Load and validate configuration from environment
 */
export function loadConfig(): Config {
  try {
    const config = ConfigSchema.parse({
      apiBaseUrl: process.env.API_BASE_URL,
      requestTimeoutMs: process.env.REQUEST_TIMEOUT_MS
        ? parseInt(process.env.REQUEST_TIMEOUT_MS, 10)
        : undefined,
      maxRetries: process.env.MAX_RETRIES
        ? parseInt(process.env.MAX_RETRIES, 10)
        : undefined,
      retryDelayMs: process.env.RETRY_DELAY_MS
        ? parseInt(process.env.RETRY_DELAY_MS, 10)
        : undefined,
      retryBackoffMultiplier: process.env.RETRY_BACKOFF_MULTIPLIER
        ? parseFloat(process.env.RETRY_BACKOFF_MULTIPLIER)
        : undefined,
      circuitBreakerThreshold: process.env.CIRCUIT_BREAKER_THRESHOLD
        ? parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD, 10)
        : undefined,
      circuitBreakerResetMs: process.env.CIRCUIT_BREAKER_RESET_MS
        ? parseInt(process.env.CIRCUIT_BREAKER_RESET_MS, 10)
        : undefined,
      logLevel: process.env.LOG_LEVEL,
      logFormat: process.env.LOG_FORMAT,
      serverName: process.env.SERVER_NAME,
      serverVersion: process.env.SERVER_VERSION,
    });

    return config;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new ValidationError(`Configuration validation failed: ${errors}`);
    }
    throw error;
  }
}

/**
 * Global configuration instance
 */
export const config = loadConfig();

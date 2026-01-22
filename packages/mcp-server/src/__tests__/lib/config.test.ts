import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset modules to clear cached config
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should load default configuration', async () => {
    process.env = { ...originalEnv };
    delete process.env.API_BASE_URL;

    const { config } = await import('../../lib/config.js');

    expect(config.apiBaseUrl).toBe('http://localhost:3000');
    expect(config.requestTimeoutMs).toBe(30000);
    expect(config.maxRetries).toBe(3);
    expect(config.retryDelayMs).toBe(1000);
    expect(config.retryBackoffMultiplier).toBe(2);
    expect(config.circuitBreakerThreshold).toBe(5);
    expect(config.circuitBreakerResetMs).toBe(60000);
    expect(config.logLevel).toBe('info');
    expect(config.serverName).toBe('agentsync-mcp');
    expect(config.serverVersion).toBe('1.0.0');
  });

  it('should load configuration from environment variables', async () => {
    process.env = {
      ...originalEnv,
      API_BASE_URL: 'http://custom-api:8080',
      REQUEST_TIMEOUT_MS: '45000',
      MAX_RETRIES: '5',
      RETRY_DELAY_MS: '2000',
      RETRY_BACKOFF_MULTIPLIER: '1.5',
      CIRCUIT_BREAKER_THRESHOLD: '10',
      CIRCUIT_BREAKER_RESET_MS: '120000',
      LOG_LEVEL: 'debug',
      LOG_FORMAT: 'pretty',
      SERVER_NAME: 'custom-mcp',
      SERVER_VERSION: '2.0.0',
    };

    const { config } = await import('../../lib/config.js');

    expect(config.apiBaseUrl).toBe('http://custom-api:8080');
    expect(config.requestTimeoutMs).toBe(45000);
    expect(config.maxRetries).toBe(5);
    expect(config.retryDelayMs).toBe(2000);
    expect(config.retryBackoffMultiplier).toBe(1.5);
    expect(config.circuitBreakerThreshold).toBe(10);
    expect(config.circuitBreakerResetMs).toBe(120000);
    expect(config.logLevel).toBe('debug');
    expect(config.logFormat).toBe('pretty');
    expect(config.serverName).toBe('custom-mcp');
    expect(config.serverVersion).toBe('2.0.0');
  });

  it('should reject invalid API URL', async () => {
    process.env = {
      ...originalEnv,
      API_BASE_URL: 'not-a-valid-url',
    };

    await expect(async () => {
      await import('../../lib/config.js');
    }).rejects.toThrow(/API_BASE_URL must be a valid URL/);
  });

  it('should reject invalid timeout values', async () => {
    process.env = {
      ...originalEnv,
      REQUEST_TIMEOUT_MS: '500', // Too short
    };

    await expect(async () => {
      await import('../../lib/config.js');
    }).rejects.toThrow(/Configuration validation failed/);
  });

  it('should reject invalid retry values', async () => {
    process.env = {
      ...originalEnv,
      MAX_RETRIES: '15', // Too high
    };

    await expect(async () => {
      await import('../../lib/config.js');
    }).rejects.toThrow(/Configuration validation failed/);
  });

  it('should reject invalid log level', async () => {
    process.env = {
      ...originalEnv,
      LOG_LEVEL: 'invalid',
    };

    await expect(async () => {
      await import('../../lib/config.js');
    }).rejects.toThrow(/Configuration validation failed/);
  });
});

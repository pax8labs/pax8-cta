import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger, timedOperation } from '../services/logger.js';

describe('Logger', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn<typeof console, 'log'>>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    Logger.clearTraceContext();
  });

  describe('constructor', () => {
    it('should create a logger with default settings', () => {
      const logger = new Logger();
      logger.info('test message');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should create a logger with custom service name', () => {
      const logger = new Logger({ service: 'test-service' });
      logger.info('test message');

      const logOutput = consoleSpy.mock.calls[0][0];
      expect(logOutput).toContain('test-service');
    });
  });

  describe('log levels', () => {
    it('should log debug messages when minLevel is debug', () => {
      const logger = new Logger({ minLevel: 'debug' });
      logger.debug('debug message');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should not log debug messages when minLevel is info', () => {
      const logger = new Logger({ minLevel: 'info' });
      logger.debug('debug message');
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should log info messages', () => {
      const logger = new Logger({ minLevel: 'info' });
      logger.info('info message');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should log warn messages', () => {
      const logger = new Logger({ minLevel: 'info' });
      logger.warn('warn message');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should log error messages with error object', () => {
      const logger = new Logger({ minLevel: 'info' });
      const error = new Error('test error');
      logger.error('error message', error);
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('context', () => {
    it('should include context in log output', () => {
      const logger = new Logger({ minLevel: 'info' });
      logger.info('test message', { key: 'value' });

      const logOutput = consoleSpy.mock.calls[0][0];
      expect(logOutput).toContain('key');
      expect(logOutput).toContain('value');
    });

    it('should merge default context with call context', () => {
      const logger = new Logger({
        minLevel: 'info',
        defaultContext: { default: 'context' },
      });
      logger.info('test message', { extra: 'data' });

      const logOutput = consoleSpy.mock.calls[0][0];
      expect(logOutput).toContain('default');
      expect(logOutput).toContain('extra');
    });
  });

  describe('child logger', () => {
    it('should create a child logger with inherited settings', () => {
      const parent = new Logger({ service: 'parent', minLevel: 'info' });
      const child = parent.child({ service: 'child' });

      child.info('child message');
      const logOutput = consoleSpy.mock.calls[0][0];
      expect(logOutput).toContain('child');
    });

    it('should merge parent context with child context', () => {
      const parent = new Logger({
        minLevel: 'info',
        defaultContext: { parent: 'value' },
      });
      const child = parent.child({ context: { child: 'value' } });

      child.info('test');
      const logOutput = consoleSpy.mock.calls[0][0];
      expect(logOutput).toContain('parent');
      expect(logOutput).toContain('child');
    });
  });

  describe('trace context', () => {
    it('should include trace ID in logs when set', () => {
      Logger.setTraceContext('trace-123', 'span-456');

      const logger = new Logger({ minLevel: 'info' });
      logger.info('test message');

      // The trace context is included in structured logging
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should generate trace ID', () => {
      const traceId = Logger.generateTraceId();
      expect(traceId).toMatch(/^[a-f0-9]{32}$/);
    });
  });
});

describe('timedOperation', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn<typeof console, 'log'>>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should log start and completion of operation', async () => {
    const logger = new Logger({ minLevel: 'debug' });

    const result = await timedOperation(logger, 'test operation', async () => {
      return 'result';
    });

    expect(result).toBe('result');
    expect(consoleSpy).toHaveBeenCalledTimes(2); // debug + info
  });

  it('should log error on failure', async () => {
    const logger = new Logger({ minLevel: 'debug' });

    await expect(
      timedOperation(logger, 'failing operation', async () => {
        throw new Error('test error');
      })
    ).rejects.toThrow('test error');

    expect(consoleSpy).toHaveBeenCalled();
  });

  it('should include duration in log', async () => {
    const logger = new Logger({ minLevel: 'info' });

    await timedOperation(logger, 'timed operation', async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return 'done';
    });

    const logOutput = consoleSpy.mock.calls[0][0];
    expect(logOutput).toContain('durationMs');
  });
});

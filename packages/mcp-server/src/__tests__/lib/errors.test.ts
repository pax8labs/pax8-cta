import { describe, it, expect } from 'vitest';
import {
  MCPError,
  APIError,
  NetworkError,
  TimeoutError,
  ValidationError,
  NotFoundError,
  AuthError,
  CircuitBreakerError,
  RateLimitError,
} from '../../lib/errors.js';

describe('Error Classes', () => {
  describe('MCPError', () => {
    it('should create error with all properties', () => {
      const error = new MCPError('Test error', 'TEST_CODE', 500, { detail: 'test' });

      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.statusCode).toBe(500);
      expect(error.details).toEqual({ detail: 'test' });
      expect(error.name).toBe('MCPError');
    });

    it('should serialize to JSON with isError flag', () => {
      const error = new MCPError('Test error', 'TEST_CODE', 500);
      const json = error.toJSON();

      expect(json).toEqual({
        error: 'Test error',
        code: 'TEST_CODE',
        statusCode: 500,
        details: undefined,
        isError: true,
      });
    });
  });

  describe('APIError', () => {
    it('should create API error with correct code', () => {
      const error = new APIError('API failed', 404, { resource: 'user' });

      expect(error.code).toBe('API_ERROR');
      expect(error.statusCode).toBe(404);
      expect(error.details).toEqual({ resource: 'user' });
    });
  });

  describe('NetworkError', () => {
    it('should create network error', () => {
      const error = new NetworkError('Connection failed');

      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.statusCode).toBeUndefined();
    });
  });

  describe('TimeoutError', () => {
    it('should create timeout error with duration', () => {
      const error = new TimeoutError('Request timed out', 30000);

      expect(error.code).toBe('TIMEOUT_ERROR');
      expect(error.details).toEqual({ timeoutMs: 30000 });
    });
  });

  describe('ValidationError', () => {
    it('should create validation error with 400 status', () => {
      const error = new ValidationError('Invalid input', { field: 'email' });

      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.details).toEqual({ field: 'email' });
    });
  });

  describe('NotFoundError', () => {
    it('should create not found error with resource info', () => {
      const error = new NotFoundError('deployment', 'batch-123');

      expect(error.code).toBe('NOT_FOUND');
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('deployment not found: batch-123');
      expect(error.details).toEqual({
        resource: 'deployment',
        identifier: 'batch-123',
      });
    });
  });

  describe('AuthError', () => {
    it('should create auth error with 401 status', () => {
      const error = new AuthError('Authentication required');

      expect(error.code).toBe('AUTH_ERROR');
      expect(error.statusCode).toBe(401);
    });
  });

  describe('CircuitBreakerError', () => {
    it('should create circuit breaker error with 503 status', () => {
      const error = new CircuitBreakerError('Circuit breaker open');

      expect(error.code).toBe('CIRCUIT_BREAKER_OPEN');
      expect(error.statusCode).toBe(503);
    });
  });

  describe('RateLimitError', () => {
    it('should create rate limit error with retry info', () => {
      const error = new RateLimitError('Too many requests', 60);

      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.statusCode).toBe(429);
      expect(error.details).toEqual({ retryAfter: 60 });
    });
  });
});

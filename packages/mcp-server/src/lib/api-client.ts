import fetch, { RequestInit, Response } from 'node-fetch';
import { config } from './config.js';
import { logger } from './logger.js';
import {
  APIError,
  NetworkError,
  TimeoutError,
  CircuitBreakerError,
  RateLimitError,
} from './errors.js';

/**
 * Circuit breaker state
 */
class CircuitBreaker {
  private failures = 0;
  private lastFailureTime: number | null = null;
  private isOpen = false;

  recordSuccess(): void {
    this.failures = 0;
    this.isOpen = false;
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= config.circuitBreakerThreshold) {
      this.isOpen = true;
      logger.warn('Circuit breaker opened', {
        failures: this.failures,
        threshold: config.circuitBreakerThreshold,
      });
    }
  }

  canAttempt(): boolean {
    if (!this.isOpen) return true;

    // Check if we should try to close the circuit
    if (
      this.lastFailureTime &&
      Date.now() - this.lastFailureTime > config.circuitBreakerResetMs
    ) {
      logger.info('Circuit breaker attempting reset');
      this.isOpen = false;
      this.failures = 0;
      return true;
    }

    return false;
  }
}

const circuitBreaker = new CircuitBreaker();

/**
 * Sleep helper for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new TimeoutError(`Request timed out after ${timeoutMs}ms`, timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Check if error is retryable
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof TimeoutError) return true;
  if (error instanceof NetworkError) return true;
  if (error instanceof APIError) {
    // Retry on 5xx errors and 429 (rate limit)
    const status = error.statusCode;
    return status ? (status >= 500 || status === 429) : false;
  }
  return false;
}

/**
 * API request with retry logic, exponential backoff, and circuit breaker
 */
export async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  // Check circuit breaker
  if (!circuitBreaker.canAttempt()) {
    throw new CircuitBreakerError(
      'Circuit breaker is open. Too many recent failures.'
    );
  }

  const url = `${config.apiBaseUrl}${endpoint}`;
  let lastError: Error | null = null;

  // Retry loop
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      logger.debug('API request', {
        url,
        method: options.method || 'GET',
        attempt: attempt + 1,
        maxAttempts: config.maxRetries + 1,
      });

      // Make request with timeout
      const response = await fetchWithTimeout(
        url,
        {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            ...options.headers,
          },
        },
        config.requestTimeoutMs
      );

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : null;

        logger.warn('Rate limit exceeded', {
          url,
          retryAfter: retryAfterMs,
        });

        throw new RateLimitError(
          'Rate limit exceeded',
          retryAfterMs || undefined
        );
      }

      // Handle error responses
      if (!response.ok) {
        const errorText = await response.text();
        let errorData: unknown;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText };
        }

        logger.warn('API error response', {
          url,
          status: response.status,
          error: errorData,
        });

        throw new APIError(
          `API request failed: ${response.statusText}`,
          response.status,
          errorData
        );
      }

      // Success - parse response
      const data = await response.json();

      logger.debug('API request successful', {
        url,
        attempt: attempt + 1,
      });

      circuitBreaker.recordSuccess();
      return data as T;

    } catch (error) {
      lastError = error as Error;

      // Log the error
      logger.warn('API request failed', {
        url,
        attempt: attempt + 1,
        error: lastError.message,
        retryable: isRetryableError(error),
      });

      // Don't retry on non-retryable errors
      if (!isRetryableError(error)) {
        circuitBreaker.recordFailure();
        throw error;
      }

      // Don't retry if this was the last attempt
      if (attempt === config.maxRetries) {
        circuitBreaker.recordFailure();
        throw error;
      }

      // Calculate backoff delay with exponential increase
      const delayMs =
        config.retryDelayMs * Math.pow(config.retryBackoffMultiplier, attempt);

      logger.info('Retrying API request', {
        url,
        attempt: attempt + 1,
        nextAttempt: attempt + 2,
        delayMs,
      });

      await sleep(delayMs);
    }
  }

  // This should never be reached, but TypeScript needs it
  circuitBreaker.recordFailure();
  throw lastError || new Error('Unknown error during API request');
}

/**
 * Convenience methods for common HTTP methods
 */
export async function get<T = unknown>(endpoint: string): Promise<T> {
  return apiRequest<T>(endpoint, { method: 'GET' });
}

export async function post<T = unknown>(
  endpoint: string,
  body: unknown
): Promise<T> {
  return apiRequest<T>(endpoint, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function put<T = unknown>(
  endpoint: string,
  body: unknown
): Promise<T> {
  return apiRequest<T>(endpoint, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function del<T = unknown>(endpoint: string): Promise<T> {
  return apiRequest<T>(endpoint, { method: 'DELETE' });
}

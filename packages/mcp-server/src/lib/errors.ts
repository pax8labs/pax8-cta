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

/**
 * Base error class for all MCP server errors
 */
export class MCPError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
      isError: true,
    };
  }
}

/**
 * API request failed
 */
export class APIError extends MCPError {
  constructor(message: string, statusCode?: number, details?: unknown) {
    super(message, "API_ERROR", statusCode, details);
  }
}

/**
 * Network or connection error
 */
export class NetworkError extends MCPError {
  constructor(message: string, details?: unknown) {
    super(message, "NETWORK_ERROR", undefined, details);
  }
}

/**
 * Request timeout
 */
export class TimeoutError extends MCPError {
  constructor(message: string, timeoutMs: number) {
    super(message, "TIMEOUT_ERROR", undefined, { timeoutMs });
  }
}

/**
 * Invalid input parameters
 */
export class ValidationError extends MCPError {
  constructor(message: string, details?: unknown) {
    super(message, "VALIDATION_ERROR", 400, details);
  }
}

/**
 * Resource not found
 */
export class NotFoundError extends MCPError {
  constructor(resource: string, identifier: string) {
    super(`${resource} not found: ${identifier}`, "NOT_FOUND", 404, { resource, identifier });
  }
}

/**
 * Authentication or authorization error
 */
export class AuthError extends MCPError {
  constructor(message: string) {
    super(message, "AUTH_ERROR", 401);
  }
}

/**
 * Circuit breaker is open (too many failures)
 */
export class CircuitBreakerError extends MCPError {
  constructor(message: string) {
    super(message, "CIRCUIT_BREAKER_OPEN", 503);
  }
}

/**
 * Rate limit exceeded
 */
export class RateLimitError extends MCPError {
  constructor(message: string, retryAfter?: number) {
    super(message, "RATE_LIMIT_EXCEEDED", 429, { retryAfter });
  }
}

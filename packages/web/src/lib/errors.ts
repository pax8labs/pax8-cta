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
 * Standard API Error Handling
 * Provides consistent error responses across all API endpoints
 */

import { NextResponse } from "next/server";

/**
 * Standard error response format
 */
export interface StandardErrorResponse {
  error: {
    code: string;
    message: string;
    details?: string[] | Record<string, unknown>;
    requestId?: string;
  };
}

/**
 * Error codes for consistent client-side handling
 */
export const ErrorCodes = {
  // Authentication & Authorization (401, 403)
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  INVALID_TOKEN: "INVALID_TOKEN",
  INSUFFICIENT_PERMISSIONS: "INSUFFICIENT_PERMISSIONS",

  // Validation (400)
  VALIDATION_FAILED: "VALIDATION_FAILED",
  INVALID_REQUEST: "INVALID_REQUEST",
  MISSING_REQUIRED_FIELD: "MISSING_REQUIRED_FIELD",
  INVALID_FORMAT: "INVALID_FORMAT",
  INVALID_FILE_TYPE: "INVALID_FILE_TYPE",
  FILE_TOO_LARGE: "FILE_TOO_LARGE",

  // Resource Errors (404, 409)
  NOT_FOUND: "NOT_FOUND",
  DEPLOYMENT_NOT_FOUND: "DEPLOYMENT_NOT_FOUND",
  TENANT_NOT_FOUND: "TENANT_NOT_FOUND",
  SOLUTION_NOT_FOUND: "SOLUTION_NOT_FOUND",
  WEBHOOK_NOT_FOUND: "WEBHOOK_NOT_FOUND",
  ALREADY_EXISTS: "ALREADY_EXISTS",
  CONFLICT: "CONFLICT",

  // Rate Limiting (429)
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",

  // External Service Errors (502, 503)
  EXTERNAL_SERVICE_ERROR: "EXTERNAL_SERVICE_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  DATAVERSE_ERROR: "DATAVERSE_ERROR",
  POWER_PLATFORM_ERROR: "POWER_PLATFORM_ERROR",

  // Internal Errors (500)
  INTERNAL_ERROR: "INTERNAL_ERROR",
  DATABASE_ERROR: "DATABASE_ERROR",
  CONFIGURATION_ERROR: "CONFIGURATION_ERROR",

  // Business Logic Errors
  DEPLOYMENT_FAILED: "DEPLOYMENT_FAILED",
  APPROVAL_EXPIRED: "APPROVAL_EXPIRED",
  INVALID_STATE: "INVALID_STATE",
  OPERATION_FAILED: "OPERATION_FAILED",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Create a standard error response
 */
export function createErrorResponse(
  code: ErrorCode,
  message: string,
  status: number = 500,
  details?: string[] | Record<string, unknown>,
  requestId?: string
): NextResponse {
  const response: StandardErrorResponse = {
    error: {
      code,
      message,
      ...(details ? { details } : {}),
      ...(requestId ? { requestId } : {}),
    },
  };

  return NextResponse.json(response, { status });
}

/**
 * Common error responses
 */

export function unauthorized(message: string = "Authentication required"): NextResponse {
  return createErrorResponse(ErrorCodes.UNAUTHORIZED, message, 401);
}

export function forbidden(message: string = "Insufficient permissions"): NextResponse {
  return createErrorResponse(ErrorCodes.FORBIDDEN, message, 403);
}

export function notFound(resource: string = "Resource", id?: string): NextResponse {
  const message = id ? `${resource} with ID '${id}' not found` : `${resource} not found`;
  return createErrorResponse(ErrorCodes.NOT_FOUND, message, 404);
}

export function validationError(
  message: string,
  details?: string[] | Record<string, unknown>
): NextResponse {
  return createErrorResponse(ErrorCodes.VALIDATION_FAILED, message, 400, details);
}

export function invalidRequest(message: string): NextResponse {
  return createErrorResponse(ErrorCodes.INVALID_REQUEST, message, 400);
}

export function conflict(message: string): NextResponse {
  return createErrorResponse(ErrorCodes.CONFLICT, message, 409);
}

export function internalError(
  message: string = "An internal error occurred",
  details?: string[] | Record<string, unknown>
): NextResponse {
  return createErrorResponse(ErrorCodes.INTERNAL_ERROR, message, 500, details);
}

export function externalServiceError(service: string, message?: string): NextResponse {
  return createErrorResponse(
    ErrorCodes.EXTERNAL_SERVICE_ERROR,
    message || `${service} service error`,
    502
  );
}

/**
 * Convert an unknown error to a standard error response
 */
export function handleUnknownError(
  error: unknown,
  defaultMessage: string = "An unexpected error occurred"
): NextResponse {
  if (error instanceof Error) {
    // In production, don't expose internal error messages
    const message = process.env.NODE_ENV === "development" ? error.message : defaultMessage;

    return internalError(
      message,
      process.env.NODE_ENV === "development" ? { stack: error.stack } : undefined
    );
  }

  return internalError(defaultMessage);
}

/**
 * Type guard to check if a response is an error response
 */
export function isErrorResponse(data: unknown): data is StandardErrorResponse {
  return (
    typeof data === "object" &&
    data !== null &&
    "error" in data &&
    typeof (data as any).error === "object" &&
    "code" in (data as any).error &&
    "message" in (data as any).error
  );
}

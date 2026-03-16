/**
 * Copyright 2024 Pax8, Inc.
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
 * Structured error codes for AgentSync.
 *
 * These codes are used by the CLI error handler to provide actionable
 * recovery guidance. When adding a new code, also update the CLI
 * error-handler.ts `formatError` function to handle it.
 */
export enum ErrorCode {
  // Authentication
  AUTH_FAILED = "AUTH_FAILED",
  AUTH_TOKEN_EXPIRED = "AUTH_TOKEN_EXPIRED",
  AUTH_APP_NOT_FOUND = "AUTH_APP_NOT_FOUND",
  AUTH_INVALID_SECRET = "AUTH_INVALID_SECRET",
  AUTH_ACCOUNT_NOT_FOUND = "AUTH_ACCOUNT_NOT_FOUND",
  AUTH_INVALID_CLIENT = "AUTH_INVALID_CLIENT",

  // GDAP / Application user
  GDAP_MISSING = "GDAP_MISSING",
  GDAP_APP_USER_NOT_REGISTERED = "GDAP_APP_USER_NOT_REGISTERED",
  GDAP_SETUP_FAILED = "GDAP_SETUP_FAILED",
  GDAP_ENVIRONMENT_ID_MISSING = "GDAP_ENVIRONMENT_ID_MISSING",

  // Permissions
  PERMISSION_DENIED = "PERMISSION_DENIED",
  PERMISSION_PRIVILEGE_MISSING = "PERMISSION_PRIVILEGE_MISSING",

  // Dataverse
  DATAVERSE_API_ERROR = "DATAVERSE_API_ERROR",
  DATAVERSE_NOT_MEMBER = "DATAVERSE_NOT_MEMBER",
  DATAVERSE_FORBIDDEN = "DATAVERSE_FORBIDDEN",
  DATAVERSE_UNAUTHORIZED = "DATAVERSE_UNAUTHORIZED",

  // Solutions
  SOLUTION_NOT_FOUND = "SOLUTION_NOT_FOUND",
  SOLUTION_IMPORT_FAILED = "SOLUTION_IMPORT_FAILED",
  SOLUTION_EXPORT_FAILED = "SOLUTION_EXPORT_FAILED",
  SOLUTION_PARSE_FAILED = "SOLUTION_PARSE_FAILED",

  // Agent resolution
  AGENT_NOT_FOUND = "AGENT_NOT_FOUND",
  AGENT_URL_INVALID = "AGENT_URL_INVALID",
  AGENT_RESOLUTION_FAILED = "AGENT_RESOLUTION_FAILED",

  // Configuration
  CONFIG_NOT_FOUND = "CONFIG_NOT_FOUND",
  CONFIG_INVALID = "CONFIG_INVALID",
  CONFIG_READ_FAILED = "CONFIG_READ_FAILED",
  CONFIG_PARSE_FAILED = "CONFIG_PARSE_FAILED",
  CONFIG_SECRET_MISSING = "CONFIG_SECRET_MISSING",

  // Network
  NETWORK_CONNECTION_REFUSED = "NETWORK_CONNECTION_REFUSED",
  NETWORK_TIMEOUT = "NETWORK_TIMEOUT",
  NETWORK_DNS_FAILED = "NETWORK_DNS_FAILED",
  NETWORK_ERROR = "NETWORK_ERROR",

  // Queue / Redis
  QUEUE_CONNECTION_FAILED = "QUEUE_CONNECTION_FAILED",

  // Deployment
  DEPLOYMENT_FAILED = "DEPLOYMENT_FAILED",
  DEPLOYMENT_VALIDATION_FAILED = "DEPLOYMENT_VALIDATION_FAILED",
  DEPLOYMENT_TIMEOUT = "DEPLOYMENT_TIMEOUT",

  // Generic
  UNKNOWN = "UNKNOWN",
}

/**
 * Context information attached to structured errors.
 */
export interface AgentSyncErrorContext {
  environmentUrl?: string;
  tenantId?: string;
  tenantName?: string;
  solutionName?: string;
  clientId?: string;
  environmentId?: string;
  [key: string]: unknown;
}

/**
 * Base error class for all AgentSync errors.
 *
 * Extends the native Error with a machine-readable `code` field
 * (from the ErrorCode enum) and optional structured context, so the
 * CLI error handler can switch on `error.code` or use `instanceof`
 * instead of regex-matching message strings.
 */
export class AgentSyncError extends Error {
  readonly name: string = "AgentSyncError";

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly context?: AgentSyncErrorContext,
    options?: { cause?: unknown }
  ) {
    super(message, options);
  }
}

/**
 * Authentication and token errors.
 */
export class AuthError extends AgentSyncError {
  override readonly name = "AuthError";

  constructor(
    code:
      | ErrorCode.AUTH_FAILED
      | ErrorCode.AUTH_TOKEN_EXPIRED
      | ErrorCode.AUTH_APP_NOT_FOUND
      | ErrorCode.AUTH_INVALID_SECRET
      | ErrorCode.AUTH_ACCOUNT_NOT_FOUND
      | ErrorCode.AUTH_INVALID_CLIENT,
    message: string,
    context?: AgentSyncErrorContext,
    options?: { cause?: unknown }
  ) {
    super(code, message, context, options);
  }
}

/**
 * GDAP and application-user setup errors.
 */
export class GdapError extends AgentSyncError {
  override readonly name = "GdapError";

  constructor(
    code:
      | ErrorCode.GDAP_MISSING
      | ErrorCode.GDAP_APP_USER_NOT_REGISTERED
      | ErrorCode.GDAP_SETUP_FAILED
      | ErrorCode.GDAP_ENVIRONMENT_ID_MISSING,
    message: string,
    context?: AgentSyncErrorContext,
    options?: { cause?: unknown }
  ) {
    super(code, message, context, options);
  }
}

/**
 * Dataverse API errors.
 */
export class DataverseApiError extends AgentSyncError {
  override readonly name = "DataverseApiError";

  readonly statusCode?: number;

  constructor(
    code:
      | ErrorCode.DATAVERSE_API_ERROR
      | ErrorCode.DATAVERSE_NOT_MEMBER
      | ErrorCode.DATAVERSE_FORBIDDEN
      | ErrorCode.DATAVERSE_UNAUTHORIZED
      | ErrorCode.PERMISSION_DENIED
      | ErrorCode.PERMISSION_PRIVILEGE_MISSING,
    message: string,
    statusCode?: number,
    context?: AgentSyncErrorContext,
    options?: { cause?: unknown }
  ) {
    super(code, message, context, options);
    this.statusCode = statusCode;
  }
}

/**
 * Solution-related errors.
 */
export class SolutionError extends AgentSyncError {
  override readonly name = "SolutionError";

  constructor(
    code:
      | ErrorCode.SOLUTION_NOT_FOUND
      | ErrorCode.SOLUTION_IMPORT_FAILED
      | ErrorCode.SOLUTION_EXPORT_FAILED
      | ErrorCode.SOLUTION_PARSE_FAILED,
    message: string,
    context?: AgentSyncErrorContext,
    options?: { cause?: unknown }
  ) {
    super(code, message, context, options);
  }
}

/**
 * Agent resolution errors.
 */
export class AgentResolutionError extends AgentSyncError {
  override readonly name = "AgentResolutionError";

  constructor(
    code:
      | ErrorCode.AGENT_NOT_FOUND
      | ErrorCode.AGENT_URL_INVALID
      | ErrorCode.AGENT_RESOLUTION_FAILED,
    message: string,
    context?: AgentSyncErrorContext,
    options?: { cause?: unknown }
  ) {
    super(code, message, context, options);
  }
}

/**
 * Configuration errors.
 */
export class ConfigValidationError extends AgentSyncError {
  override readonly name = "ConfigValidationError";

  constructor(
    code:
      | ErrorCode.CONFIG_NOT_FOUND
      | ErrorCode.CONFIG_INVALID
      | ErrorCode.CONFIG_READ_FAILED
      | ErrorCode.CONFIG_PARSE_FAILED
      | ErrorCode.CONFIG_SECRET_MISSING,
    message: string,
    context?: AgentSyncErrorContext,
    options?: { cause?: unknown }
  ) {
    super(code, message, context, options);
  }
}

/**
 * Network errors.
 */
export class NetworkError extends AgentSyncError {
  override readonly name = "NetworkError";

  constructor(
    code:
      | ErrorCode.NETWORK_CONNECTION_REFUSED
      | ErrorCode.NETWORK_TIMEOUT
      | ErrorCode.NETWORK_DNS_FAILED
      | ErrorCode.NETWORK_ERROR,
    message: string,
    context?: AgentSyncErrorContext,
    options?: { cause?: unknown }
  ) {
    super(code, message, context, options);
  }
}

/**
 * Deployment errors.
 */
export class DeploymentError extends AgentSyncError {
  override readonly name = "DeploymentError";

  constructor(
    code:
      | ErrorCode.DEPLOYMENT_FAILED
      | ErrorCode.DEPLOYMENT_VALIDATION_FAILED
      | ErrorCode.DEPLOYMENT_TIMEOUT,
    message: string,
    context?: AgentSyncErrorContext,
    options?: { cause?: unknown }
  ) {
    super(code, message, context, options);
  }
}

/**
 * Helper to check if an error is an AgentSyncError with a specific code.
 */
export function isErrorCode(error: unknown, code: ErrorCode): boolean {
  return error instanceof AgentSyncError && error.code === code;
}

/**
 * Helper to check if an error is any AgentSyncError.
 */
export function isAgentSyncError(error: unknown): error is AgentSyncError {
  return error instanceof AgentSyncError;
}

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

import chalk from "chalk";
import {
  AgentSyncError as CoreError,
  AuthError,
  GdapError,
  SolutionError,
  AgentResolutionError,
  ConfigValidationError,
  NetworkError,
  ErrorCode,
  isAgentSyncError,
} from "@agentsync/core";

/**
 * Structured CLI error with recovery guidance.
 *
 * This wraps any error (typed or untyped) into a presentation-friendly
 * format with causes, recovery steps, and context for the CLI output.
 */
export class AgentSyncError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly causes: string[],
    public readonly recovery: string[],
    public readonly context?: {
      environmentUrl?: string;
      tenantName?: string;
      solutionName?: string;
      clientId?: string;
    }
  ) {
    super(message);
    this.name = "AgentSyncError";
  }
}

// ---------------------------------------------------------------------------
// Code-based mapping: structured errors from @agentsync/core
// ---------------------------------------------------------------------------

function formatByErrorCode(error: CoreError): AgentSyncError | null {
  const ctx: AgentSyncError["context"] = {
    environmentUrl: error.context?.environmentUrl as string | undefined,
    tenantName: error.context?.tenantName as string | undefined,
    solutionName: error.context?.solutionName as string | undefined,
    clientId: error.context?.clientId as string | undefined,
  };

  // --- GDAP / App-user errors ---
  if (
    error instanceof GdapError ||
    error.code === ErrorCode.GDAP_MISSING ||
    error.code === ErrorCode.GDAP_APP_USER_NOT_REGISTERED ||
    error.code === ErrorCode.GDAP_SETUP_FAILED ||
    error.code === ErrorCode.GDAP_ENVIRONMENT_ID_MISSING
  ) {
    return new AgentSyncError(
      "ERROR_GDAP_MISSING",
      "Application user not registered in Power Platform environment",
      [
        "The application is not configured as a user in the target environment",
        "The app registration may not have been added to the environment yet",
        "GDAP (Granular Delegated Admin Privileges) relationship may not be established",
      ],
      [
        "Go to https://admin.powerplatform.microsoft.com",
        "Select the target environment \u2192 Settings \u2192 Users + permissions \u2192 Application users",
        'Click "+ New app user" and add your application',
        ctx.clientId
          ? `Use Client ID: ${ctx.clientId}`
          : "Use the Client ID from your partner configuration",
        'Assign the "System Administrator" security role',
        "Save and retry the command",
      ],
      ctx
    );
  }

  // --- Permission / privilege errors ---
  if (
    error.code === ErrorCode.PERMISSION_DENIED ||
    error.code === ErrorCode.PERMISSION_PRIVILEGE_MISSING ||
    error.code === ErrorCode.DATAVERSE_FORBIDDEN
  ) {
    return new AgentSyncError(
      "ERROR_INSUFFICIENT_PERMISSIONS",
      "Application user lacks required permissions in Power Platform environment",
      [
        "The application user exists but doesn't have necessary security roles",
        "The System Administrator role may not be assigned",
        "Solution-specific permissions (prvReadSolution, prvWriteSolution, etc.) are missing",
      ],
      [
        "Go to https://admin.powerplatform.microsoft.com",
        "Select the target environment \u2192 Settings \u2192 Users + permissions \u2192 Application users",
        ctx.clientId
          ? `Find your application user (Client ID: ${ctx.clientId})`
          : "Find your application user",
        'Click "Manage security roles" or "Edit"',
        'Ensure "System Administrator" role is assigned',
        "Verify the role includes solution deployment privileges (prvReadSolution, prvWriteSolution, prvCreateSolution)",
        "Save and retry the command",
      ],
      ctx
    );
  }

  // --- Authentication errors ---
  if (
    error instanceof AuthError ||
    error.code === ErrorCode.DATAVERSE_UNAUTHORIZED ||
    error.code === ErrorCode.AUTH_FAILED ||
    error.code === ErrorCode.AUTH_TOKEN_EXPIRED ||
    error.code === ErrorCode.AUTH_APP_NOT_FOUND ||
    error.code === ErrorCode.AUTH_INVALID_SECRET ||
    error.code === ErrorCode.AUTH_ACCOUNT_NOT_FOUND ||
    error.code === ErrorCode.AUTH_INVALID_CLIENT
  ) {
    return new AgentSyncError(
      "ERROR_AUTH_FAILED",
      "Authentication failed - unable to acquire or validate access token",
      [
        "The client secret may have expired",
        "API permissions may not be configured correctly in Azure AD",
        "Admin consent may not have been granted for the required permissions",
      ],
      [
        "Verify the app registration in Azure Portal:",
        "  - Go to https://portal.azure.com \u2192 Azure Active Directory \u2192 App registrations",
        ctx.clientId
          ? `  - Find your app (Client ID: ${ctx.clientId})`
          : "  - Locate your application registration",
        "Check API permissions:",
        '  - Ensure "Dynamics CRM" or "Common Data Service" API permission is added',
        '  - Permission should be "user_impersonation" (delegated) or ".default" (application)',
        '  - Click "Grant admin consent" if not already done',
        "Verify client secret:",
        "  - Check if the secret has expired in the app registration",
        "  - Generate a new secret if needed and update your environment variable (PARTNER_CLIENT_SECRET)",
        "Retry the command",
      ],
      ctx
    );
  }

  // --- Solution not found ---
  if (
    error instanceof SolutionError ||
    error.code === ErrorCode.SOLUTION_NOT_FOUND ||
    error.code === ErrorCode.SOLUTION_IMPORT_FAILED ||
    error.code === ErrorCode.SOLUTION_EXPORT_FAILED
  ) {
    return new AgentSyncError(
      "ERROR_SOLUTION_NOT_FOUND",
      ctx.solutionName
        ? `Solution '${ctx.solutionName}' not found in environment`
        : "Solution not found in environment",
      [
        "The solution may not exist in the source environment",
        "The solution name may be misspelled (names are case-sensitive)",
        "The solution may have been deleted or renamed",
      ],
      [
        ctx.solutionName
          ? `Verify the solution name '${ctx.solutionName}' is correct`
          : "Verify the solution name is correct and matches exactly (case-sensitive)",
        "List available solutions in the source environment:",
        "  agentsync agents list",
        "Check that you're connected to the correct source environment",
        "Ensure the solution is published and visible in the source environment",
        "Retry with the correct solution name",
      ],
      ctx
    );
  }

  // --- Agent resolution errors ---
  if (error instanceof AgentResolutionError) {
    return new AgentSyncError(
      "ERROR_SOLUTION_NOT_FOUND",
      "Could not resolve agent URL to a solution",
      [
        "The agent URL may be invalid or the agent no longer exists",
        "The titleId in the URL may not match any bot in the environment",
        "The M365 Graph API may be needed to resolve this URL format",
      ],
      [
        "Verify the agent URL is correct and the agent is published",
        "List available agents in the source environment:",
        "  agentsync agents list",
        "Try using the solution name directly instead of the agent URL",
      ],
      ctx
    );
  }

  // --- Network errors ---
  if (
    error instanceof NetworkError ||
    error.code === ErrorCode.NETWORK_CONNECTION_REFUSED ||
    error.code === ErrorCode.NETWORK_TIMEOUT ||
    error.code === ErrorCode.NETWORK_DNS_FAILED ||
    error.code === ErrorCode.NETWORK_ERROR
  ) {
    return new AgentSyncError(
      "ERROR_NETWORK",
      "Network connection failed",
      [
        "The target environment URL may be incorrect or unreachable",
        "Network connectivity issues (firewall, proxy, DNS)",
        "The Power Platform environment may be temporarily unavailable",
      ],
      [
        "Verify the environment URL is correct:",
        ctx.environmentUrl
          ? `  Current: ${ctx.environmentUrl}`
          : "  Check your configuration file for the correct URL",
        "Test network connectivity:",
        ctx.environmentUrl
          ? `  curl -I ${ctx.environmentUrl}`
          : "  Use curl or ping to test the environment URL",
        "Check firewall/proxy settings that may block Power Platform endpoints",
        "Verify DNS resolution for the environment hostname",
        "If using a VPN, ensure it's connected and configured properly",
        "Check Power Platform service status: https://admin.powerplatform.microsoft.com/service-health",
        "Retry the command after resolving connectivity issues",
      ],
      ctx
    );
  }

  // --- Config errors ---
  if (
    error instanceof ConfigValidationError ||
    error.code === ErrorCode.CONFIG_NOT_FOUND ||
    error.code === ErrorCode.CONFIG_INVALID ||
    error.code === ErrorCode.CONFIG_READ_FAILED ||
    error.code === ErrorCode.CONFIG_PARSE_FAILED ||
    error.code === ErrorCode.CONFIG_SECRET_MISSING
  ) {
    return new AgentSyncError(
      "ERROR_CONFIG_NOT_FOUND",
      "Configuration file or required resource not found",
      [
        "The configuration file may not exist at the specified path",
        "The working directory may be incorrect",
        "Required files may have been deleted or moved",
      ],
      [
        "Verify you're in the correct directory (should contain config/ folder)",
        "Check if the configuration file exists:",
        "  ls -la ./config/tenants.yaml",
        "If the config file doesn't exist, initialize a new configuration:",
        "  agentsync init",
        "Specify a custom config path with --config flag if needed:",
        "  agentsync deploy --config /path/to/config.yaml ...",
      ],
      ctx
    );
  }

  // Unknown code from core - fall through to regex
  return null;
}

// ---------------------------------------------------------------------------
// Regex-based fallback for untyped errors
// ---------------------------------------------------------------------------

function formatByRegex(error: unknown): AgentSyncError {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorString = errorMessage.toLowerCase();

  // Extract context from error message
  const environmentUrlMatch = errorMessage.match(/environment:?\s+(https?:\/\/[^\s]+)/i);
  const clientIdMatch = errorMessage.match(/client\s+id:?\s+([a-f0-9-]+)/i);

  const context: AgentSyncError["context"] = {};
  if (environmentUrlMatch) {
    context.environmentUrl = environmentUrlMatch[1];
  }
  if (clientIdMatch) {
    context.clientId = clientIdMatch[1];
  }

  // GDAP/App user missing
  if (
    errorString.includes("not a member of the organization") ||
    errorString.includes("not a member of") ||
    errorString.includes("application is not registered")
  ) {
    return new AgentSyncError(
      "ERROR_GDAP_MISSING",
      "Application user not registered in Power Platform environment",
      [
        "The application is not configured as a user in the target environment",
        "The app registration may not have been added to the environment yet",
        "GDAP (Granular Delegated Admin Privileges) relationship may not be established",
      ],
      [
        "Go to https://admin.powerplatform.microsoft.com",
        "Select the target environment \u2192 Settings \u2192 Users + permissions \u2192 Application users",
        'Click "+ New app user" and add your application',
        context.clientId
          ? `Use Client ID: ${context.clientId}`
          : "Use the Client ID from your partner configuration",
        'Assign the "System Administrator" security role',
        "Save and retry the command",
      ],
      context
    );
  }

  // Permission/privilege errors
  if (
    errorString.includes("prvread") ||
    errorString.includes("prvwrite") ||
    errorString.includes("prvcreate") ||
    errorString.includes("prvdelete") ||
    errorString.includes("privilege") ||
    errorString.includes("insufficient") ||
    errorString.includes("access") ||
    errorString.includes("403")
  ) {
    return new AgentSyncError(
      "ERROR_INSUFFICIENT_PERMISSIONS",
      "Application user lacks required permissions in Power Platform environment",
      [
        "The application user exists but doesn't have necessary security roles",
        "The System Administrator role may not be assigned",
        "Solution-specific permissions (prvReadSolution, prvWriteSolution, etc.) are missing",
      ],
      [
        "Go to https://admin.powerplatform.microsoft.com",
        "Select the target environment \u2192 Settings \u2192 Users + permissions \u2192 Application users",
        context.clientId
          ? `Find your application user (Client ID: ${context.clientId})`
          : "Find your application user",
        'Click "Manage security roles" or "Edit"',
        'Ensure "System Administrator" role is assigned',
        "Verify the role includes solution deployment privileges (prvReadSolution, prvWriteSolution, prvCreateSolution)",
        "Save and retry the command",
      ],
      context
    );
  }

  // Authentication/token errors
  if (
    errorString.includes("401") ||
    errorString.includes("unauthorized") ||
    errorString.includes("authentication failed") ||
    errorString.includes("token")
  ) {
    return new AgentSyncError(
      "ERROR_AUTH_FAILED",
      "Authentication failed - unable to acquire or validate access token",
      [
        "The client secret may have expired",
        "API permissions may not be configured correctly in Azure AD",
        "Admin consent may not have been granted for the required permissions",
      ],
      [
        "Verify the app registration in Azure Portal:",
        "  - Go to https://portal.azure.com \u2192 Azure Active Directory \u2192 App registrations",
        context.clientId
          ? `  - Find your app (Client ID: ${context.clientId})`
          : "  - Locate your application registration",
        "Check API permissions:",
        '  - Ensure "Dynamics CRM" or "Common Data Service" API permission is added',
        '  - Permission should be "user_impersonation" (delegated) or ".default" (application)',
        '  - Click "Grant admin consent" if not already done',
        "Verify client secret:",
        "  - Check if the secret has expired in the app registration",
        "  - Generate a new secret if needed and update your environment variable (PARTNER_CLIENT_SECRET)",
        "Retry the command",
      ],
      context
    );
  }

  // Solution not found
  if (
    (errorString.includes("not found") || errorString.includes("404")) &&
    (errorString.includes("solution") || errorString.includes("agent"))
  ) {
    // Try to extract solution name from message
    const solutionMatch = errorMessage.match(/solution\s+'([^']+)'|solution\s+"([^"]+)"/i);
    if (solutionMatch) {
      context.solutionName = solutionMatch[1] || solutionMatch[2];
    }

    return new AgentSyncError(
      "ERROR_SOLUTION_NOT_FOUND",
      context.solutionName
        ? `Solution '${context.solutionName}' not found in environment`
        : "Solution not found in environment",
      [
        "The solution may not exist in the source environment",
        "The solution name may be misspelled (names are case-sensitive)",
        "The solution may have been deleted or renamed",
      ],
      [
        context.solutionName
          ? `Verify the solution name '${context.solutionName}' is correct`
          : "Verify the solution name is correct and matches exactly (case-sensitive)",
        "List available solutions in the source environment:",
        "  agentsync solutions list",
        "Check that you're connected to the correct source environment",
        "Ensure the solution is published and visible in the source environment",
        "Retry with the correct solution name",
      ],
      context
    );
  }

  // Network errors
  if (
    errorString.includes("econnrefused") ||
    errorString.includes("etimedout") ||
    errorString.includes("enotfound") ||
    errorString.includes("network") ||
    errorString.includes("fetch failed")
  ) {
    return new AgentSyncError(
      "ERROR_NETWORK",
      "Network connection failed",
      [
        "The target environment URL may be incorrect or unreachable",
        "Network connectivity issues (firewall, proxy, DNS)",
        "The Power Platform environment may be temporarily unavailable",
      ],
      [
        "Verify the environment URL is correct:",
        context.environmentUrl
          ? `  Current: ${context.environmentUrl}`
          : "  Check your configuration file for the correct URL",
        "Test network connectivity:",
        context.environmentUrl
          ? `  curl -I ${context.environmentUrl}`
          : "  Use curl or ping to test the environment URL",
        "Check firewall/proxy settings that may block Power Platform endpoints",
        "Verify DNS resolution for the environment hostname",
        "If using a VPN, ensure it's connected and configured properly",
        "Check Power Platform service status: https://admin.powerplatform.microsoft.com/service-health",
        "Retry the command after resolving connectivity issues",
      ],
      context
    );
  }

  // Config/file not found
  if (
    errorString.includes("not found") &&
    (errorString.includes("config") ||
      errorString.includes("file") ||
      errorString.includes("enoent"))
  ) {
    return new AgentSyncError(
      "ERROR_CONFIG_NOT_FOUND",
      "Configuration file or required resource not found",
      [
        "The configuration file may not exist at the specified path",
        "The working directory may be incorrect",
        "Required files may have been deleted or moved",
      ],
      [
        "Verify you're in the correct directory (should contain config/ folder)",
        "Check if the configuration file exists:",
        "  ls -la ./config/tenants.yaml",
        "If the config file doesn't exist, initialize a new configuration:",
        "  agentsync init",
        "Specify a custom config path with --config flag if needed:",
        "  agentsync deploy --config /path/to/config.yaml ...",
      ],
      context
    );
  }

  // Generic fallback
  return new AgentSyncError(
    "ERROR_UNKNOWN",
    errorMessage,
    [
      "An unexpected error occurred",
      "The error details are shown above",
      "This may be a temporary issue or a bug in AgentSync",
    ],
    [
      "Review the error message above for specific details",
      "Check the AgentSync documentation for common issues",
      "Verify your configuration and environment setup",
      "Try the command again with --verbose flag for more details (if available)",
      "If the issue persists, please report it on GitHub with the error details",
      "  https://github.com/pax8labs/agentsync/issues",
    ],
    context
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Maps any error to a structured AgentSyncError with recovery guidance.
 *
 * 1. If the error is a typed AgentSyncError from @agentsync/core, the
 *    error code is used to select the appropriate guidance (no regex).
 * 2. Otherwise, falls back to regex matching on the error message.
 */
export function formatError(error: unknown): AgentSyncError {
  // Fast path: structured error from core with a known code
  if (isAgentSyncError(error)) {
    const result = formatByErrorCode(error);
    if (result) {
      return result;
    }
  }

  // Slow path: regex fallback for plain Error / string / unknown
  return formatByRegex(error);
}

/**
 * Prints a formatted error message with recovery guidance
 */
export function printError(error: AgentSyncError): void {
  console.error();
  console.error(chalk.red.bold(`Error: ${error.message}`), chalk.gray(`(${error.code})`));
  console.error();

  // Possible causes
  console.error(chalk.yellow.bold("Possible causes:"));
  error.causes.forEach((cause) => {
    console.error(chalk.yellow(`  \u2022 ${cause}`));
  });
  console.error();

  // Recovery steps
  console.error(chalk.cyan.bold("To fix:"));
  error.recovery.forEach((step, index) => {
    // Check if this is a sub-step (starts with spaces/dash)
    if (step.startsWith("  ")) {
      console.error(chalk.cyan(`    ${step.trim()}`));
    } else {
      console.error(chalk.cyan(`  ${index + 1}. ${step}`));
    }
  });
  console.error();

  // Context information
  if (error.context && Object.keys(error.context).length > 0) {
    console.error(chalk.gray.bold("Context:"));
    if (error.context.environmentUrl) {
      console.error(chalk.gray(`  Environment: ${error.context.environmentUrl}`));
    }
    if (error.context.tenantName) {
      console.error(chalk.gray(`  Tenant: ${error.context.tenantName}`));
    }
    if (error.context.solutionName) {
      console.error(chalk.gray(`  Solution: ${error.context.solutionName}`));
    }
    if (error.context.clientId) {
      console.error(chalk.gray(`  Client ID: ${error.context.clientId}`));
    }
    console.error();
  }
}

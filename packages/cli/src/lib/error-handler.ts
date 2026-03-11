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

import chalk from "chalk";

/**
 * Structured error with recovery guidance
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

/**
 * Maps common error patterns to structured AgentSyncError instances
 */
export function formatError(error: unknown): AgentSyncError {
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
        "Select the target environment → Settings → Users + permissions → Application users",
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
        "Select the target environment → Settings → Users + permissions → Application users",
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
        "  - Go to https://portal.azure.com → Azure Active Directory → App registrations",
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
        "  agentsync agents list",
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

  // Redis/queue connection errors
  if (
    errorString.includes("redis") ||
    errorString.includes("queue") ||
    (errorString.includes("connection") && errorString.includes("refused"))
  ) {
    return new AgentSyncError(
      "ERROR_QUEUE_CONNECTION",
      "Failed to connect to deployment queue (Redis)",
      [
        "Redis server may not be running",
        "Redis connection URL may be incorrect",
        "Network/firewall may be blocking the connection",
      ],
      [
        "Verify Redis is running:",
        "  redis-cli ping",
        "Start Redis if not running:",
        "  redis-server",
        "Check the Redis URL in your command or environment:",
        "  Default: redis://localhost:6379",
        "Verify network connectivity to Redis host",
        "Retry the command with correct Redis URL:",
        "  agentsync deploy --redis redis://localhost:6379 ...",
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
    console.error(chalk.yellow(`  • ${cause}`));
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

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

import { CLI_NAME } from "../constants.js";

/**
 * Auth Error Parser
 *
 * Parses common Azure AD / Dataverse authentication errors into
 * user-friendly messages with actionable fix suggestions.
 *
 * Extracted from CLI validate.ts and init.ts to make this logic
 * reusable across CLI, MCP server, and web consumers.
 */

export interface ParsedAuthError {
  message: string;
  fix: string;
}

/**
 * Parse common Azure/Dataverse errors into user-friendly messages with fixes.
 *
 * Handles AADSTS error codes, permission errors, token acquisition failures,
 * and other common authentication issues encountered during GDAP operations.
 */
export function parseAuthError(errorMsg: string): ParsedAuthError {
  // Invalid client secret
  if (errorMsg.includes("AADSTS7000215") || errorMsg.includes("Invalid client secret")) {
    return {
      message: "Invalid client secret",
      fix: "Ensure PARTNER_CLIENT_SECRET contains the secret value (not the secret ID). Generate a new secret in Azure Portal if needed.",
    };
  }

  // Client secret expired
  if (errorMsg.includes("AADSTS7000222") || errorMsg.includes("expired")) {
    return {
      message: "Client secret has expired",
      fix: "Generate a new client secret in Azure Portal → App registrations → Your app → Certificates & secrets",
    };
  }

  // App not found
  if (errorMsg.includes("AADSTS700016") || errorMsg.includes("Application.*not found")) {
    return {
      message: "Application not found in Azure AD",
      fix: "Verify the PARTNER_CLIENT_ID is correct. Check Azure Portal → App registrations.",
    };
  }

  // Tenant not found
  if (errorMsg.includes("AADSTS90002") || errorMsg.includes("tenant.*not found")) {
    return {
      message: "Tenant not found",
      fix: "Verify the PARTNER_TENANT_ID is correct. Check Azure Portal → Azure Active Directory → Overview.",
    };
  }

  // Not a member of organization (GDAP/app user issue)
  if (
    errorMsg.includes("not a member of the organization") ||
    errorMsg.includes("is not a member")
  ) {
    return {
      message: "App not registered in environment",
      fix: `Create app user in Power Platform Admin Center, or run '${CLI_NAME} setup --all'`,
    };
  }

  // Permission denied
  if (
    errorMsg.includes("prvRead") ||
    errorMsg.includes("prvWrite") ||
    errorMsg.includes("privilege") ||
    errorMsg.includes("403")
  ) {
    return {
      message: "Insufficient permissions",
      fix: "Assign System Administrator role to the app user in Power Platform Admin Center",
    };
  }

  // Token acquisition failed (generic)
  if (errorMsg.includes("Token acquisition failed")) {
    // Extract the AADSTS code if present
    const aadstsMatch = errorMsg.match(/AADSTS\d+/);
    if (aadstsMatch) {
      return {
        message: `Authentication failed (${aadstsMatch[0]})`,
        fix: "Check Azure AD app configuration. Verify client ID, tenant ID, and secret are correct.",
      };
    }
    return {
      message: "Authentication failed",
      fix: `Check client credentials. Run '${CLI_NAME} auth status' to verify configuration.`,
    };
  }

  // Default: return first line of error
  return {
    message: errorMsg.split("\n")[0].slice(0, 100),
    fix: "Check the error message above and verify your configuration",
  };
}

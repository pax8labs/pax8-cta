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

import { TokenManager } from "../auth/token-manager.js";
import { DataverseApiError, ErrorCode, GdapError } from "../errors.js";
import { coreLogger } from "../services/logger.js";

/**
 * Extract Microsoft diagnostic/correlation headers from a Dataverse response.
 * These IDs let you cross-reference errors with Microsoft service health
 * dashboards and support tickets.
 */
function extractMsHeaders(response: Response): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const key of [
    "x-ms-request-id",
    "x-ms-ags-diagnostic",
    "x-ms-service-request-id",
    "REQ_ID",
  ]) {
    const value = response.headers.get(key);
    if (value) {
      headers[key] = value;
    }
  }
  return headers;
}

export interface DataverseClientConfig {
  environmentUrl: string;
  tokenManager: TokenManager;
  clientId?: string;
}

export interface DataverseError {
  code: string;
  message: string;
  innererror?: {
    message: string;
    type: string;
    stacktrace: string;
  };
}

export interface ErrorContext {
  operation?: string;
  environmentUrl?: string;
  clientId?: string;
}

/**
 * Format Dataverse errors with helpful guidance for common authentication issues.
 *
 * Throws a typed error (DataverseApiError or GdapError) instead of
 * returning a plain string, so callers can switch on error.code.
 */
export function throwDataverseError(
  error: DataverseError,
  statusCode: number,
  context?: ErrorContext
): never {
  const errorMessage = error.message;
  const innerMessage = error.innererror?.message || "";
  const fullMessage = `${errorMessage}${innerMessage ? ` - ${innerMessage}` : ""}`;

  const errorContext = {
    environmentUrl: context?.environmentUrl,
    clientId: context?.clientId,
  };

  // Check for common S2S authentication patterns
  const isNotMemberError =
    /user is not a member of the organization/i.test(fullMessage) ||
    /not a member of.*environment/i.test(fullMessage);

  if (isNotMemberError) {
    let helpfulMessage = `Authentication failed: ${fullMessage}\n`;
    helpfulMessage += `\nThe application is not registered as a user in the Power Platform environment.\n`;
    helpfulMessage += `\nTo fix:\n`;
    helpfulMessage += `1. Go to https://admin.powerplatform.microsoft.com\n`;
    helpfulMessage += `2. Select the environment → Settings → Users + permissions → Application users\n`;
    helpfulMessage += `3. Click "+ New app user" and add your application\n`;
    if (context?.clientId) {
      helpfulMessage += `   Client ID: ${context.clientId}\n`;
    }
    helpfulMessage += `4. Assign the "System Administrator" security role\n`;
    helpfulMessage += `5. Save and retry the command\n`;
    if (context?.environmentUrl) {
      helpfulMessage += `\nEnvironment: ${context.environmentUrl}`;
    }
    throw new GdapError(ErrorCode.GDAP_APP_USER_NOT_REGISTERED, helpfulMessage, errorContext);
  }

  const isPrivilegeError =
    /prvRead/i.test(fullMessage) ||
    /prvWrite/i.test(fullMessage) ||
    /prvCreate/i.test(fullMessage) ||
    /prvDelete/i.test(fullMessage) ||
    /insufficient.*privilege/i.test(fullMessage) ||
    /missing privilege/i.test(fullMessage) ||
    /access.*denied/i.test(fullMessage);

  const isForbiddenError = statusCode === 403;
  const isUnauthorizedError = statusCode === 401;

  if (isPrivilegeError || isForbiddenError) {
    let helpfulMessage = `Authentication failed: ${fullMessage}\n`;
    helpfulMessage += `\nThe application lacks required permissions in the Power Platform environment.\n`;
    helpfulMessage += `\nTo fix:\n`;
    helpfulMessage += `1. Go to https://admin.powerplatform.microsoft.com\n`;
    helpfulMessage += `2. Select the environment → Settings → Users + permissions → Application users\n`;
    helpfulMessage += `3. Find your application user`;
    if (context?.clientId) {
      helpfulMessage += ` (Client ID: ${context.clientId})`;
    }
    helpfulMessage += `\n`;
    helpfulMessage += `4. Click "Manage security roles" or "Edit"\n`;
    helpfulMessage += `5. Ensure "System Administrator" role is assigned\n`;
    helpfulMessage += `   (Required privileges: prvReadSolution, prvWriteSolution, prvCreateSolution, etc.)\n`;
    helpfulMessage += `6. Save and retry the command\n`;
    if (context?.environmentUrl) {
      helpfulMessage += `\nEnvironment: ${context.environmentUrl}`;
    }
    throw new DataverseApiError(
      isPrivilegeError ? ErrorCode.PERMISSION_PRIVILEGE_MISSING : ErrorCode.DATAVERSE_FORBIDDEN,
      helpfulMessage,
      statusCode,
      errorContext
    );
  }

  if (isUnauthorizedError) {
    let helpfulMessage = `Authentication failed: ${fullMessage}\n`;
    helpfulMessage += `\nAuthentication token could not be acquired or is invalid.\n`;
    helpfulMessage += `\nTo fix:\n`;
    helpfulMessage += `1. Verify the app registration in Azure Portal:\n`;
    helpfulMessage += `   - Go to https://portal.azure.com → Azure Active Directory → App registrations\n`;
    if (context?.clientId) {
      helpfulMessage += `   - Find your app (Client ID: ${context.clientId})\n`;
    }
    helpfulMessage += `2. Check API permissions:\n`;
    helpfulMessage += `   - Ensure "Dynamics CRM" or "Common Data Service" permission is added\n`;
    helpfulMessage += `   - Permission type: "user_impersonation" (delegated) or ".default" (application)\n`;
    helpfulMessage += `   - Verify "Grant admin consent" has been clicked\n`;
    helpfulMessage += `3. Verify client secret:\n`;
    helpfulMessage += `   - Check if the secret has expired\n`;
    helpfulMessage += `   - Generate a new secret if needed and update your configuration\n`;
    helpfulMessage += `4. Retry the command\n`;
    if (context?.environmentUrl) {
      helpfulMessage += `\nEnvironment: ${context.environmentUrl}`;
    }
    throw new DataverseApiError(
      ErrorCode.DATAVERSE_UNAUTHORIZED,
      helpfulMessage,
      statusCode,
      errorContext
    );
  }

  // Generic Dataverse API error
  let helpfulMessage = `Dataverse API error: ${fullMessage}`;
  if (context?.environmentUrl) {
    helpfulMessage += `\nEnvironment: ${context.environmentUrl}`;
  }
  throw new DataverseApiError(
    ErrorCode.DATAVERSE_API_ERROR,
    helpfulMessage,
    statusCode,
    errorContext
  );
}

/**
 * Format Dataverse errors with helpful guidance for common authentication issues.
 *
 * @deprecated Use throwDataverseError() instead. This is kept for backwards
 * compatibility but will be removed in a future release.
 */
export function formatDataverseError(
  error: DataverseError,
  statusCode: number,
  context?: ErrorContext
): string {
  try {
    throwDataverseError(error, statusCode, context);
  } catch (e) {
    if (e instanceof Error) {
      return e.message;
    }
    return String(e);
  }
  // Unreachable, but TypeScript needs it
  return "";
}

/**
 * Low-level client for Dataverse Web API
 */
export class DataverseClient {
  private readonly apiUrl: string;

  constructor(private config: DataverseClientConfig) {
    const baseUrl = config.environmentUrl.replace(/\/$/, "");
    this.apiUrl = `${baseUrl}/api/data/v9.2`;
  }

  /**
   * Make a GET request to the Dataverse API
   */
  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.apiUrl}${path}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }

    const response = await this.fetch(url.toString(), { method: "GET" });
    return response.json() as Promise<T>;
  }

  /**
   * Make a POST request to the Dataverse API
   */
  async post<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetch(`${this.apiUrl}${path}`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    const text = await response.text();
    return (text ? JSON.parse(text) : null) as T;
  }

  /**
   * Make a PATCH request to the Dataverse API
   */
  async patch<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetch(`${this.apiUrl}${path}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });

    const text = await response.text();
    return (text ? JSON.parse(text) : null) as T;
  }

  /**
   * Make a DELETE request to the Dataverse API
   */
  async delete(path: string): Promise<void> {
    await this.fetch(`${this.apiUrl}${path}`, {
      method: "DELETE",
    });
  }

  /**
   * Execute a Dataverse action (unbound)
   */
  async executeAction<TRequest, TResponse>(
    actionName: string,
    parameters: TRequest
  ): Promise<TResponse> {
    return this.post<TResponse>(`/${actionName}`, parameters);
  }

  /**
   * Get the raw response for actions that return binary data (like solution export)
   */
  async executeActionRaw(actionName: string, parameters: unknown): Promise<Response> {
    const token = await this.config.tokenManager.getDataverseToken(this.config.environmentUrl);
    const start = Date.now();
    const url = `${this.apiUrl}/${actionName}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
      },
      body: JSON.stringify(parameters),
    });

    const durationMs = Date.now() - start;
    const msHeaders = extractMsHeaders(response);

    if (!response.ok) {
      coreLogger.warn("Dataverse raw action error", {
        action: actionName,
        status: response.status,
        durationMs,
        environmentUrl: this.config.environmentUrl,
        ...msHeaders,
      });
      await this.handleError(response);
    }

    coreLogger.debug("Dataverse raw action", {
      action: actionName,
      status: response.status,
      durationMs,
      ...msHeaders,
    });

    return response;
  }

  /**
   * Query solutions in the environment
   */
  async querySolutions(): Promise<SolutionRecord[]> {
    const result = await this.get<{ value: SolutionRecord[] }>("/solutions", {
      $select: "solutionid,uniquename,friendlyname,version,ismanaged",
      $filter: "isvisible eq true",
      $orderby: "friendlyname asc",
    });
    return result.value;
  }

  /**
   * Get a specific solution by unique name
   */
  async getSolutionByName(uniqueName: string): Promise<SolutionRecord | null> {
    const result = await this.get<{ value: SolutionRecord[] }>("/solutions", {
      $select: "solutionid,uniquename,friendlyname,version,ismanaged,publisherid",
      $filter: `uniquename eq '${uniqueName}'`,
    });
    return result.value[0] || null;
  }

  private async fetch(url: string, options: RequestInit): Promise<Response> {
    const token = await this.config.tokenManager.getDataverseToken(this.config.environmentUrl);
    const start = Date.now();

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        ...options.headers,
      },
    });

    const durationMs = Date.now() - start;
    const msHeaders = extractMsHeaders(response);

    if (!response.ok) {
      coreLogger.warn("Dataverse API error response", {
        method: options.method,
        url,
        status: response.status,
        durationMs,
        environmentUrl: this.config.environmentUrl,
        ...msHeaders,
      });
      await this.handleError(response);
    }

    coreLogger.debug("Dataverse API call", {
      method: options.method,
      url,
      status: response.status,
      durationMs,
      ...msHeaders,
    });

    return response;
  }

  private async handleError(response: Response): Promise<never> {
    try {
      const errorBody = (await response.json()) as { error?: DataverseError };
      if (errorBody.error) {
        // Throws a typed error (DataverseApiError, GdapError, etc.)
        throwDataverseError(errorBody.error, response.status, {
          environmentUrl: this.config.environmentUrl,
          clientId: this.config.clientId,
        });
      }
    } catch (e) {
      // Re-throw typed errors from throwDataverseError
      if (e instanceof DataverseApiError || e instanceof GdapError) {
        throw e;
      }
      // Ignore JSON parse errors - fall back to basic error
    }

    throw new DataverseApiError(
      ErrorCode.DATAVERSE_API_ERROR,
      `Dataverse API error: ${response.status} ${response.statusText}`,
      response.status,
      {
        environmentUrl: this.config.environmentUrl,
        clientId: this.config.clientId,
      }
    );
  }
}

export interface SolutionRecord {
  solutionid: string;
  uniquename: string;
  friendlyname: string;
  version: string;
  ismanaged: boolean;
  publisherid?: {
    publisherid: string;
    uniquename: string;
    friendlyname: string;
  };
}

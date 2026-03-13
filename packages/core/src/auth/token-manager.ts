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

import {
  ConfidentialClientApplication,
  Configuration,
  AuthenticationResult,
} from "@azure/msal-node";
import { AuthError, ErrorCode } from "../errors.js";

export interface TokenManagerConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

interface CachedToken {
  accessToken: string;
  expiresAt: Date;
}

/**
 * Manages OAuth tokens with caching and automatic refresh
 */
export class TokenManager {
  private msalClient: ConfidentialClientApplication;
  private tokenCache: Map<string, CachedToken> = new Map();
  private readonly TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes before expiry
  private readonly config: TokenManagerConfig;

  constructor(config: TokenManagerConfig) {
    this.config = config;
    const msalConfig: Configuration = {
      auth: {
        clientId: config.clientId,
        authority: `https://login.microsoftonline.com/${config.tenantId}`,
        clientSecret: config.clientSecret,
      },
    };
    this.msalClient = new ConfidentialClientApplication(msalConfig);
  }

  /**
   * Get the client ID for this token manager
   */
  getClientId(): string {
    return this.config.clientId;
  }

  /**
   * Get an access token for the specified resource/scope
   * Tokens are cached and automatically refreshed when near expiry
   */
  async getToken(scopes: string[]): Promise<string> {
    const cacheKey = scopes.sort().join(",");
    const cached = this.tokenCache.get(cacheKey);

    if (cached && !this.isTokenExpired(cached)) {
      return cached.accessToken;
    }

    const result = await this.acquireToken(scopes);
    this.cacheToken(cacheKey, result);
    return result.accessToken;
  }

  /**
   * Get a token for Dataverse API access
   */
  async getDataverseToken(environmentUrl: string): Promise<string> {
    // Dataverse scope is the environment URL with /.default
    const baseUrl = environmentUrl.replace(/\/$/, "");
    const scopes = [`${baseUrl}/.default`];
    return this.getToken(scopes);
  }

  /**
   * Get a token for Microsoft Graph API access
   */
  async getGraphToken(): Promise<string> {
    return this.getToken(["https://graph.microsoft.com/.default"]);
  }

  /**
   * Clear all cached tokens
   */
  clearCache(): void {
    this.tokenCache.clear();
  }

  private async acquireToken(scopes: string[]): Promise<AuthenticationResult> {
    try {
      const result = await this.msalClient.acquireTokenByClientCredential({
        scopes,
      });

      if (!result) {
        throw new AuthError(ErrorCode.AUTH_FAILED, "Failed to acquire token - no result returned", {
          clientId: this.config.clientId,
        });
      }

      return result;
    } catch (error) {
      // Re-throw if already a typed error
      if (error instanceof AuthError) {
        throw error;
      }

      const errorString = String(error);
      const context = { clientId: this.config.clientId, tenantId: this.config.tenantId };

      // Check for common authentication errors
      if (/AADSTS700016/i.test(errorString)) {
        throw new AuthError(
          ErrorCode.AUTH_APP_NOT_FOUND,
          `Token acquisition failed: ${error instanceof Error ? error.message : String(error)}\n\n` +
            `The application (Client ID: ${this.config.clientId}) is not registered in the tenant.\n` +
            `\nTo fix:\n` +
            `1. Verify the Client ID in your configuration\n` +
            `2. Go to https://portal.azure.com → Azure Active Directory → App registrations\n` +
            `3. Ensure the app is registered in the correct tenant\n` +
            `4. Check that the app has not been deleted`,
          context,
          { cause: error }
        );
      } else if (/AADSTS7000215/i.test(errorString)) {
        throw new AuthError(
          ErrorCode.AUTH_INVALID_SECRET,
          `Token acquisition failed: ${error instanceof Error ? error.message : String(error)}\n\n` +
            `The client secret for application (Client ID: ${this.config.clientId}) is invalid.\n` +
            `\nTo fix:\n` +
            `1. Go to https://portal.azure.com → Azure Active Directory → App registrations\n` +
            `2. Find your application and go to "Certificates & secrets"\n` +
            `3. Generate a new client secret\n` +
            `4. Update your configuration with the new secret\n` +
            `5. Note: Secrets expire - check the expiration date`,
          context,
          { cause: error }
        );
      } else if (/AADSTS50034/i.test(errorString)) {
        throw new AuthError(
          ErrorCode.AUTH_ACCOUNT_NOT_FOUND,
          `Token acquisition failed: ${error instanceof Error ? error.message : String(error)}\n\n` +
            `The application (Client ID: ${this.config.clientId}) account does not exist in tenant ${this.config.tenantId}.\n` +
            `\nTo fix:\n` +
            `1. Verify the Tenant ID in your configuration\n` +
            `2. Ensure the application is registered in the correct Azure AD tenant`,
          context,
          { cause: error }
        );
      } else if (/invalid_client/i.test(errorString)) {
        throw new AuthError(
          ErrorCode.AUTH_INVALID_CLIENT,
          `Token acquisition failed: ${error instanceof Error ? error.message : String(error)}\n\n` +
            `Authentication credentials are invalid for application (Client ID: ${this.config.clientId}).\n` +
            `\nTo fix:\n` +
            `1. Verify Client ID and Client Secret are correct\n` +
            `2. Check if the client secret has expired\n` +
            `3. Ensure the application has the required API permissions:\n` +
            `   - For Power Platform: "Dynamics CRM" → "user_impersonation"\n` +
            `   - Click "Grant admin consent" after adding permissions`,
          context,
          { cause: error }
        );
      }

      // Generic auth failure
      throw new AuthError(
        ErrorCode.AUTH_FAILED,
        `Token acquisition failed: ${error instanceof Error ? error.message : String(error)}`,
        context,
        { cause: error }
      );
    }
  }

  private cacheToken(key: string, result: AuthenticationResult): void {
    this.tokenCache.set(key, {
      accessToken: result.accessToken,
      expiresAt: result.expiresOn || new Date(Date.now() + 3600 * 1000),
    });
  }

  private isTokenExpired(cached: CachedToken): boolean {
    const now = Date.now();
    const expiresAt = cached.expiresAt.getTime();
    return now >= expiresAt - this.TOKEN_REFRESH_BUFFER_MS;
  }
}

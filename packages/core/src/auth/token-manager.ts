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

  constructor(config: TokenManagerConfig) {
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
    const result = await this.msalClient.acquireTokenByClientCredential({
      scopes,
    });

    if (!result) {
      throw new Error("Failed to acquire token - no result returned");
    }

    return result;
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

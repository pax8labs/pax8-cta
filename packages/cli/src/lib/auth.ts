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
  PublicClientApplication,
  DeviceCodeRequest,
  AuthenticationResult,
  LogLevel,
} from "@azure/msal-node";
import * as keytar from "keytar";

const KEYTAR_SERVICE = "agentsync-cli";

export interface InteractiveLoginResult {
  accessToken: string;
  tenantId: string;
  accountId: string;
  expiresOn: Date;
}

/**
 * Perform interactive device code login for Microsoft authentication
 * Opens user's browser for authentication
 */
export async function interactiveLogin(options?: {
  clientId?: string;
  tenantId?: string;
  scopes?: string[];
}): Promise<InteractiveLoginResult> {
  // Use Microsoft CLI client ID if not provided (allows public client auth)
  const clientId = options?.clientId || "04b07795-8ddb-461a-bbee-02f9e1bf7b46";
  const tenantId = options?.tenantId || "common";
  const scopes = options?.scopes || [
    "https://graph.microsoft.com/.default",
    "https://api.powerplatform.com/.default",
  ];

  const msalConfig = {
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
    },
    system: {
      loggerOptions: {
        logLevel: LogLevel.Error,
        piiLoggingEnabled: false,
      },
    },
  };

  const pca = new PublicClientApplication(msalConfig);

  const deviceCodeRequest: DeviceCodeRequest = {
    deviceCodeCallback: (response: {
      message: string;
      userCode: string;
      verificationUri: string;
    }) => {
      // Format the device code message nicely
      console.log(`  1. Open: ${response.verificationUri}`);
      console.log(`  2. Enter code: ${response.userCode}`);
      console.log();
      console.log("  Waiting for you to sign in...");
    },
    scopes,
  };

  try {
    const response: AuthenticationResult | null =
      await pca.acquireTokenByDeviceCode(deviceCodeRequest);

    if (!response) {
      throw new Error("No authentication result returned");
    }

    return {
      accessToken: response.accessToken,
      tenantId: response.tenantId || tenantId,
      accountId: response.account?.homeAccountId || "",
      expiresOn: response.expiresOn || new Date(Date.now() + 3600 * 1000),
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Authentication failed: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Store credentials securely in the OS keychain
 */
export async function storeCredentials(
  clientId: string,
  clientSecret: string,
  tenantId?: string
): Promise<void> {
  try {
    // Store client secret
    await keytar.setPassword(KEYTAR_SERVICE, `clientSecret:${clientId}`, clientSecret);

    // Store tenant ID if provided
    if (tenantId) {
      await keytar.setPassword(KEYTAR_SERVICE, `tenantId:${clientId}`, tenantId);
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to store credentials: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Retrieve stored credentials from the OS keychain
 */
export async function getStoredCredentials(
  clientId: string
): Promise<{ clientSecret: string; tenantId?: string } | null> {
  try {
    const clientSecret = await keytar.getPassword(KEYTAR_SERVICE, `clientSecret:${clientId}`);

    if (!clientSecret) {
      return null;
    }

    const tenantId = await keytar.getPassword(KEYTAR_SERVICE, `tenantId:${clientId}`);

    return {
      clientSecret,
      tenantId: tenantId || undefined,
    };
  } catch (error) {
    // Return null if keychain is not available (e.g., in some CI environments)
    return null;
  }
}

/**
 * Remove credentials from the OS keychain
 */
export async function clearCredentials(clientId: string): Promise<void> {
  try {
    await keytar.deletePassword(KEYTAR_SERVICE, `clientSecret:${clientId}`);
    await keytar.deletePassword(KEYTAR_SERVICE, `tenantId:${clientId}`);
  } catch (error) {
    // Ignore errors when clearing (credential may not exist)
  }
}

/**
 * Check if credentials exist in the keychain
 */
export async function hasStoredCredentials(clientId: string): Promise<boolean> {
  try {
    const creds = await getStoredCredentials(clientId);
    return creds !== null;
  } catch {
    return false;
  }
}

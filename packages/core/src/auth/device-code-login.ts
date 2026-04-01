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

import {
  PublicClientApplication,
  DeviceCodeRequest,
  AuthenticationResult,
  LogLevel,
} from "@azure/msal-node";

export interface DeviceCodeLoginOptions {
  clientId?: string;
  tenantId?: string;
  scopes?: string[];
  deviceCodeCallback: (response: {
    message: string;
    userCode: string;
    verificationUri: string;
  }) => void;
}

export interface DeviceCodeLoginResult {
  accessToken: string;
  tenantId: string;
  accountId: string;
  expiresOn: Date;
}

/**
 * Perform interactive device code login for Microsoft authentication.
 *
 * Uses MSAL's PublicClientApplication to acquire a token via the device code
 * flow. The caller provides a callback to display the user code and
 * verification URI (e.g. printing to the terminal or showing a UI prompt).
 */
export async function deviceCodeLogin(
  options: DeviceCodeLoginOptions
): Promise<DeviceCodeLoginResult> {
  const clientId = options.clientId || "04b07795-8ddb-461a-bbee-02f9e1bf7b46";
  const tenantId = options.tenantId || "common";
  const scopes = options.scopes || [
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
    deviceCodeCallback: options.deviceCodeCallback,
    scopes,
  };

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
}

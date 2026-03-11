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

import fetch from "node-fetch";

export interface AppRegistration {
  id: string;
  appId: string;
  displayName: string;
  signInAudience: string;
}

export interface ClientSecretResult {
  secretId: string;
  secretText: string;
  displayName: string;
  endDateTime: string;
}

export interface GraphClientConfig {
  accessToken: string;
}

/**
 * Microsoft Graph API client for managing Azure AD app registrations
 */
export class GraphClient {
  private accessToken: string;
  private readonly baseUrl = "https://graph.microsoft.com/v1.0";

  constructor(config: GraphClientConfig) {
    this.accessToken = config.accessToken;
  }

  /**
   * Create a new app registration in Azure AD
   */
  async createAppRegistration(displayName: string): Promise<AppRegistration> {
    const response = await fetch(`${this.baseUrl}/applications`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        displayName,
        signInAudience: "AzureADMultipleOrgs",
        requiredResourceAccess: [
          {
            // Microsoft Graph
            resourceAppId: "00000003-0000-0000-c000-000000000000",
            resourceAccess: [
              {
                // User.Read (delegated)
                id: "e1fe6dd8-ba31-4d61-89e7-88639da4683d",
                type: "Scope",
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create app registration: ${response.status} ${error}`);
    }

    const app = (await response.json()) as AppRegistration;
    return app;
  }

  /**
   * Find existing app registration by display name
   */
  async findExistingApp(displayName: string): Promise<AppRegistration | null> {
    const response = await fetch(
      `${this.baseUrl}/applications?$filter=displayName eq '${encodeURIComponent(displayName)}'`,
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to search for app: ${response.status} ${error}`);
    }

    const data = (await response.json()) as { value: AppRegistration[] };
    return data.value.length > 0 ? data.value[0] : null;
  }

  /**
   * Add Dynamics CRM API permission to an app
   */
  async addDynamicsPermission(appObjectId: string): Promise<void> {
    // First, get the current app to preserve existing permissions
    const getResponse = await fetch(`${this.baseUrl}/applications/${appObjectId}`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!getResponse.ok) {
      throw new Error(`Failed to get app: ${getResponse.status}`);
    }

    const currentApp = (await getResponse.json()) as {
      requiredResourceAccess: Array<{
        resourceAppId: string;
        resourceAccess: Array<{ id: string; type: string }>;
      }>;
    };

    // Add Dynamics CRM permission
    const dynamicsResourceId = "00000007-0000-0000-c000-000000000000"; // Dynamics CRM
    const userImpersonationId = "78ce3f0f-a1ce-49c2-8cde-64b5c0896db4"; // user_impersonation

    const existingPermissions = currentApp.requiredResourceAccess || [];

    // Check if Dynamics permission already exists
    const dynamicsPermission = existingPermissions.find(
      (p) => p.resourceAppId === dynamicsResourceId
    );

    if (dynamicsPermission) {
      // Add user_impersonation if not present
      if (!dynamicsPermission.resourceAccess.find((ra) => ra.id === userImpersonationId)) {
        dynamicsPermission.resourceAccess.push({
          id: userImpersonationId,
          type: "Scope",
        });
      }
    } else {
      // Add new Dynamics CRM permission
      existingPermissions.push({
        resourceAppId: dynamicsResourceId,
        resourceAccess: [
          {
            id: userImpersonationId,
            type: "Scope",
          },
        ],
      });
    }

    // Update the app
    const patchResponse = await fetch(`${this.baseUrl}/applications/${appObjectId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requiredResourceAccess: existingPermissions,
      }),
    });

    if (!patchResponse.ok) {
      const error = await patchResponse.text();
      throw new Error(`Failed to add Dynamics permission: ${patchResponse.status} ${error}`);
    }
  }

  /**
   * Grant admin consent for app permissions
   * Note: This requires admin privileges and may not work for all users
   */
  async grantAdminConsent(appId: string): Promise<void> {
    // Note: Admin consent typically requires interactive consent flow
    // This is a placeholder - actual implementation would need OAuth consent URL
    const consentUrl = `https://login.microsoftonline.com/organizations/v2.0/adminconsent?client_id=${appId}&scope=https://api.businesscentral.dynamics.com/.default`;

    throw new Error(
      `Admin consent required. Please visit: ${consentUrl}\n\nOr ask your IT admin to grant consent.`
    );
  }

  /**
   * Create a new client secret for the app
   */
  async createClientSecret(
    appObjectId: string,
    description: string,
    validityMonths: number = 24
  ): Promise<ClientSecretResult> {
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + validityMonths);

    const response = await fetch(`${this.baseUrl}/applications/${appObjectId}/addPassword`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        passwordCredential: {
          displayName: description,
          endDateTime: endDate.toISOString(),
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create client secret: ${response.status} ${error}`);
    }

    const result = (await response.json()) as {
      secretText: string;
      keyId: string;
      displayName: string;
      endDateTime: string;
    };

    return {
      secretId: result.keyId,
      secretText: result.secretText,
      displayName: result.displayName,
      endDateTime: result.endDateTime,
    };
  }

  /**
   * Get service principal for an app (needed for some operations)
   */
  async getServicePrincipal(appId: string): Promise<{ id: string } | null> {
    const response = await fetch(`${this.baseUrl}/servicePrincipals?$filter=appId eq '${appId}'`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { value: Array<{ id: string }> };
    return data.value.length > 0 ? data.value[0] : null;
  }

  /**
   * Create service principal for an app if it doesn't exist
   */
  async ensureServicePrincipal(appId: string): Promise<string> {
    const existing = await this.getServicePrincipal(appId);
    if (existing) {
      return existing.id;
    }

    const response = await fetch(`${this.baseUrl}/servicePrincipals`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        appId,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create service principal: ${response.status} ${error}`);
    }

    const result = (await response.json()) as { id: string };
    return result.id;
  }
}

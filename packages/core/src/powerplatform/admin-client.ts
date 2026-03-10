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

import { TokenManager } from "../auth/token-manager.js";

export interface PowerPlatformAdminConfig {
  tokenManager: TokenManager;
}

/**
 * Power Platform environment from the Admin API
 */
export interface PowerPlatformEnvironment {
  id: string;
  name: string;
  type: string;
  location: string;
  properties: {
    displayName: string;
    description?: string;
    createdTime: string;
    createdBy?: {
      id: string;
      displayName?: string;
      type?: string;
    };
    lastModifiedTime?: string;
    provisioningState: string;
    creationType?: string;
    environmentSku: "Sandbox" | "Production" | "Trial" | "Default" | "Developer";
    isDefault: boolean;
    clientUris?: {
      admin?: string;
      maker?: string;
    };
    runtimeEndpoints?: {
      microsoft_BusinessAppPlatform_linkedEnvironmentMetadata_instanceUrl?: string;
      microsoft_BusinessAppPlatform_linkedEnvironmentMetadata_instanceApiUrl?: string;
    };
    linkedEnvironmentMetadata?: {
      type: string;
      resourceId: string;
      friendlyName: string;
      uniqueName: string;
      domainName: string;
      version: string;
      instanceUrl: string;
      instanceApiUrl: string;
      baseLanguage: number;
      instanceState: string;
      createdTime: string;
      platformSku?: string;
    };
    capacity?: EnvironmentCapacity[];
    addons?: EnvironmentAddon[];
    states?: {
      management?: {
        id: string;
      };
      runtime?: {
        id: string;
      };
    };
    governanceConfiguration?: {
      protectionLevel?: string;
    };
  };
}

export interface EnvironmentCapacity {
  capacityType: string;
  actualConsumption: number;
  ratedConsumption: number;
  capacityUnit: string;
  updatedOn: string;
}

export interface EnvironmentAddon {
  addonType: string;
  allocated: number;
  addonUnit: string;
}

/**
 * Simplified environment info for UI consumption
 */
export interface EnvironmentSummary {
  id: string;
  displayName: string;
  uniqueName: string;
  domainName: string;
  type: "Sandbox" | "Production" | "Trial" | "Default" | "Developer";
  instanceUrl: string;
  instanceApiUrl: string;
  version: string;
  state: string;
  location: string;
  isDefault: boolean;
  createdTime: string;
  capacity?: {
    database?: {
      used: number;
      rated: number;
      unit: string;
    };
    file?: {
      used: number;
      rated: number;
      unit: string;
    };
  };
}

/**
 * Client for Power Platform Admin API
 * Used to discover and manage environments across tenants
 *
 * API Reference: https://learn.microsoft.com/en-us/power-platform/admin/list-environments
 */
export class PowerPlatformAdminClient {
  private readonly adminApiUrl = "https://api.bap.microsoft.com";
  private readonly apiVersion = "2021-04-01";

  constructor(private config: PowerPlatformAdminConfig) {}

  /**
   * List all environments accessible to the authenticated user
   * When using GDAP, this lists environments in the customer tenant
   */
  async listEnvironments(): Promise<PowerPlatformEnvironment[]> {
    const token = await this.getAdminToken();

    const url = `${this.adminApiUrl}/providers/Microsoft.BusinessAppPlatform/scopes/admin/environments?api-version=${this.apiVersion}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to list environments: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as { value: PowerPlatformEnvironment[] };
    return data.value || [];
  }

  /**
   * Get details for a specific environment
   */
  async getEnvironment(environmentId: string): Promise<PowerPlatformEnvironment> {
    const token = await this.getAdminToken();

    const url = `${this.adminApiUrl}/providers/Microsoft.BusinessAppPlatform/scopes/admin/environments/${environmentId}?api-version=${this.apiVersion}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get environment: ${response.status} - ${error}`);
    }

    return response.json() as Promise<PowerPlatformEnvironment>;
  }

  /**
   * Get environment capacity information
   */
  async getEnvironmentCapacity(environmentId: string): Promise<EnvironmentCapacity[]> {
    const env = await this.getEnvironment(environmentId);
    return env.properties.capacity || [];
  }

  /**
   * Convert raw environment to simplified summary for UI
   */
  toEnvironmentSummary(env: PowerPlatformEnvironment): EnvironmentSummary {
    const linked = env.properties.linkedEnvironmentMetadata;
    const capacity = env.properties.capacity || [];

    const dbCapacity = capacity.find((c) => c.capacityType === "Database");
    const fileCapacity = capacity.find((c) => c.capacityType === "File");

    return {
      id: env.id,
      displayName: env.properties.displayName || linked?.friendlyName || env.name,
      uniqueName: linked?.uniqueName || env.name,
      domainName: linked?.domainName || "",
      type: env.properties.environmentSku,
      instanceUrl:
        linked?.instanceUrl ||
        env.properties.runtimeEndpoints
          ?.microsoft_BusinessAppPlatform_linkedEnvironmentMetadata_instanceUrl ||
        "",
      instanceApiUrl:
        linked?.instanceApiUrl ||
        env.properties.runtimeEndpoints
          ?.microsoft_BusinessAppPlatform_linkedEnvironmentMetadata_instanceApiUrl ||
        "",
      version: linked?.version || "",
      state: linked?.instanceState || env.properties.states?.runtime?.id || "Unknown",
      location: env.location,
      isDefault: env.properties.isDefault,
      createdTime: linked?.createdTime || env.properties.createdTime,
      capacity: {
        database: dbCapacity
          ? {
              used: dbCapacity.actualConsumption,
              rated: dbCapacity.ratedConsumption,
              unit: dbCapacity.capacityUnit,
            }
          : undefined,
        file: fileCapacity
          ? {
              used: fileCapacity.actualConsumption,
              rated: fileCapacity.ratedConsumption,
              unit: fileCapacity.capacityUnit,
            }
          : undefined,
      },
    };
  }

  /**
   * List environments and return simplified summaries
   */
  async listEnvironmentSummaries(): Promise<EnvironmentSummary[]> {
    const environments = await this.listEnvironments();
    return environments
      .filter((env) => env.properties.linkedEnvironmentMetadata) // Only Dataverse-enabled environments
      .map((env) => this.toEnvironmentSummary(env));
  }

  /**
   * Get token for Power Platform Admin API
   * Uses the BAP (Business Application Platform) scope
   */
  private async getAdminToken(): Promise<string> {
    return this.config.tokenManager.getToken(["https://api.bap.microsoft.com/.default"]);
  }
}

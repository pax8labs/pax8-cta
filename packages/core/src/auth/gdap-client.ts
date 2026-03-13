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

import { TokenManager, TokenManagerConfig } from "./token-manager.js";
import { POWER_PLATFORM_ADMIN_ROLE_ID } from "../constants.js";

export interface GdapClientConfig extends TokenManagerConfig {
  // Partner tenant is the home tenant
}

export interface DelegatedAdminRelationship {
  id: string;
  displayName: string;
  customer: {
    tenantId: string;
    displayName: string;
  };
  status: "active" | "pending" | "terminated" | "expired";
  accessDetails: {
    unifiedRoles: Array<{
      roleDefinitionId: string;
    }>;
  };
  duration: string;
  endDateTime: string;
}

export interface CustomerEnvironment {
  tenantId: string;
  tenantDisplayName: string;
  environments: Array<{
    id: string;
    displayName: string;
    url: string;
    type: string;
  }>;
}

/**
 * Client for interacting with Microsoft Graph GDAP APIs
 * Used to discover and validate delegated admin relationships
 */
export class GdapClient {
  private tokenManager: TokenManager;
  private readonly graphBaseUrl = "https://graph.microsoft.com/v1.0";

  constructor(config: GdapClientConfig) {
    this.tokenManager = new TokenManager(config);
  }

  /**
   * List all active delegated admin relationships
   */
  async listDelegatedAdminRelationships(): Promise<DelegatedAdminRelationship[]> {
    const token = await this.tokenManager.getGraphToken();
    const response = await fetch(
      `${this.graphBaseUrl}/tenantRelationships/delegatedAdminRelationships?$filter=status eq 'active'`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to list delegated admin relationships: ${error}`);
    }

    const data = (await response.json()) as { value: DelegatedAdminRelationship[] };
    return data.value;
  }

  /**
   * Get a specific delegated admin relationship by ID
   */
  async getDelegatedAdminRelationship(relationshipId: string): Promise<DelegatedAdminRelationship> {
    const token = await this.tokenManager.getGraphToken();
    const response = await fetch(
      `${this.graphBaseUrl}/tenantRelationships/delegatedAdminRelationships/${relationshipId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get delegated admin relationship: ${error}`);
    }

    return (await response.json()) as DelegatedAdminRelationship;
  }

  /**
   * Check if we have an active GDAP relationship with a specific tenant
   */
  async hasActiveRelationship(customerTenantId: string): Promise<boolean> {
    const relationships = await this.listDelegatedAdminRelationships();
    return relationships.some(
      (rel) => rel.customer.tenantId === customerTenantId && rel.status === "active"
    );
  }

  /**
   * Validate that the partner has Power Platform Administrator access
   * to a customer tenant via GDAP
   */
  async validatePowerPlatformAccess(customerTenantId: string): Promise<boolean> {
    const powerPlatformAdminRoleId = POWER_PLATFORM_ADMIN_ROLE_ID;

    const relationships = await this.listDelegatedAdminRelationships();
    const relationship = relationships.find((rel) => rel.customer.tenantId === customerTenantId);

    if (!relationship || relationship.status !== "active") {
      return false;
    }

    return relationship.accessDetails.unifiedRoles.some(
      (role) => role.roleDefinitionId === powerPlatformAdminRoleId
    );
  }

  /**
   * Get a token manager configured for accessing a specific customer tenant
   * Uses the partner's credentials with GDAP delegation
   */
  getCustomerTokenManager(customerTenantId: string, partnerConfig: GdapClientConfig): TokenManager {
    // For GDAP, we use the partner's app registration but target the customer tenant
    return new TokenManager({
      ...partnerConfig,
      tenantId: customerTenantId,
    });
  }
}

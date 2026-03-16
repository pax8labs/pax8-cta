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

/**
 * Environment Setup Service
 *
 * Manages Power Platform application user lifecycle:
 * - Checking if an app user exists in a Dataverse environment
 * - Verifying security role assignments
 * - Creating app users and assigning roles
 * - Validating tenant readiness for deployment
 *
 * Extracted from CLI setup.ts, validate.ts, and deploy.ts (prepareEnvironment)
 * to eliminate duplication and make the logic testable and reusable.
 */

import { DataverseClient } from "../dataverse/client.js";
import type { SecurityRole, BusinessUnit } from "../powerplatform/admin-client.js";

// ============================================================================
// Types
// ============================================================================

export interface SystemUser {
  systemuserid: string;
  fullname?: string;
  applicationid?: string;
  isdisabled?: boolean;
}

export type SetupStatusCode = "ready" | "needs_setup" | "partial" | "error";

export interface SetupStatus {
  tenantName: string;
  environmentUrl: string;
  appRegistered: boolean;
  roleAssigned: boolean;
  status: SetupStatusCode;
  error?: string;
  userId?: string;
}

export interface TenantValidationResult {
  appUserExists: boolean;
  hasSystemAdminRole: boolean;
  userId?: string;
}

export interface PrepareEnvironmentResult {
  success: boolean;
  message: string;
}

// ============================================================================
// Service
// ============================================================================

export class EnvironmentSetupService {
  /**
   * Check if an app user exists and has the System Administrator role.
   *
   * This is the core validation used by `agentsync validate` and `agentsync setup --check`.
   */
  async validateTenant(client: DataverseClient, appId: string): Promise<TenantValidationResult> {
    // Check if app user exists
    const result = await client.get<{ value: SystemUser[] }>("/systemusers", {
      $filter: `applicationid eq '${appId}'`,
      $select: "systemuserid,fullname,applicationid,isdisabled",
    });

    if (result.value.length === 0) {
      return {
        appUserExists: false,
        hasSystemAdminRole: false,
      };
    }

    const user = result.value[0];

    // Check if System Administrator role is assigned
    const rolesResult = await client.get<{ value: SecurityRole[] }>(
      `/systemusers(${user.systemuserid})/systemuserroles_association`,
      {
        $select: "roleid,name",
      }
    );

    const hasAdminRole = rolesResult.value.some((r) => r.name === "System Administrator");

    return {
      appUserExists: true,
      hasSystemAdminRole: hasAdminRole,
      userId: user.systemuserid,
    };
  }

  /**
   * Check the full setup status for a tenant, including error handling.
   *
   * Returns a structured status object suitable for display in tables or JSON output.
   * Used by `agentsync setup --check`.
   */
  async checkSetupStatus(
    client: DataverseClient,
    appId: string,
    tenantName: string,
    environmentUrl: string
  ): Promise<SetupStatus> {
    try {
      const validation = await this.validateTenant(client, appId);

      if (!validation.appUserExists) {
        return {
          tenantName,
          environmentUrl,
          appRegistered: false,
          roleAssigned: false,
          status: "needs_setup",
        };
      }

      if (!validation.hasSystemAdminRole) {
        return {
          tenantName,
          environmentUrl,
          appRegistered: true,
          roleAssigned: false,
          status: "partial",
          userId: validation.userId,
        };
      }

      return {
        tenantName,
        environmentUrl,
        appRegistered: true,
        roleAssigned: true,
        status: "ready",
        userId: validation.userId,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Check if it's an auth error (app not registered at tenant level)
      if (errorMsg.includes("not a member of the organization")) {
        return {
          tenantName,
          environmentUrl,
          appRegistered: false,
          roleAssigned: false,
          status: "needs_setup",
          error: "App not registered in this environment (bootstrap required)",
        };
      }

      return {
        tenantName,
        environmentUrl,
        appRegistered: false,
        roleAssigned: false,
        status: "error",
        error: errorMsg,
      };
    }
  }

  /**
   * Create an application user in the Dataverse environment.
   *
   * Finds the root business unit and creates the app user bound to it.
   * Returns the new user's system user ID.
   */
  async createAppUser(client: DataverseClient, appId: string): Promise<string> {
    // Get root business unit
    const buResult = await client.get<{ value: BusinessUnit[] }>("/businessunits", {
      $filter: "parentbusinessunitid eq null",
      $select: "businessunitid,name",
    });

    if (buResult.value.length === 0) {
      throw new Error("Could not find root business unit");
    }

    const buId = buResult.value[0].businessunitid;

    // Create app user
    await client.post("/systemusers", {
      applicationid: appId,
      "businessunitid@odata.bind": `/businessunits(${buId})`,
    });

    // Get the newly created user's ID
    const userResult = await client.get<{ value: SystemUser[] }>("/systemusers", {
      $filter: `applicationid eq '${appId}'`,
      $select: "systemuserid",
    });

    if (userResult.value.length === 0) {
      throw new Error("Failed to create app user");
    }

    return userResult.value[0].systemuserid;
  }

  /**
   * Assign the System Administrator role to a user.
   */
  async assignSystemAdminRole(
    client: DataverseClient,
    userId: string,
    environmentUrl: string
  ): Promise<void> {
    // Get System Administrator role
    const roleResult = await client.get<{ value: SecurityRole[] }>("/roles", {
      $filter: "name eq 'System Administrator'",
      $select: "roleid,name",
    });

    if (roleResult.value.length === 0) {
      throw new Error("Could not find System Administrator role");
    }

    const roleId = roleResult.value[0].roleid;

    // Assign role to user
    const apiUrl = environmentUrl.replace(/\/$/, "") + "/api/data/v9.2";
    await client.post(`/systemusers(${userId})/systemuserroles_association/$ref`, {
      "@odata.id": `${apiUrl}/roles(${roleId})`,
    });
  }

  /**
   * Ensure an app user is created and has System Administrator role.
   *
   * This is the "setup" action used by both `agentsync setup` and
   * the auto-setup step in `agentsync deploy`.
   */
  async setupTenant(
    client: DataverseClient,
    appId: string,
    environmentUrl: string,
    currentStatus: SetupStatus
  ): Promise<void> {
    let userId = currentStatus.userId;

    // Create app user if needed
    if (!currentStatus.appRegistered) {
      userId = await this.createAppUser(client, appId);
    }

    // Assign System Administrator role if needed
    if (!currentStatus.roleAssigned && userId) {
      await this.assignSystemAdminRole(client, userId, environmentUrl);
    }
  }

  /**
   * Prepare an environment for deployment by ensuring app user exists with proper permissions.
   *
   * Combines check + setup into a single operation. Returns a result suitable for
   * progress reporting.
   *
   * This was previously `prepareEnvironment()` in deploy.ts.
   */
  async prepareEnvironment(
    client: DataverseClient,
    appId: string,
    environmentUrl: string
  ): Promise<PrepareEnvironmentResult> {
    try {
      const validation = await this.validateTenant(client, appId);

      if (validation.appUserExists && validation.hasSystemAdminRole) {
        return { success: true, message: "Ready" };
      }

      // Need to create user or assign role
      if (!validation.appUserExists) {
        try {
          const userId = await this.createAppUser(client, appId);
          await this.assignSystemAdminRole(client, userId, environmentUrl);
          return {
            success: true,
            message: "Created app user and assigned System Administrator role",
          };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          if (errorMsg.includes("not a member of the organization")) {
            return {
              success: false,
              message:
                "App not registered (requires manual bootstrap in Power Platform admin center)",
            };
          }
          return {
            success: false,
            message: `Failed to create app user: ${errorMsg}`,
          };
        }
      }

      // User exists but needs role
      if (validation.userId) {
        try {
          await this.assignSystemAdminRole(client, validation.userId, environmentUrl);
          return {
            success: true,
            message: "Assigned System Administrator role",
          };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          return {
            success: false,
            message: `Failed to assign role: ${errorMsg}`,
          };
        }
      }

      return { success: false, message: "Unexpected state" };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      if (errorMsg.includes("not a member of the organization")) {
        return {
          success: false,
          message: "App not registered (requires manual bootstrap in Power Platform admin center)",
        };
      }

      return {
        success: false,
        message: `Error: ${errorMsg}`,
      };
    }
  }
}

// Export singleton for convenience
export const environmentSetupService = new EnvironmentSetupService();

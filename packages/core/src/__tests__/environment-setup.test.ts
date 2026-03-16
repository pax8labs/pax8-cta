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

import { describe, it, expect, vi, beforeEach } from "vitest";
import { EnvironmentSetupService } from "../services/environment-setup.js";
import type { DataverseClient } from "../dataverse/client.js";

function createMockClient(overrides: Record<string, unknown> = {}): DataverseClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    ...overrides,
  } as unknown as DataverseClient;
}

describe("EnvironmentSetupService", () => {
  let service: EnvironmentSetupService;

  beforeEach(() => {
    service = new EnvironmentSetupService();
  });

  describe("validateTenant", () => {
    it("should return appUserExists=false when no user found", async () => {
      const client = createMockClient({
        get: vi.fn().mockResolvedValue({ value: [] }),
      });

      const result = await service.validateTenant(client, "test-app-id");

      expect(result.appUserExists).toBe(false);
      expect(result.hasSystemAdminRole).toBe(false);
      expect(result.userId).toBeUndefined();
    });

    it("should return appUserExists=true with role when admin role is assigned", async () => {
      const client = createMockClient({
        get: vi.fn().mockImplementation((path: string) => {
          if (path === "/systemusers") {
            return { value: [{ systemuserid: "user-123", applicationid: "test-app-id" }] };
          }
          if (path.includes("systemuserroles_association")) {
            return { value: [{ roleid: "role-1", name: "System Administrator" }] };
          }
          return { value: [] };
        }),
      });

      const result = await service.validateTenant(client, "test-app-id");

      expect(result.appUserExists).toBe(true);
      expect(result.hasSystemAdminRole).toBe(true);
      expect(result.userId).toBe("user-123");
    });

    it("should return hasSystemAdminRole=false when role is not assigned", async () => {
      const client = createMockClient({
        get: vi.fn().mockImplementation((path: string) => {
          if (path === "/systemusers") {
            return { value: [{ systemuserid: "user-123" }] };
          }
          if (path.includes("systemuserroles_association")) {
            return { value: [{ roleid: "role-1", name: "Basic User" }] };
          }
          return { value: [] };
        }),
      });

      const result = await service.validateTenant(client, "test-app-id");

      expect(result.appUserExists).toBe(true);
      expect(result.hasSystemAdminRole).toBe(false);
    });
  });

  describe("checkSetupStatus", () => {
    it('should return status "ready" when user exists with admin role', async () => {
      const client = createMockClient({
        get: vi.fn().mockImplementation((path: string) => {
          if (path === "/systemusers") {
            return { value: [{ systemuserid: "user-123" }] };
          }
          if (path.includes("systemuserroles_association")) {
            return { value: [{ roleid: "role-1", name: "System Administrator" }] };
          }
          return { value: [] };
        }),
      });

      const result = await service.checkSetupStatus(
        client,
        "test-app-id",
        "Test Tenant",
        "https://test.crm.dynamics.com"
      );

      expect(result.status).toBe("ready");
      expect(result.appRegistered).toBe(true);
      expect(result.roleAssigned).toBe(true);
    });

    it('should return status "needs_setup" when user does not exist', async () => {
      const client = createMockClient({
        get: vi.fn().mockResolvedValue({ value: [] }),
      });

      const result = await service.checkSetupStatus(
        client,
        "test-app-id",
        "Test Tenant",
        "https://test.crm.dynamics.com"
      );

      expect(result.status).toBe("needs_setup");
      expect(result.appRegistered).toBe(false);
    });

    it('should return status "partial" when user exists but role not assigned', async () => {
      const client = createMockClient({
        get: vi.fn().mockImplementation((path: string) => {
          if (path === "/systemusers") {
            return { value: [{ systemuserid: "user-123" }] };
          }
          if (path.includes("systemuserroles_association")) {
            return { value: [] };
          }
          return { value: [] };
        }),
      });

      const result = await service.checkSetupStatus(
        client,
        "test-app-id",
        "Test Tenant",
        "https://test.crm.dynamics.com"
      );

      expect(result.status).toBe("partial");
      expect(result.appRegistered).toBe(true);
      expect(result.roleAssigned).toBe(false);
    });

    it('should return status "needs_setup" for not-a-member errors', async () => {
      const client = createMockClient({
        get: vi.fn().mockRejectedValue(new Error("user is not a member of the organization")),
      });

      const result = await service.checkSetupStatus(
        client,
        "test-app-id",
        "Test Tenant",
        "https://test.crm.dynamics.com"
      );

      expect(result.status).toBe("needs_setup");
      expect(result.error).toContain("bootstrap");
    });

    it('should return status "error" for unexpected errors', async () => {
      const client = createMockClient({
        get: vi.fn().mockRejectedValue(new Error("Network timeout")),
      });

      const result = await service.checkSetupStatus(
        client,
        "test-app-id",
        "Test Tenant",
        "https://test.crm.dynamics.com"
      );

      expect(result.status).toBe("error");
      expect(result.error).toBe("Network timeout");
    });
  });

  describe("createAppUser", () => {
    it("should create user and return user ID", async () => {
      const client = createMockClient({
        get: vi.fn().mockImplementation((path: string) => {
          if (path === "/businessunits") {
            return { value: [{ businessunitid: "bu-1", name: "Root" }] };
          }
          if (path === "/systemusers") {
            return { value: [{ systemuserid: "new-user-123" }] };
          }
          return { value: [] };
        }),
        post: vi.fn().mockResolvedValue(undefined),
      });

      const userId = await service.createAppUser(client, "test-app-id");
      expect(userId).toBe("new-user-123");
      expect(client.post).toHaveBeenCalledWith(
        "/systemusers",
        expect.objectContaining({
          applicationid: "test-app-id",
        })
      );
    });

    it("should throw when no root business unit found", async () => {
      const client = createMockClient({
        get: vi.fn().mockResolvedValue({ value: [] }),
      });

      await expect(service.createAppUser(client, "test-app-id")).rejects.toThrow(
        "Could not find root business unit"
      );
    });
  });

  describe("prepareEnvironment", () => {
    it('should return "Ready" when already configured', async () => {
      const client = createMockClient({
        get: vi.fn().mockImplementation((path: string) => {
          if (path === "/systemusers") {
            return { value: [{ systemuserid: "user-123" }] };
          }
          if (path.includes("systemuserroles_association")) {
            return { value: [{ roleid: "role-1", name: "System Administrator" }] };
          }
          return { value: [] };
        }),
      });

      const result = await service.prepareEnvironment(
        client,
        "test-app-id",
        "https://test.crm.dynamics.com"
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe("Ready");
    });

    it("should create user and assign role when not configured", async () => {
      const callCount: Record<string, number> = {};
      const client = createMockClient({
        get: vi.fn().mockImplementation((path: string) => {
          callCount[path] = (callCount[path] || 0) + 1;

          if (path === "/systemusers" && callCount[path] === 1) {
            // First call: user doesn't exist yet
            return { value: [] };
          }
          if (path === "/businessunits") {
            return { value: [{ businessunitid: "bu-1" }] };
          }
          if (path === "/systemusers" && callCount[path] === 2) {
            // Second call: user was just created
            return { value: [{ systemuserid: "new-user-1" }] };
          }
          if (path === "/roles") {
            return { value: [{ roleid: "admin-role-id", name: "System Administrator" }] };
          }
          return { value: [] };
        }),
        post: vi.fn().mockResolvedValue(undefined),
      });

      const result = await service.prepareEnvironment(
        client,
        "test-app-id",
        "https://test.crm.dynamics.com"
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain("Created app user");
    });
  });
});

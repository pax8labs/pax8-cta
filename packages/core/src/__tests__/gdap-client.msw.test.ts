/**
 * MSW-based integration tests for GdapClient.
 *
 * These tests replay sanitized recordings of real Microsoft Graph API responses
 * via MSW (Mock Service Worker). Unlike the unit tests in gdap-client.test.ts
 * which mock fetch directly, these tests exercise the real HTTP handling in
 * GdapClient against realistic response shapes — catching issues like schema
 * changes, unexpected fields, or OData metadata.
 *
 * MSAL is still mocked (it uses its own HTTP client, not fetch), but the
 * Graph API layer uses real fetch intercepted by MSW.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from "vitest";
import { setupServer } from "msw/node";
import { GdapClient } from "../auth/gdap-client.js";
import {
  activeRelationshipsHandlers,
  emptyRelationshipsHandlers,
  mixedStatusHandlers,
  paginatedHandlers,
  transientFailureHandlers,
  expiringSoonHandlers,
  noPowerPlatformRoleHandlers,
  unauthorizedHandlers,
  forbiddenHandlers,
  throttledHandlers,
} from "./msw/gdap-handlers.js";

// Mock MSAL so TokenManager doesn't hit Azure AD
vi.mock("@azure/msal-node", () => ({
  ConfidentialClientApplication: vi.fn().mockImplementation(() => ({
    acquireTokenByClientCredential: vi.fn().mockResolvedValue({
      accessToken: "msw-test-token",
      expiresOn: new Date(Date.now() + 3600 * 1000),
    }),
  })),
}));

const server = setupServer();

const PARTNER_CONFIG = {
  tenantId: "partner-tenant-00000000-0000-0000-0000-000000000000",
  clientId: "partner-client-11111111-1111-1111-1111-111111111111",
  clientSecret: "test-secret-value",
};

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("GdapClient (MSW replay)", () => {
  let client: GdapClient;

  beforeEach(() => {
    client = new GdapClient(PARTNER_CONFIG);
  });

  // ---------------------------------------------------------------------------
  // Happy path: active relationships with realistic Graph API response shape
  // ---------------------------------------------------------------------------
  describe("active relationships recording", () => {
    beforeEach(() => server.use(...activeRelationshipsHandlers()));

    it("should parse all relationships from OData response", async () => {
      const relationships = await client.listDelegatedAdminRelationships();

      expect(relationships).toHaveLength(3);
      expect(relationships[0]).toHaveProperty("id");
      expect(relationships[0]).toHaveProperty("customer.tenantId");
      expect(relationships[0]).toHaveProperty("customer.displayName");
      expect(relationships[0]).toHaveProperty("status");
      expect(relationships[0]).toHaveProperty("accessDetails.unifiedRoles");
      expect(relationships[0]).toHaveProperty("duration");
      expect(relationships[0]).toHaveProperty("endDateTime");
    });

    it("should preserve customer tenant IDs from recording", async () => {
      const relationships = await client.listDelegatedAdminRelationships();

      const tenantIds = relationships.map((r) => r.customer.tenantId);
      expect(tenantIds).toContain("cccccccc-1111-2222-3333-444444444444");
      expect(tenantIds).toContain("dddddddd-9999-aaaa-bbbb-cccccccccccc");
      expect(tenantIds).toContain("eeeeeeee-1111-2222-3333-ffffffffffff");
    });

    it("should preserve role definition IDs from recording", async () => {
      const relationships = await client.listDelegatedAdminRelationships();

      // First relationship has Power Platform Admin + Global Admin roles
      const firstRoles = relationships[0].accessDetails.unifiedRoles.map((r) => r.roleDefinitionId);
      expect(firstRoles).toContain("11648597-926c-4cf3-9c36-bcebb0ba8dcc"); // PP Admin
      expect(firstRoles).toContain("62e90394-69f5-4237-9190-012177145e10"); // Global Admin
    });

    it("should find active relationship for known tenant", async () => {
      const hasRelationship = await client.hasActiveRelationship(
        "cccccccc-1111-2222-3333-444444444444"
      );
      expect(hasRelationship).toBe(true);
    });

    it("should not find relationship for unknown tenant", async () => {
      const hasRelationship = await client.hasActiveRelationship("unknown-tenant-id");
      expect(hasRelationship).toBe(false);
    });

    it("should validate Power Platform Admin access for tenant with role", async () => {
      const hasAccess = await client.validatePowerPlatformAccess(
        "cccccccc-1111-2222-3333-444444444444"
      );
      expect(hasAccess).toBe(true);
    });

    it("should fetch specific relationship by ID", async () => {
      const rel = await client.getDelegatedAdminRelationship(
        "aaaaaaaa-1111-2222-3333-444444444444-bbbbbbbb-5555-6666-7777-888888888888"
      );
      expect(rel.customer.displayName).toBe("Contoso Ltd");
      expect(rel.status).toBe("active");
    });

    it("should throw for non-existent relationship ID", async () => {
      await expect(client.getDelegatedAdminRelationship("non-existent-id")).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Empty relationships
  // ---------------------------------------------------------------------------
  describe("empty relationships recording", () => {
    beforeEach(() => server.use(...emptyRelationshipsHandlers()));

    it("should return empty array from OData response with zero count", async () => {
      const relationships = await client.listDelegatedAdminRelationships();
      expect(relationships).toEqual([]);
    });

    it("should return false for any tenant", async () => {
      const hasRelationship = await client.hasActiveRelationship("any-tenant");
      expect(hasRelationship).toBe(false);
    });

    it("should deny Power Platform access for any tenant", async () => {
      const hasAccess = await client.validatePowerPlatformAccess("any-tenant");
      expect(hasAccess).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Mixed status: active, expired, pending, terminated
  // ---------------------------------------------------------------------------
  describe("mixed status recording", () => {
    beforeEach(() => server.use(...mixedStatusHandlers()));

    it("should return all relationships including non-active ones", async () => {
      const relationships = await client.listDelegatedAdminRelationships();

      // The fixture has 4 relationships with different statuses
      expect(relationships).toHaveLength(4);
      const statuses = relationships.map((r) => r.status);
      expect(statuses).toContain("active");
      expect(statuses).toContain("expired");
      expect(statuses).toContain("pending");
      expect(statuses).toContain("terminated");
    });

    it("should find active tenant via hasActiveRelationship", async () => {
      const active = await client.hasActiveRelationship("active-tenant-1111-2222-333333333333");
      expect(active).toBe(true);
    });

    it("should not match expired tenant as active", async () => {
      // hasActiveRelationship checks both tenantId match AND status === "active"
      const expired = await client.hasActiveRelationship("expired-tenant-4444-5555-666666666666");
      expect(expired).toBe(false);
    });

    it("should deny PP access for expired relationship", async () => {
      // validatePowerPlatformAccess explicitly checks status !== "active"
      const hasAccess = await client.validatePowerPlatformAccess(
        "expired-tenant-4444-5555-666666666666"
      );
      expect(hasAccess).toBe(false);
    });

    it("should deny PP access for pending relationship", async () => {
      const hasAccess = await client.validatePowerPlatformAccess(
        "pending-tenant-7777-8888-999999999999"
      );
      expect(hasAccess).toBe(false);
    });

    it("should deny PP access for terminated relationship", async () => {
      const hasAccess = await client.validatePowerPlatformAccess(
        "terminated-tenant-aaaa-bbbb-cccccccccccc"
      );
      expect(hasAccess).toBe(false);
    });

    it("should grant PP access for active relationship with correct role", async () => {
      const hasAccess = await client.validatePowerPlatformAccess(
        "active-tenant-1111-2222-333333333333"
      );
      expect(hasAccess).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Missing Power Platform Admin role
  // ---------------------------------------------------------------------------
  describe("no Power Platform role recording", () => {
    beforeEach(() => server.use(...noPowerPlatformRoleHandlers()));

    it("should find the active relationship", async () => {
      const relationships = await client.listDelegatedAdminRelationships();
      expect(relationships).toHaveLength(1);
      expect(relationships[0].status).toBe("active");
    });

    it("should have roles but not Power Platform Admin", async () => {
      const relationships = await client.listDelegatedAdminRelationships();
      const roleIds = relationships[0].accessDetails.unifiedRoles.map((r) => r.roleDefinitionId);
      expect(roleIds).not.toContain("11648597-926c-4cf3-9c36-bcebb0ba8dcc");
      expect(roleIds.length).toBeGreaterThan(0); // has other roles
    });

    it("should deny Power Platform access despite active relationship", async () => {
      const hasAccess = await client.validatePowerPlatformAccess(
        "norole-tenant-1111-2222-333333333333"
      );
      expect(hasAccess).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Error responses
  // ---------------------------------------------------------------------------
  describe("error recordings", () => {
    it("should throw with Graph API error details on 401", async () => {
      server.use(...unauthorizedHandlers());

      await expect(client.listDelegatedAdminRelationships()).rejects.toThrow(
        /Failed to list delegated admin relationships/
      );
    });

    it("should throw with permission message on 403", async () => {
      server.use(...forbiddenHandlers());

      await expect(client.listDelegatedAdminRelationships()).rejects.toThrow(
        /Failed to list delegated admin relationships/
      );
    });

    it("should throw on 429 after exhausting retries", async () => {
      server.use(...throttledHandlers(0)); // 0s Retry-After for fast test

      await expect(client.listDelegatedAdminRelationships()).rejects.toThrow(
        /Failed to list delegated admin relationships/
      );
    });

    it("should propagate errors through hasActiveRelationship", async () => {
      server.use(...unauthorizedHandlers());

      await expect(client.hasActiveRelationship("any-tenant")).rejects.toThrow();
    });

    it("should propagate errors through validatePowerPlatformAccess", async () => {
      server.use(...forbiddenHandlers());

      await expect(client.validatePowerPlatformAccess("any-tenant")).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Pagination (#267)
  // ---------------------------------------------------------------------------
  describe("pagination recording", () => {
    beforeEach(() => server.use(...paginatedHandlers()));

    it("should aggregate relationships across pages", async () => {
      const relationships = await client.listDelegatedAdminRelationships();

      // Page 1 has 2 relationships, page 2 has 1
      expect(relationships).toHaveLength(3);
    });

    it("should include tenants from all pages", async () => {
      const relationships = await client.listDelegatedAdminRelationships();
      const tenantIds = relationships.map((r) => r.customer.tenantId);

      // Page 1 tenants
      expect(tenantIds).toContain("page1-tenant-aaaa-1111-222222222222");
      expect(tenantIds).toContain("page1-tenant-bbbb-3333-444444444444");
      // Page 2 tenant
      expect(tenantIds).toContain("page2-tenant-cccc-5555-666666666666");
    });

    it("should find tenant from second page via hasActiveRelationship", async () => {
      const found = await client.hasActiveRelationship("page2-tenant-cccc-5555-666666666666");
      expect(found).toBe(true);
    });

    it("should validate PP access for tenant on second page", async () => {
      const valid = await client.validatePowerPlatformAccess("page2-tenant-cccc-5555-666666666666");
      expect(valid).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Retry recovery (#268)
  // ---------------------------------------------------------------------------
  describe("transient failure recovery", () => {
    beforeEach(() => server.use(...transientFailureHandlers()));

    it("should recover from 503 and return relationships", async () => {
      const relationships = await client.listDelegatedAdminRelationships();

      // Should have retried and gotten the active-relationships fixture
      expect(relationships).toHaveLength(3);
    });

    it("should find tenant after transient recovery", async () => {
      const found = await client.hasActiveRelationship("cccccccc-1111-2222-3333-444444444444");
      expect(found).toBe(true);
    });
  });
});

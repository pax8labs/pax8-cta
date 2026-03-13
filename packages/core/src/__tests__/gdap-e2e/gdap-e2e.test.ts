/**
 * GDAP End-to-End Integration Tests
 *
 * These tests verify real Azure AD token acquisition and GDAP delegation
 * against M365 Developer Program tenants. They require the following
 * environment variables:
 *
 *   GDAP_PARTNER_TENANT_ID  - Partner (MSP) tenant ID
 *   GDAP_CLIENT_ID          - Azure AD app registration client ID
 *   GDAP_CLIENT_SECRET      - Azure AD app registration client secret
 *   GDAP_CUSTOMER_TENANT_ID - Customer tenant ID with active GDAP relationship
 *
 * Optional:
 *   GDAP_CUSTOMER_ENVIRONMENT_URL - Dataverse environment URL in customer tenant
 *
 * These tests are excluded from the default test suite and only run when
 * credentials are available. See README.md in this directory for setup.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { GdapClient, type GdapClientConfig } from "../../auth/gdap-client.js";
import { TokenManager, type TokenManagerConfig } from "../../auth/token-manager.js";

/**
 * Required environment variables for GDAP E2E tests.
 */
const REQUIRED_ENV_VARS = [
  "GDAP_PARTNER_TENANT_ID",
  "GDAP_CLIENT_ID",
  "GDAP_CLIENT_SECRET",
  "GDAP_CUSTOMER_TENANT_ID",
] as const;

/**
 * Check whether all required credentials are present.
 * Returns a config object if available, or null to skip.
 */
function loadGdapConfig(): {
  partnerConfig: GdapClientConfig;
  customerTenantId: string;
  customerEnvironmentUrl?: string;
} | null {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    return null;
  }

  return {
    partnerConfig: {
      tenantId: process.env.GDAP_PARTNER_TENANT_ID!,
      clientId: process.env.GDAP_CLIENT_ID!,
      clientSecret: process.env.GDAP_CLIENT_SECRET!,
    },
    customerTenantId: process.env.GDAP_CUSTOMER_TENANT_ID!,
    customerEnvironmentUrl: process.env.GDAP_CUSTOMER_ENVIRONMENT_URL,
  };
}

const config = loadGdapConfig();
const shouldSkip = config === null;

if (shouldSkip) {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  console.log(
    `\nSkipping GDAP E2E tests: missing env vars: ${missing.join(", ")}` +
      `\nSee packages/core/src/__tests__/gdap-e2e/README.md for setup instructions.\n`
  );
}

describe.skipIf(shouldSkip)("GDAP E2E Integration Tests", () => {
  let gdapClient: GdapClient;
  let partnerConfig: GdapClientConfig;
  let customerTenantId: string;

  beforeAll(() => {
    // Safe to assert non-null here because describe.skipIf guards us
    partnerConfig = config!.partnerConfig;
    customerTenantId = config!.customerTenantId;
    gdapClient = new GdapClient(partnerConfig);
  });

  describe("Token Acquisition", () => {
    it("should acquire a Graph API token for the partner tenant", async () => {
      const tokenManager = new TokenManager(partnerConfig);
      const token = await tokenManager.getGraphToken();

      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(0);

      // JWT tokens have 3 dot-separated parts
      const parts = token.split(".");
      expect(parts.length).toBe(3);
    }, 30_000);

    it("should cache tokens and return the same token on subsequent calls", async () => {
      const tokenManager = new TokenManager(partnerConfig);
      const token1 = await tokenManager.getGraphToken();
      const token2 = await tokenManager.getGraphToken();

      expect(token1).toBe(token2);
    }, 30_000);
  });

  describe("GDAP Relationship Discovery", () => {
    it("should list delegated admin relationships", async () => {
      const relationships = await gdapClient.listDelegatedAdminRelationships();

      expect(Array.isArray(relationships)).toBe(true);
      // We expect at least one relationship (the one with the customer dev tenant)
      expect(relationships.length).toBeGreaterThan(0);

      // Verify relationship shape
      const firstRel = relationships[0];
      expect(firstRel).toHaveProperty("id");
      expect(firstRel).toHaveProperty("displayName");
      expect(firstRel).toHaveProperty("customer");
      expect(firstRel).toHaveProperty("status");
      expect(firstRel.status).toBe("active");
    }, 30_000);

    it("should confirm an active relationship with the customer tenant", async () => {
      const hasRelationship = await gdapClient.hasActiveRelationship(customerTenantId);
      expect(hasRelationship).toBe(true);
    }, 30_000);

    it("should validate Power Platform Administrator access", async () => {
      const hasPowerPlatformAccess = await gdapClient.validatePowerPlatformAccess(customerTenantId);
      expect(hasPowerPlatformAccess).toBe(true);
    }, 30_000);
  });

  describe("Cross-Tenant Token Acquisition", () => {
    it("should acquire a Graph API token targeting the customer tenant", async () => {
      const customerTokenManager = gdapClient.getCustomerTokenManager(
        customerTenantId,
        partnerConfig
      );
      const token = await customerTokenManager.getGraphToken();

      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(0);
    }, 30_000);

    it("should acquire a Dataverse token for the customer environment", async () => {
      const environmentUrl = config!.customerEnvironmentUrl;
      if (!environmentUrl) {
        console.log("Skipping: GDAP_CUSTOMER_ENVIRONMENT_URL not set");
        return;
      }

      const customerTokenManager = gdapClient.getCustomerTokenManager(
        customerTenantId,
        partnerConfig
      );
      const token = await customerTokenManager.getDataverseToken(environmentUrl);

      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(0);
    }, 30_000);
  });
});

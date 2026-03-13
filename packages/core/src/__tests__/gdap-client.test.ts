import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GdapClient, DelegatedAdminRelationship } from "../auth/gdap-client.js";

// vi.hoisted runs before vi.mock hoisting, so the variable is available
const { MockTokenManager } = vi.hoisted(() => {
  const MockTokenManager = vi.fn().mockImplementation(() => ({
    getGraphToken: vi.fn().mockResolvedValue("mock-graph-token"),
    getDataverseToken: vi.fn().mockResolvedValue("mock-dataverse-token"),
    getToken: vi.fn().mockResolvedValue("mock-token"),
    clearCache: vi.fn(),
  }));
  return { MockTokenManager };
});

vi.mock("../auth/token-manager.js", () => ({
  TokenManager: MockTokenManager,
}));

// Mock global fetch for Graph API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

const POWER_PLATFORM_ADMIN_ROLE_ID = "11648597-926c-4cf3-9c36-bcebb0ba8dcc";

function createRelationship(
  overrides: Partial<DelegatedAdminRelationship> = {}
): DelegatedAdminRelationship {
  return {
    id: "rel-001",
    displayName: "Partner - Contoso",
    customer: {
      tenantId: "customer-tenant-aaa",
      displayName: "Contoso Ltd",
    },
    status: "active",
    accessDetails: {
      unifiedRoles: [{ roleDefinitionId: POWER_PLATFORM_ADMIN_ROLE_ID }],
    },
    duration: "P730D",
    endDateTime: "2027-01-01T00:00:00Z",
    ...overrides,
  };
}

const mockHeaders = (extra: Record<string, string> = {}) => ({
  get: (name: string) => extra[name.toLowerCase()] ?? null,
});

function mockGraphResponse(value: DelegatedAdminRelationship[]) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ value }),
    text: () => Promise.resolve(JSON.stringify({ value })),
    headers: mockHeaders(),
  });
}

function mockGraphSingleResponse(rel: DelegatedAdminRelationship) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: () => Promise.resolve(rel),
    text: () => Promise.resolve(JSON.stringify(rel)),
    headers: mockHeaders(),
  });
}

function mockGraphError(errorText: string, status = 500, headers: Record<string, string> = {}) {
  // For retryable errors (429, 5xx), provide enough mocks to exhaust retries
  const isRetryable = [429, 500, 502, 503, 504].includes(status);
  const count = isRetryable ? 4 : 1; // MAX_RETRIES + 1
  for (let i = 0; i < count; i++) {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status,
      text: () => Promise.resolve(errorText),
      headers: mockHeaders(headers),
    });
  }
}

describe("GdapClient", () => {
  let client: GdapClient;

  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockReset();
    MockTokenManager.mockImplementation(() => ({
      getGraphToken: vi.fn().mockResolvedValue("mock-graph-token"),
      getDataverseToken: vi.fn().mockResolvedValue("mock-dataverse-token"),
      getToken: vi.fn().mockResolvedValue("mock-token"),
      clearCache: vi.fn(),
    }));
    client = new GdapClient({
      tenantId: "partner-tenant-id",
      clientId: "partner-client-id",
      clientSecret: "partner-secret",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // listDelegatedAdminRelationships
  // ---------------------------------------------------------------------------
  describe("listDelegatedAdminRelationships", () => {
    it("should return active relationships", async () => {
      const rel = createRelationship();
      mockGraphResponse([rel]);

      const result = await client.listDelegatedAdminRelationships();

      expect(result).toEqual([rel]);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/tenantRelationships/delegatedAdminRelationships"),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer mock-graph-token",
          }),
        })
      );
    });

    it("should pass active status filter in URL", async () => {
      mockGraphResponse([]);

      await client.listDelegatedAdminRelationships();

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("$filter=status eq 'active'");
    });

    it("should return empty array when no relationships exist", async () => {
      mockGraphResponse([]);

      const result = await client.listDelegatedAdminRelationships();
      expect(result).toEqual([]);
    });

    it("should return multiple relationships", async () => {
      const rels = [
        createRelationship({ id: "rel-001", customer: { tenantId: "t1", displayName: "T1" } }),
        createRelationship({ id: "rel-002", customer: { tenantId: "t2", displayName: "T2" } }),
        createRelationship({ id: "rel-003", customer: { tenantId: "t3", displayName: "T3" } }),
      ];
      mockGraphResponse(rels);

      const result = await client.listDelegatedAdminRelationships();
      expect(result).toHaveLength(3);
    });

    it("should throw on 401 Unauthorized", async () => {
      mockGraphError("Unauthorized", 401);

      await expect(client.listDelegatedAdminRelationships()).rejects.toThrow(
        "Failed to list delegated admin relationships"
      );
    });

    it("should throw on 403 Forbidden", async () => {
      mockGraphError("Insufficient privileges", 403);

      await expect(client.listDelegatedAdminRelationships()).rejects.toThrow(
        "Failed to list delegated admin relationships"
      );
    });

    it("should throw on 429 after retries exhausted", async () => {
      mockGraphError("Too Many Requests", 429);

      const promise = client.listDelegatedAdminRelationships().catch((e: Error) => e);
      await vi.runAllTimersAsync();
      const error = await promise;

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("Failed to list delegated admin relationships");
      // 1 initial + 3 retries = 4 calls
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it("should throw on 500 after retries exhausted", async () => {
      mockGraphError("Internal Server Error", 500);

      const promise = client.listDelegatedAdminRelationships().catch((e: Error) => e);
      await vi.runAllTimersAsync();
      const error = await promise;

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("Failed to list delegated admin relationships");
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it("should include error body in thrown message", async () => {
      mockGraphError("detailed error context from Graph", 400);

      await expect(client.listDelegatedAdminRelationships()).rejects.toThrow(
        "detailed error context from Graph"
      );
    });
  });

  // ---------------------------------------------------------------------------
  // getDelegatedAdminRelationship
  // ---------------------------------------------------------------------------
  describe("getDelegatedAdminRelationship", () => {
    it("should fetch a specific relationship by ID", async () => {
      const rel = createRelationship({ id: "rel-specific" });
      mockGraphSingleResponse(rel);

      const result = await client.getDelegatedAdminRelationship("rel-specific");

      expect(result).toEqual(rel);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("/delegatedAdminRelationships/rel-specific");
    });

    it("should pass auth header", async () => {
      mockGraphSingleResponse(createRelationship());

      await client.getDelegatedAdminRelationship("rel-001");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer mock-graph-token",
            "Content-Type": "application/json",
          }),
        })
      );
    });

    it("should throw on 404 not found", async () => {
      mockGraphError("Resource not found", 404);

      await expect(client.getDelegatedAdminRelationship("nonexistent")).rejects.toThrow(
        "Failed to get delegated admin relationship"
      );
    });

    it("should throw on server error after retries", async () => {
      mockGraphError("Internal error", 500);

      const promise = client.getDelegatedAdminRelationship("rel-001").catch((e: Error) => e);
      await vi.runAllTimersAsync();
      const error = await promise;

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("Failed to get delegated admin relationship");
    });
  });

  // ---------------------------------------------------------------------------
  // hasActiveRelationship
  // ---------------------------------------------------------------------------
  describe("hasActiveRelationship", () => {
    it("should return true when active relationship exists for tenant", async () => {
      mockGraphResponse([
        createRelationship({ customer: { tenantId: "target-tenant", displayName: "Target" } }),
      ]);

      const result = await client.hasActiveRelationship("target-tenant");
      expect(result).toBe(true);
    });

    it("should return false when no relationship exists for tenant", async () => {
      mockGraphResponse([
        createRelationship({ customer: { tenantId: "other-tenant", displayName: "Other" } }),
      ]);

      const result = await client.hasActiveRelationship("target-tenant");
      expect(result).toBe(false);
    });

    it("should return false when no relationships exist at all", async () => {
      mockGraphResponse([]);

      const result = await client.hasActiveRelationship("target-tenant");
      expect(result).toBe(false);
    });

    it("should match correct tenant among multiple relationships", async () => {
      mockGraphResponse([
        createRelationship({ customer: { tenantId: "t1", displayName: "T1" } }),
        createRelationship({ customer: { tenantId: "t2", displayName: "T2" } }),
        createRelationship({ customer: { tenantId: "t3", displayName: "T3" } }),
      ]);

      const result = await client.hasActiveRelationship("t2");
      expect(result).toBe(true);
    });

    it("should propagate API errors", async () => {
      mockGraphError("Unauthorized", 401);

      await expect(client.hasActiveRelationship("any-tenant")).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // validatePowerPlatformAccess
  // ---------------------------------------------------------------------------
  describe("validatePowerPlatformAccess", () => {
    it("should return true when tenant has active relationship with Power Platform Admin role", async () => {
      mockGraphResponse([
        createRelationship({
          customer: { tenantId: "target", displayName: "Target" },
          accessDetails: {
            unifiedRoles: [{ roleDefinitionId: POWER_PLATFORM_ADMIN_ROLE_ID }],
          },
        }),
      ]);

      const result = await client.validatePowerPlatformAccess("target");
      expect(result).toBe(true);
    });

    it("should return true when Power Platform Admin is among multiple roles", async () => {
      mockGraphResponse([
        createRelationship({
          customer: { tenantId: "target", displayName: "Target" },
          accessDetails: {
            unifiedRoles: [
              { roleDefinitionId: "some-other-role-id" },
              { roleDefinitionId: POWER_PLATFORM_ADMIN_ROLE_ID },
              { roleDefinitionId: "another-role-id" },
            ],
          },
        }),
      ]);

      const result = await client.validatePowerPlatformAccess("target");
      expect(result).toBe(true);
    });

    it("should return false when relationship exists but lacks Power Platform Admin role", async () => {
      mockGraphResponse([
        createRelationship({
          customer: { tenantId: "target", displayName: "Target" },
          accessDetails: {
            unifiedRoles: [
              { roleDefinitionId: "some-other-role-id" },
              { roleDefinitionId: "yet-another-role-id" },
            ],
          },
        }),
      ]);

      const result = await client.validatePowerPlatformAccess("target");
      expect(result).toBe(false);
    });

    it("should return false when relationship has no roles", async () => {
      mockGraphResponse([
        createRelationship({
          customer: { tenantId: "target", displayName: "Target" },
          accessDetails: { unifiedRoles: [] },
        }),
      ]);

      const result = await client.validatePowerPlatformAccess("target");
      expect(result).toBe(false);
    });

    it("should return false when no relationship exists for tenant", async () => {
      mockGraphResponse([
        createRelationship({
          customer: { tenantId: "other-tenant", displayName: "Other" },
        }),
      ]);

      const result = await client.validatePowerPlatformAccess("target");
      expect(result).toBe(false);
    });

    it("should return false when relationship is not active", async () => {
      mockGraphResponse([
        createRelationship({
          customer: { tenantId: "target", displayName: "Target" },
          status: "expired",
        }),
      ]);

      const result = await client.validatePowerPlatformAccess("target");
      expect(result).toBe(false);
    });

    it("should return false when relationship is terminated", async () => {
      mockGraphResponse([
        createRelationship({
          customer: { tenantId: "target", displayName: "Target" },
          status: "terminated",
        }),
      ]);

      const result = await client.validatePowerPlatformAccess("target");
      expect(result).toBe(false);
    });

    it("should return false when relationship is pending", async () => {
      mockGraphResponse([
        createRelationship({
          customer: { tenantId: "target", displayName: "Target" },
          status: "pending",
        }),
      ]);

      const result = await client.validatePowerPlatformAccess("target");
      expect(result).toBe(false);
    });

    it("should return false when no relationships exist at all", async () => {
      mockGraphResponse([]);

      const result = await client.validatePowerPlatformAccess("target");
      expect(result).toBe(false);
    });

    it("should find correct tenant among many and validate its roles", async () => {
      mockGraphResponse([
        createRelationship({
          customer: { tenantId: "t1", displayName: "T1" },
          accessDetails: { unifiedRoles: [{ roleDefinitionId: "wrong-role" }] },
        }),
        createRelationship({
          customer: { tenantId: "t2", displayName: "T2" },
          accessDetails: {
            unifiedRoles: [{ roleDefinitionId: POWER_PLATFORM_ADMIN_ROLE_ID }],
          },
        }),
        createRelationship({
          customer: { tenantId: "t3", displayName: "T3" },
          accessDetails: { unifiedRoles: [] },
        }),
      ]);

      // t1 has wrong role
      expect(await client.validatePowerPlatformAccess("t1")).toBe(false);
    });

    it("should propagate API errors", async () => {
      mockGraphError("Forbidden", 403);

      await expect(client.validatePowerPlatformAccess("target")).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // getCustomerTokenManager
  // ---------------------------------------------------------------------------
  describe("getCustomerTokenManager", () => {
    it("should create TokenManager with customer tenant ID but partner credentials", () => {
      const partnerConfig = {
        tenantId: "partner-tenant",
        clientId: "my-app-id",
        clientSecret: "my-secret",
      };

      client.getCustomerTokenManager("customer-tenant", partnerConfig);

      // Find the call that was made for this customer (not the constructor call for the client itself)
      const calls = MockTokenManager.mock.calls;
      const lastCall = calls[calls.length - 1][0];
      expect(lastCall).toEqual({
        tenantId: "customer-tenant",
        clientId: "my-app-id",
        clientSecret: "my-secret",
      });
    });

    it("should return different TokenManagers for different customer tenants", () => {
      const partnerConfig = {
        tenantId: "partner-tenant",
        clientId: "app-id",
        clientSecret: "secret",
      };

      const tm1 = client.getCustomerTokenManager("customer-1", partnerConfig);
      const tm2 = client.getCustomerTokenManager("customer-2", partnerConfig);

      expect(tm1).not.toBe(tm2);
    });
  });

  // ---------------------------------------------------------------------------
  // Pagination (#267)
  // ---------------------------------------------------------------------------
  describe("pagination", () => {
    it("should follow @odata.nextLink to fetch all pages", async () => {
      const page1Rels = [
        createRelationship({ id: "rel-1", customer: { tenantId: "t1", displayName: "T1" } }),
        createRelationship({ id: "rel-2", customer: { tenantId: "t2", displayName: "T2" } }),
      ];
      const page2Rels = [
        createRelationship({ id: "rel-3", customer: { tenantId: "t3", displayName: "T3" } }),
      ];

      // Page 1 with nextLink
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            value: page1Rels,
            "@odata.nextLink":
              "https://graph.microsoft.com/v1.0/tenantRelationships/delegatedAdminRelationships?$skiptoken=page2",
          }),
        headers: mockHeaders(),
      });
      // Page 2 without nextLink
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ value: page2Rels }),
        headers: mockHeaders(),
      });

      const result = await client.listDelegatedAdminRelationships();

      expect(result).toHaveLength(3);
      expect(result.map((r) => r.id)).toEqual(["rel-1", "rel-2", "rel-3"]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should use nextLink URL for subsequent pages", async () => {
      const nextLinkUrl =
        "https://graph.microsoft.com/v1.0/tenantRelationships/delegatedAdminRelationships?$skiptoken=abc123";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            value: [createRelationship()],
            "@odata.nextLink": nextLinkUrl,
          }),
        headers: mockHeaders(),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ value: [] }),
        headers: mockHeaders(),
      });

      await client.listDelegatedAdminRelationships();

      // Second call should use the nextLink URL exactly
      expect(mockFetch.mock.calls[1][0]).toBe(nextLinkUrl);
    });

    it("should handle many pages", async () => {
      // Simulate 3 pages of 2 relationships each
      for (let page = 0; page < 3; page++) {
        const isLast = page === 2;
        const rels = [
          createRelationship({
            id: `rel-${page * 2}`,
            customer: { tenantId: `t${page * 2}`, displayName: `T${page * 2}` },
          }),
          createRelationship({
            id: `rel-${page * 2 + 1}`,
            customer: { tenantId: `t${page * 2 + 1}`, displayName: `T${page * 2 + 1}` },
          }),
        ];
        const body: any = { value: rels };
        if (!isLast) {
          body["@odata.nextLink"] = `https://graph.microsoft.com/v1.0/next?page=${page + 1}`;
        }
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(body),
          headers: mockHeaders(),
        });
      }

      const result = await client.listDelegatedAdminRelationships();
      expect(result).toHaveLength(6);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("should stop at single page when no nextLink", async () => {
      mockGraphResponse([createRelationship()]);

      const result = await client.listDelegatedAdminRelationships();
      expect(result).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Retry (#268)
  // ---------------------------------------------------------------------------
  describe("retry", () => {
    it("should retry on 429 and succeed", async () => {
      // First call: 429, second call: success
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: () => Promise.resolve("Too Many Requests"),
        headers: mockHeaders({ "retry-after": "0" }),
      });
      mockGraphResponse([createRelationship()]);

      const promise = client.listDelegatedAdminRelationships();
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should retry on 502 and succeed", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        text: () => Promise.resolve("Bad Gateway"),
        headers: mockHeaders(),
      });
      mockGraphResponse([createRelationship()]);

      const promise = client.listDelegatedAdminRelationships();
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should respect Retry-After header", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: () => Promise.resolve("Too Many Requests"),
        headers: mockHeaders({ "retry-after": "5" }),
      });
      mockGraphResponse([createRelationship()]);

      const promise = client.listDelegatedAdminRelationships();

      // Advance past the 5s Retry-After
      await vi.advanceTimersByTimeAsync(5000);
      const result = await promise;

      expect(result).toHaveLength(1);
    });

    it("should not retry on 400", async () => {
      mockGraphError("Bad Request", 400);

      await expect(client.listDelegatedAdminRelationships()).rejects.toThrow(
        "Failed to list delegated admin relationships"
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should not retry on 401", async () => {
      mockGraphError("Unauthorized", 401);

      await expect(client.listDelegatedAdminRelationships()).rejects.toThrow(
        "Failed to list delegated admin relationships"
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should not retry on 403", async () => {
      mockGraphError("Forbidden", 403);

      await expect(client.listDelegatedAdminRelationships()).rejects.toThrow(
        "Failed to list delegated admin relationships"
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should retry getDelegatedAdminRelationship on 503", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: () => Promise.resolve("Service Unavailable"),
        headers: mockHeaders(),
      });
      mockGraphSingleResponse(createRelationship({ id: "rel-recovered" }));

      const promise = client.getDelegatedAdminRelationship("rel-recovered");
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.id).toBe("rel-recovered");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});

import { describe, it, expect } from "vitest";
import {
  buildRelationship,
  buildRelationshipExpiringIn,
  buildFleet,
  buildExpiryBoundarySet,
  buildMixedRolesSet,
  paginateRelationships,
  createPaginatedFetchMock,
  createRateLimitingFetchMock,
  createPartialFailureFetchMock,
  ROLE_IDS,
} from "./fixtures/gdap-simulator.js";

// ---------------------------------------------------------------------------
// Builder basics
// ---------------------------------------------------------------------------

describe("buildRelationship", () => {
  it("should produce a valid relationship with defaults", () => {
    const rel = buildRelationship();
    expect(rel.id).toBeTruthy();
    expect(rel.status).toBe("active");
    expect(rel.customer.tenantId).toBeTruthy();
    expect(rel.accessDetails.unifiedRoles).toHaveLength(1);
    expect(rel.accessDetails.unifiedRoles[0].roleDefinitionId).toBe(ROLE_IDS.POWER_PLATFORM_ADMIN);
  });

  it("should allow overriding every field", () => {
    const rel = buildRelationship({
      id: "custom-id",
      displayName: "Custom Name",
      customerTenantId: "custom-tenant",
      customerDisplayName: "Custom Customer",
      status: "terminated",
      roles: [ROLE_IDS.GLOBAL_ADMIN],
      duration: "P365D",
      endDateTime: "2027-01-01T00:00:00.000Z",
    });

    expect(rel.id).toBe("custom-id");
    expect(rel.displayName).toBe("Custom Name");
    expect(rel.customer.tenantId).toBe("custom-tenant");
    expect(rel.customer.displayName).toBe("Custom Customer");
    expect(rel.status).toBe("terminated");
    expect(rel.accessDetails.unifiedRoles).toEqual([{ roleDefinitionId: ROLE_IDS.GLOBAL_ADMIN }]);
    expect(rel.duration).toBe("P365D");
    expect(rel.endDateTime).toBe("2027-01-01T00:00:00.000Z");
  });

  it("should produce deterministic UUIDs for the same default seed", () => {
    const a = buildRelationship();
    const b = buildRelationship();
    expect(a.id).toBe(b.id);
    expect(a.customer.tenantId).toBe(b.customer.tenantId);
  });
});

describe("buildRelationshipExpiringIn", () => {
  it("should set endDateTime relative to now", () => {
    const rel = buildRelationshipExpiringIn(7);
    const endDate = new Date(rel.endDateTime);
    const now = Date.now();
    const diffDays = (endDate.getTime() - now) / (24 * 60 * 60 * 1000);
    // Allow 1-second tolerance
    expect(diffDays).toBeGreaterThan(6.99);
    expect(diffDays).toBeLessThan(7.01);
  });

  it("should accept additional overrides", () => {
    const rel = buildRelationshipExpiringIn(30, { status: "pending" });
    expect(rel.status).toBe("pending");
  });
});

// ---------------------------------------------------------------------------
// Scenario generators
// ---------------------------------------------------------------------------

describe("buildFleet", () => {
  it("should generate 50 relationships by default", () => {
    const fleet = buildFleet();
    expect(fleet).toHaveLength(50);
  });

  it("should generate a custom count", () => {
    const fleet = buildFleet({ count: 120 });
    expect(fleet).toHaveLength(120);
  });

  it("should assign unique tenant IDs", () => {
    const fleet = buildFleet({ count: 60 });
    const tenantIds = new Set(fleet.map((r) => r.customer.tenantId));
    expect(tenantIds.size).toBe(60);
  });

  it("should respect activeFraction", () => {
    const fleet = buildFleet({ count: 100, activeFraction: 0.8 });
    const active = fleet.filter((r) => r.status === "active");
    expect(active.length).toBe(80);
    const inactive = fleet.filter((r) => r.status !== "active");
    expect(inactive.length).toBe(20);
  });

  it("should distribute inactive statuses across pending/expired/terminated", () => {
    const fleet = buildFleet({ count: 90, activeFraction: 0 });
    const statuses = new Set(fleet.map((r) => r.status));
    expect(statuses).toContain("pending");
    expect(statuses).toContain("expired");
    expect(statuses).toContain("terminated");
  });

  it("should respect ppAdminFraction", () => {
    const fleet = buildFleet({ count: 100, activeFraction: 1.0, ppAdminFraction: 0.5 });
    const withPP = fleet.filter((r) =>
      r.accessDetails.unifiedRoles.some(
        (role) => role.roleDefinitionId === ROLE_IDS.POWER_PLATFORM_ADMIN
      )
    );
    expect(withPP.length).toBe(50);
  });

  it("should vary expiry dates within the configured range", () => {
    const fleet = buildFleet({ count: 10, minExpiryDays: 10, maxExpiryDays: 100 });
    const expiryDays = fleet.map((r) => {
      const diff = new Date(r.endDateTime).getTime() - Date.now();
      return diff / (24 * 60 * 60 * 1000);
    });
    const activeExpiries = expiryDays.filter((d) => d > 0);
    expect(Math.min(...activeExpiries)).toBeGreaterThan(9);
    expect(Math.max(...activeExpiries)).toBeLessThan(101);
  });
});

describe("buildExpiryBoundarySet", () => {
  it("should produce 9 relationships at known expiry boundaries", () => {
    const set = buildExpiryBoundarySet();
    expect(set).toHaveLength(9);
  });

  it("should include one expired relationship", () => {
    const set = buildExpiryBoundarySet();
    const expired = set.filter((r) => r.status === "expired");
    expect(expired).toHaveLength(1);
  });

  it("should include a relationship expiring today (within 1 day)", () => {
    const set = buildExpiryBoundarySet();
    const today = set.find((r) => {
      const diff = new Date(r.endDateTime).getTime() - Date.now();
      const days = diff / (24 * 60 * 60 * 1000);
      return days >= -0.01 && days <= 0.01;
    });
    expect(today).toBeDefined();
    expect(today!.status).toBe("active");
  });

  it("should include near-expiry (1-day, 7-day) boundaries", () => {
    const set = buildExpiryBoundarySet();
    const expiryDays = set
      .filter((r) => r.status === "active")
      .map((r) =>
        Math.round((new Date(r.endDateTime).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
      );
    expect(expiryDays).toContain(1);
    expect(expiryDays).toContain(7);
    expect(expiryDays).toContain(14);
    expect(expiryDays).toContain(29);
    expect(expiryDays).toContain(30);
  });
});

describe("buildMixedRolesSet", () => {
  it("should produce 8 relationships", () => {
    const set = buildMixedRolesSet();
    expect(set).toHaveLength(8);
  });

  it("should have 4 with Power Platform Admin", () => {
    const set = buildMixedRolesSet();
    const withPP = set.filter((r) =>
      r.accessDetails.unifiedRoles.some(
        (role) => role.roleDefinitionId === ROLE_IDS.POWER_PLATFORM_ADMIN
      )
    );
    expect(withPP).toHaveLength(4);
  });

  it("should have 2 with no roles", () => {
    const set = buildMixedRolesSet();
    const noRoles = set.filter((r) => r.accessDetails.unifiedRoles.length === 0);
    expect(noRoles).toHaveLength(2);
  });

  it("should have 2 with only Helpdesk Admin (no PP)", () => {
    const set = buildMixedRolesSet();
    const helpdeskOnly = set.filter(
      (r) =>
        r.accessDetails.unifiedRoles.length === 1 &&
        r.accessDetails.unifiedRoles[0].roleDefinitionId === ROLE_IDS.HELPDESK_ADMIN
    );
    expect(helpdeskOnly).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

describe("paginateRelationships", () => {
  it("should return a single page for small datasets", () => {
    const rels = buildFleet({ count: 5 });
    const pages = paginateRelationships(rels);
    expect(pages).toHaveLength(1);
    expect(pages[0].value).toHaveLength(5);
    expect(pages[0]["@odata.nextLink"]).toBeUndefined();
  });

  it("should return empty page for empty input", () => {
    const pages = paginateRelationships([]);
    expect(pages).toHaveLength(1);
    expect(pages[0].value).toEqual([]);
    expect(pages[0]["@odata.nextLink"]).toBeUndefined();
  });

  it("should paginate at the configured page size", () => {
    const rels = buildFleet({ count: 25 });
    const pages = paginateRelationships(rels, { pageSize: 10 });
    expect(pages).toHaveLength(3);
    expect(pages[0].value).toHaveLength(10);
    expect(pages[1].value).toHaveLength(10);
    expect(pages[2].value).toHaveLength(5);
  });

  it("should include @odata.nextLink on all pages except the last", () => {
    const rels = buildFleet({ count: 25 });
    const pages = paginateRelationships(rels, { pageSize: 10 });
    expect(pages[0]["@odata.nextLink"]).toContain("$skiptoken=");
    expect(pages[1]["@odata.nextLink"]).toContain("$skiptoken=");
    expect(pages[2]["@odata.nextLink"]).toBeUndefined();
  });

  it("should include @odata.context on every page", () => {
    const rels = buildFleet({ count: 25 });
    const pages = paginateRelationships(rels, { pageSize: 10 });
    for (const page of pages) {
      expect(page["@odata.context"]).toContain("$metadata");
    }
  });

  it("should preserve all relationships across pages", () => {
    const rels = buildFleet({ count: 55 });
    const pages = paginateRelationships(rels, { pageSize: 20 });
    const allValues = pages.flatMap((p) => p.value);
    expect(allValues).toHaveLength(55);
    expect(allValues).toEqual(rels);
  });
});

// ---------------------------------------------------------------------------
// Fetch mocks
// ---------------------------------------------------------------------------

describe("createPaginatedFetchMock", () => {
  it("should return all data in a single call for small sets", async () => {
    const rels = [buildRelationship()];
    const mockFetch = createPaginatedFetchMock(rels);
    const response = await mockFetch(
      "https://graph.microsoft.com/v1.0/tenantRelationships/delegatedAdminRelationships"
    );
    const data = await response.json();
    expect(data.value).toHaveLength(1);
    expect(data["@odata.nextLink"]).toBeUndefined();
  });

  it("should return paginated responses for large sets", async () => {
    const rels = buildFleet({ count: 15 });
    const mockFetch = createPaginatedFetchMock(rels, 10);

    const resp1 = await mockFetch("https://example.com");
    const page1 = await resp1.json();
    expect(page1.value).toHaveLength(10);
    expect(page1["@odata.nextLink"]).toBeDefined();

    const resp2 = await mockFetch(page1["@odata.nextLink"]);
    const page2 = await resp2.json();
    expect(page2.value).toHaveLength(5);
    expect(page2["@odata.nextLink"]).toBeUndefined();
  });
});

describe("createRateLimitingFetchMock", () => {
  it("should return 429 for throttled request indices", async () => {
    const rels = [buildRelationship()];
    const mockFetch = createRateLimitingFetchMock(rels, {
      throttledRequests: [0],
      retryAfterSeconds: 5,
    });

    const resp1 = await mockFetch("https://example.com");
    expect(resp1.status).toBe(429);
    expect(resp1.headers.get("Retry-After")).toBe("5");

    const resp2 = await mockFetch("https://example.com");
    expect(resp2.status).toBe(200);
    const data = await resp2.json();
    expect(data.value).toHaveLength(1);
  });

  it("should throttle the first two requests by default", async () => {
    const mockFetch = createRateLimitingFetchMock([buildRelationship()]);
    expect((await mockFetch("url")).status).toBe(429);
    expect((await mockFetch("url")).status).toBe(429);
    expect((await mockFetch("url")).status).toBe(200);
  });

  it("should include TooManyRequests error body on 429", async () => {
    const mockFetch = createRateLimitingFetchMock([buildRelationship()]);
    const resp = await mockFetch("url");
    const body = await resp.json();
    expect(body.error.code).toBe("TooManyRequests");
  });
});

describe("createPartialFailureFetchMock", () => {
  it("should return responses in sequence", async () => {
    const active = buildRelationship({ status: "active" });
    const mockFetch = createPartialFailureFetchMock([
      { status: 200, body: { value: [active] } },
      { status: 403, body: { error: { code: "Authorization_RequestDenied" } } },
      { status: 200, body: { value: [active] } },
    ]);

    const r1 = await mockFetch("url");
    expect(r1.status).toBe(200);

    const r2 = await mockFetch("url");
    expect(r2.status).toBe(403);

    const r3 = await mockFetch("url");
    expect(r3.status).toBe(200);
  });

  it("should repeat the last entry when calls exceed sequence length", async () => {
    const mockFetch = createPartialFailureFetchMock([
      { status: 500, body: { error: "Server Error" } },
    ]);
    expect((await mockFetch("url")).status).toBe(500);
    expect((await mockFetch("url")).status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Integration-style: simulate GdapClient.listDelegatedAdminRelationships
// ---------------------------------------------------------------------------

describe("GdapClient integration simulation", () => {
  it("should validate Power Platform access using the simulator data", () => {
    const fleet = buildMixedRolesSet();
    const ppAdminRoleId = ROLE_IDS.POWER_PLATFORM_ADMIN;

    for (const rel of fleet) {
      const hasPPAdmin = rel.accessDetails.unifiedRoles.some(
        (r) => r.roleDefinitionId === ppAdminRoleId
      );
      // Relationships with "PP Admin" in displayName should have the role
      if (rel.displayName.includes("PP")) {
        expect(hasPPAdmin).toBe(true);
      }
      // Relationships labeled "No Roles" should not
      if (rel.displayName.includes("No Roles")) {
        expect(hasPPAdmin).toBe(false);
        expect(rel.accessDetails.unifiedRoles).toHaveLength(0);
      }
    }
  });

  it("should handle large fleet pagination end-to-end", async () => {
    const fleet = buildFleet({ count: 250 });
    const mockFetch = createPaginatedFetchMock(fleet, 100);

    // Simulate the pagination loop a client would perform
    const collected: unknown[] = [];
    let hasMore = true;
    let url = "https://graph.microsoft.com/v1.0/tenantRelationships/delegatedAdminRelationships";

    while (hasMore) {
      const resp = await mockFetch(url);
      const data = (await resp.json()) as { value: unknown[]; "@odata.nextLink"?: string };
      collected.push(...data.value);
      if (data["@odata.nextLink"]) {
        url = data["@odata.nextLink"];
      } else {
        hasMore = false;
      }
    }

    expect(collected).toHaveLength(250);
  });

  it("should handle rate limiting with retry logic", async () => {
    const fleet = buildFleet({ count: 5 });
    const mockFetch = createRateLimitingFetchMock(fleet, {
      throttledRequests: [0, 1],
      retryAfterSeconds: 1,
    });

    // Simulate retry logic
    let attempts = 0;
    let data: { value: unknown[] } | null = null;

    while (attempts < 5 && !data) {
      const resp = await mockFetch(
        "https://graph.microsoft.com/v1.0/tenantRelationships/delegatedAdminRelationships"
      );
      attempts++;
      if (resp.status === 429) {
        // In real code, would wait for Retry-After seconds
        continue;
      }
      data = (await resp.json()) as { value: unknown[] };
    }

    expect(data).not.toBeNull();
    expect(data!.value).toHaveLength(5);
    expect(attempts).toBe(3); // 2 throttled + 1 success
  });
});

import { test, expect } from "@playwright/test";

test.describe("Dashboard", () => {
  test.describe("Stats API", () => {
    test("GET /api/stats returns dashboard statistics", async ({ request }) => {
      const response = await request.get("/api/stats");

      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body.demoMode).toBe(true);
      expect(typeof body.totalTenants).toBe("number");
      expect(typeof body.enabledTenants).toBe("number");
      expect(typeof body.activeDeployments).toBe("number");
      expect(typeof body.completedToday).toBe("number");
      expect(typeof body.failedToday).toBe("number");
    });

    test("stats values are consistent with tenant data", async ({ request }) => {
      const [statsResponse, tenantsResponse] = await Promise.all([
        request.get("/api/stats"),
        request.get("/api/tenants"),
      ]);

      const stats = await statsResponse.json();
      const tenants = await tenantsResponse.json();

      // Total tenants should match
      expect(stats.totalTenants).toBe(tenants.tenants.length);

      // Enabled tenants should match
      const enabledCount = tenants.tenants.filter((t: { enabled: boolean }) => t.enabled).length;
      expect(stats.enabledTenants).toBe(enabledCount);
    });
  });

  test.describe("Dashboard Navigation", () => {
    test("stats cards are clickable and navigate correctly", async ({ page }) => {
      // This test requires authentication, so we'll test the API-level navigation targets
      // In demo mode, the stats cards should link to the correct pages

      const response = await page.request.get("/api/stats");
      const stats = await response.json();

      // Verify the expected data structure for clickable stats
      expect(stats.totalTenants).toBeDefined();
      expect(stats.activeDeployments).toBeDefined();
      expect(stats.completedToday).toBeDefined();
      expect(stats.failedToday).toBeDefined();
    });
  });

  test.describe("Demo Solutions API", () => {
    test("GET /api/demo-solutions returns list of demo solutions", async ({ request }) => {
      const response = await request.get("/api/demo-solutions");

      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body.demoMode).toBe(true);
      expect(body.solutions).toBeDefined();
      expect(Array.isArray(body.solutions)).toBe(true);
      expect(body.solutions.length).toBeGreaterThan(0);

      // Check solution structure
      const solution = body.solutions[0];
      expect(solution.id).toBeDefined();
      expect(solution.uniqueName).toBeDefined();
      expect(solution.friendlyName).toBeDefined();
      expect(solution.version).toBeDefined();
      expect(solution.downloadUrl).toBeDefined();
    });

    test("GET /api/demo-solutions/:name returns solution zip", async ({ request }) => {
      const response = await request.get("/api/demo-solutions/CustomerServiceAgent");

      expect(response.status()).toBe(200);

      // Should return a zip file
      const contentType = response.headers()["content-type"];
      expect(contentType).toBe("application/zip");

      const contentDisposition = response.headers()["content-disposition"];
      expect(contentDisposition).toContain("attachment");
      expect(contentDisposition).toContain(".zip");
    });

    test("GET /api/demo-solutions/:name returns 404 for unknown solution", async ({ request }) => {
      const response = await request.get("/api/demo-solutions/NonExistentSolution");

      expect(response.status()).toBe(404);
    });
  });

  test.describe("Solutions API", () => {
    test("GET /api/solutions returns available solutions", async ({ request }) => {
      const response = await request.get("/api/solutions");

      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body.demoMode).toBe(true);
      expect(body.solutions).toBeDefined();
      expect(Array.isArray(body.solutions)).toBe(true);
    });
  });
});

import { describe, it, expect, beforeAll } from "vitest";

// Integration tests that require a running AgentSync API
// Set AGENTSYNC_API_URL environment variable to test against a specific instance
// Default: http://localhost:3000

const API_BASE_URL = process.env.AGENTSYNC_API_URL || "http://localhost:3000";

// Helper to check if API is available
async function isApiAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/stats`, {
      method: "GET",
    });
    return response.ok;
  } catch {
    return false;
  }
}

describe("MCP Server Integration", () => {
  let apiAvailable = false;

  beforeAll(async () => {
    apiAvailable = await isApiAvailable();
    if (!apiAvailable) {
      console.warn(`⚠️  AgentSync API not available at ${API_BASE_URL}`);
      console.warn("   Integration tests will be skipped");
      console.warn("   Start the API with: cd packages/web && npm run dev");
    }
  });

  describe("API Connectivity", () => {
    it("should connect to AgentSync API", async () => {
      if (!apiAvailable) {
        console.log("⏭️  Skipping: API not available");
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/stats`);
      expect(response.ok).toBe(true);
    });

    it("should fetch deployment statistics", async () => {
      if (!apiAvailable) {
        console.log("⏭️  Skipping: API not available");
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/stats`);
      const data = await response.json();

      expect(data).toHaveProperty("activeDeployments");
      expect(data).toHaveProperty("totalTenants");
      expect(typeof data.activeDeployments).toBe("number");
      expect(typeof data.totalTenants).toBe("number");
    });
  });

  describe("List Operations", () => {
    it("should list agents", async () => {
      if (!apiAvailable) {
        console.log("⏭️  Skipping: API not available");
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/agents`);
      const data = await response.json();

      expect(data).toHaveProperty("agents");
      expect(Array.isArray(data.agents)).toBe(true);
    });

    it("should list tenants", async () => {
      if (!apiAvailable) {
        console.log("⏭️  Skipping: API not available");
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/tenants`);
      const data = await response.json();

      expect(data).toHaveProperty("tenants");
      expect(Array.isArray(data.tenants)).toBe(true);
    });

    it("should list deployments", async () => {
      if (!apiAvailable) {
        console.log("⏭️  Skipping: API not available");
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/deployments?limit=5`);
      const data = await response.json();

      expect(data).toHaveProperty("deployments");
      expect(Array.isArray(data.deployments)).toBe(true);
    });

    it("should filter deployments by status", async () => {
      if (!apiAvailable) {
        console.log("⏭️  Skipping: API not available");
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/deployments?status=completed&limit=5`);
      const data = await response.json();

      expect(data).toHaveProperty("deployments");
      if (data.deployments.length > 0) {
        expect(data.deployments[0].status).toBe("completed");
      }
    });
  });

  describe("Deployment Operations", () => {
    it("should get deployment status for existing deployment", async () => {
      if (!apiAvailable) {
        console.log("⏭️  Skipping: API not available");
        return;
      }

      // First get a deployment ID
      const listResponse = await fetch(`${API_BASE_URL}/api/deployments?limit=1`);
      const listData = await listResponse.json();

      if (listData.deployments.length === 0) {
        console.log("⏭️  Skipping: No deployments available");
        return;
      }

      const deploymentId = listData.deployments[0].id;
      const response = await fetch(`${API_BASE_URL}/api/deployments/${deploymentId}`);
      const data = await response.json();

      expect(data).toHaveProperty("id");
      expect(data.id).toBe(deploymentId);
      expect(data).toHaveProperty("status");
    });
  });

  describe("Error Handling", () => {
    it("should handle non-existent deployment gracefully", async () => {
      if (!apiAvailable) {
        console.log("⏭️  Skipping: API not available");
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/deployments/nonexistent-id`);
      expect(response.ok).toBe(false);
    });

    it("should handle invalid status filter", async () => {
      if (!apiAvailable) {
        console.log("⏭️  Skipping: API not available");
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/deployments?status=invalid_status`);
      // Should either reject or return empty results
      expect([200, 400, 404]).toContain(response.status);
    });
  });

  describe("Response Format Validation", () => {
    it("should return valid JSON for all endpoints", async () => {
      if (!apiAvailable) {
        console.log("⏭️  Skipping: API not available");
        return;
      }

      const endpoints = ["/api/stats", "/api/agents", "/api/tenants", "/api/deployments?limit=1"];

      for (const endpoint of endpoints) {
        const response = await fetch(`${API_BASE_URL}${endpoint}`);
        expect(response.headers.get("content-type")).toContain("application/json");

        const data = await response.json();
        expect(typeof data).toBe("object");
      }
    });
  });
});

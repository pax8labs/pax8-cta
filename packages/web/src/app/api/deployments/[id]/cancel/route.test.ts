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

import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { NextRequest } from "next/server";

// Mock dependencies
vi.mock("@/lib/api-middleware", () => ({
  requireRoles: vi.fn(),
  logAuthFailure: vi.fn(),
}));

vi.mock("@agentsync/core", () => ({
  isDemoMode: vi.fn(() => true),
}));

vi.mock("@/lib/demo-store", () => ({
  demoDeployments: new Map([
    [
      "deployment-1",
      {
        id: "deployment-1",
        status: "in_progress",
        tenantResults: [
          { tenantId: "tenant-1", status: "pending" },
          { tenantId: "tenant-2", status: "in_progress" },
          { tenantId: "tenant-3", status: "completed" },
        ],
        updatedAt: "2024-01-01T00:00:00Z",
      },
    ],
    [
      "deployment-2",
      {
        id: "deployment-2",
        status: "completed",
        tenantResults: [],
        updatedAt: "2024-01-01T00:00:00Z",
      },
    ],
  ]),
  demoBatches: new Map(),
  demoDeploymentsV2: [],
}));

vi.mock("@agentsync/worker", () => ({
  DeploymentQueueManager: vi.fn(),
}));

describe("POST /api/deployments/[id]/cancel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should require Admin or Deployer role", async () => {
    const { requireRoles } = await import("@/lib/api-middleware");

    vi.mocked(requireRoles).mockResolvedValue(
      new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }) as any
    );

    const request = new NextRequest("http://localhost/api/deployments/123/cancel", {
      method: "POST",
    });

    const response = await POST(request, { params: { id: "123" } });

    expect(response.status).toBe(403);
    expect(vi.mocked(requireRoles)).toHaveBeenCalledWith(["admin", "deployer"]);
  });

  it("should return 404 when deployment not found", async () => {
    const { requireRoles } = await import("@/lib/api-middleware");

    vi.mocked(requireRoles).mockResolvedValue({
      user: { email: "admin@example.com", roles: ["admin"] },
    } as any);

    const request = new NextRequest("http://localhost/api/deployments/999/cancel", {
      method: "POST",
    });

    const response = await POST(request, { params: { id: "999" } });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain("not found");
  });

  it("should only allow cancellation of in-progress or pending deployments", async () => {
    const { requireRoles } = await import("@/lib/api-middleware");

    vi.mocked(requireRoles).mockResolvedValue({
      user: { email: "admin@example.com", roles: ["admin"] },
    } as any);

    const request = new NextRequest("http://localhost/api/deployments/deployment-2/cancel", {
      method: "POST",
    });

    const response = await POST(request, { params: { id: "deployment-2" } });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Can only cancel in-progress or pending deployments");
  });

  it("should successfully cancel in-progress deployment", async () => {
    const { requireRoles } = await import("@/lib/api-middleware");

    vi.mocked(requireRoles).mockResolvedValue({
      user: { email: "deployer@example.com", roles: ["deployer"] },
    } as any);

    const request = new NextRequest("http://localhost/api/deployments/deployment-1/cancel", {
      method: "POST",
    });

    const response = await POST(request, { params: { id: "deployment-1" } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.message).toContain("Cancelled");
    expect(data.cancelledCount).toBe(2); // tenant-1 pending + tenant-2 in_progress
  });

  it("should update deployment status to cancelled", async () => {
    const { requireRoles } = await import("@/lib/api-middleware");
    const { demoDeployments } = await import("@/lib/demo-store");

    vi.mocked(requireRoles).mockResolvedValue({
      user: { email: "admin@example.com", roles: ["admin"] },
    } as any);

    // Get initial status
    const deployment = demoDeployments.get("deployment-1");
    expect(deployment?.status).toBe("in_progress");

    const request = new NextRequest("http://localhost/api/deployments/deployment-1/cancel", {
      method: "POST",
    });

    await POST(request, { params: { id: "deployment-1" } });

    // Verify status changed
    const updatedDeployment = demoDeployments.get("deployment-1");
    expect(updatedDeployment?.status).toBe("cancelled");
  });

  it("should only cancel pending and in-progress tenants, not completed ones", async () => {
    const { requireRoles } = await import("@/lib/api-middleware");
    const { demoDeployments } = await import("@/lib/demo-store");

    vi.mocked(requireRoles).mockResolvedValue({
      user: { email: "admin@example.com", roles: ["admin"] },
    } as any);

    const request = new NextRequest("http://localhost/api/deployments/deployment-1/cancel", {
      method: "POST",
    });

    const response = await POST(request, { params: { id: "deployment-1" } });
    const data = await response.json();

    // Should cancel 2 tenants (pending + in_progress), not the completed one
    expect(data.cancelledCount).toBe(2);

    const deployment = demoDeployments.get("deployment-1");
    const tenantStatuses = deployment?.tenantResults.map((t) => t.status);

    // Verify statuses
    expect(tenantStatuses).toContain("cancelled"); // tenant-1 and tenant-2
    expect(tenantStatuses).toContain("completed"); // tenant-3 should remain completed
  });

  it("should add cancellation error message to cancelled tenants", async () => {
    const { requireRoles } = await import("@/lib/api-middleware");
    const { demoDeployments } = await import("@/lib/demo-store");

    vi.mocked(requireRoles).mockResolvedValue({
      user: { email: "admin@example.com", roles: ["admin"] },
    } as any);

    const request = new NextRequest("http://localhost/api/deployments/deployment-1/cancel", {
      method: "POST",
    });

    await POST(request, { params: { id: "deployment-1" } });

    const deployment = demoDeployments.get("deployment-1");
    const cancelledTenants = deployment?.tenantResults.filter((t) => t.status === "cancelled");

    // Verify cancelled tenants have error message
    cancelledTenants?.forEach((tenant) => {
      expect(tenant.error).toBe("Deployment cancelled by user");
    });
  });

  it("should allow Deployer role to cancel deployments", async () => {
    const { requireRoles } = await import("@/lib/api-middleware");

    vi.mocked(requireRoles).mockResolvedValue({
      user: { email: "deployer@example.com", roles: ["deployer"] },
    } as any);

    const request = new NextRequest("http://localhost/api/deployments/deployment-1/cancel", {
      method: "POST",
    });

    const response = await POST(request, { params: { id: "deployment-1" } });

    expect(response.status).toBe(200);
  });

  it("should update deployment timestamp", async () => {
    const { requireRoles } = await import("@/lib/api-middleware");
    const { demoDeployments } = await import("@/lib/demo-store");

    vi.mocked(requireRoles).mockResolvedValue({
      user: { email: "admin@example.com", roles: ["admin"] },
    } as any);

    const originalTimestamp = demoDeployments.get("deployment-1")?.updatedAt;

    const request = new NextRequest("http://localhost/api/deployments/deployment-1/cancel", {
      method: "POST",
    });

    await POST(request, { params: { id: "deployment-1" } });

    const updatedTimestamp = demoDeployments.get("deployment-1")?.updatedAt;
    expect(updatedTimestamp).not.toBe(originalTimestamp);
  });
});

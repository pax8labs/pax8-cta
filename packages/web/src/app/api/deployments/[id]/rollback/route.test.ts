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
import { NextRequest, NextResponse } from "next/server";

// Mock dependencies
vi.mock("@/lib/api-middleware", () => ({
  requireRole: vi.fn(),
  logAuthFailure: vi.fn(),
}));

vi.mock("@agentsync/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@agentsync/core")>()),
  isDemoMode: vi.fn(() => true),
  loadConfig: vi.fn(() => Promise.resolve({ settings: {} })),
  RollbackService: vi.fn(),
  TokenManager: vi.fn(),
  DataverseClient: vi.fn(),
}));

const { mockDemoDeployments } = vi.hoisted(() => {
  const mkMap = () =>
    new Map([
      [
        "deployment-1",
        {
          id: "deployment-1",
          status: "completed",
          updatedAt: "2024-01-01T00:00:00Z",
        },
      ],
      [
        "deployment-2",
        {
          id: "deployment-2",
          status: "in_progress",
          updatedAt: "2024-01-01T00:00:00Z",
        },
      ],
    ]);
  return { mockDemoDeployments: mkMap() };
});

vi.mock("@/lib/demo-store", () => ({
  demoDeployments: mockDemoDeployments,
  demoBatches: new Map(),
  demoDeploymentsV2: { getByBatchId: vi.fn(() => []), set: vi.fn() },
}));

vi.mock("@/lib/repositories/deployment-repository", () => ({
  updateBatchStatus: vi.fn(),
}));

vi.mock("@/lib/repositories/snapshot-repository", () => ({
  getSnapshot: vi.fn(),
}));

vi.mock("@/lib/repositories/audit-repository", () => ({
  logDeploymentAction: vi.fn(),
  logRollbackAction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  AppRoles: { ADMIN: "admin", DEPLOYER: "deployer", VIEWER: "viewer" },
}));

vi.mock("@/lib/rate-limit", () => ({
  deploymentRateLimit: vi.fn(() =>
    Promise.resolve({ success: true, remaining: 99, reset: Date.now() + 60000 })
  ),
  createRateLimitResponse: vi.fn(),
}));

describe("POST /api/deployments/[id]/rollback", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Re-mock isDemoMode since clearAllMocks resets mock return values
    const { isDemoMode } = await import("@agentsync/core");
    vi.mocked(isDemoMode).mockReturnValue(true);
    // Reset deployment state since tests mutate the shared Map
    mockDemoDeployments.set("deployment-1", {
      id: "deployment-1",
      status: "completed",
      updatedAt: "2024-01-01T00:00:00Z",
    });
    mockDemoDeployments.set("deployment-2", {
      id: "deployment-2",
      status: "in_progress",
      updatedAt: "2024-01-01T00:00:00Z",
    });
  });

  it("should require Admin role", async () => {
    const { requireRole } = await import("@/lib/api-middleware");

    vi.mocked(requireRole).mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );

    const request = new NextRequest("http://localhost/api/deployments/123/rollback", {
      method: "POST",
    });

    const response = await POST(request, { params: Promise.resolve({ id: "123" }) });

    expect(response.status).toBe(403);
    expect(vi.mocked(requireRole)).toHaveBeenCalledWith("admin");
  });

  it("should return 404 when deployment not found", async () => {
    const { requireRole } = await import("@/lib/api-middleware");

    vi.mocked(requireRole).mockResolvedValue({
      user: { email: "admin@example.com", roles: ["admin"] },
    } as any);

    const request = new NextRequest("http://localhost/api/deployments/999/rollback", {
      method: "POST",
    });

    const response = await POST(request, { params: Promise.resolve({ id: "999" }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error.message).toContain("not found");
  });

  it("should only allow rollback of completed or failed deployments", async () => {
    const { requireRole } = await import("@/lib/api-middleware");

    vi.mocked(requireRole).mockResolvedValue({
      user: { email: "admin@example.com", roles: ["admin"] },
    } as any);

    const request = new NextRequest("http://localhost/api/deployments/deployment-2/rollback", {
      method: "POST",
    });

    const response = await POST(request, { params: Promise.resolve({ id: "deployment-2" }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error.message).toContain("Can only rollback completed or failed deployments");
  });

  it("should successfully initiate rollback for completed deployment", async () => {
    const { requireRole } = await import("@/lib/api-middleware");
    const { updateBatchStatus } = await import("@/lib/repositories/deployment-repository");

    vi.mocked(requireRole).mockResolvedValue({
      user: { email: "admin@example.com", roles: ["admin"] },
    } as any);

    const request = new NextRequest("http://localhost/api/deployments/deployment-1/rollback", {
      method: "POST",
    });

    const response = await POST(request, { params: Promise.resolve({ id: "deployment-1" }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.message).toContain("Rolling back deployment");
    expect(data.demoMode).toBe(true);
    expect(data.deploymentId).toBe("deployment-1");
    expect(vi.mocked(updateBatchStatus)).toHaveBeenCalledWith("deployment-1", "rolling_back");
  });

  it("should update deployment status to rolling_back", async () => {
    const { requireRole } = await import("@/lib/api-middleware");
    const { demoDeployments } = await import("@/lib/demo-store");

    vi.mocked(requireRole).mockResolvedValue({
      user: { email: "admin@example.com", roles: ["admin"] },
    } as any);

    // Get initial status
    const deployment = demoDeployments.get("deployment-1");
    expect(deployment?.status).toBe("completed");

    const request = new NextRequest("http://localhost/api/deployments/deployment-1/rollback", {
      method: "POST",
    });

    await POST(request, { params: Promise.resolve({ id: "deployment-1" }) });

    // Verify status changed
    const updatedDeployment = demoDeployments.get("deployment-1");
    expect(updatedDeployment?.status).toBe("rolling_back");
    expect(updatedDeployment?.updatedAt).not.toBe("2024-01-01T00:00:00Z");
  });

  it("should handle database update errors gracefully in demo mode", async () => {
    const { requireRole } = await import("@/lib/api-middleware");
    const { updateBatchStatus } = await import("@/lib/repositories/deployment-repository");

    vi.mocked(requireRole).mockResolvedValue({
      user: { email: "admin@example.com", roles: ["admin"] },
    } as any);

    // Mock database error
    vi.mocked(updateBatchStatus).mockImplementation(() => {
      throw new Error("Database error");
    });

    const request = new NextRequest("http://localhost/api/deployments/deployment-1/rollback", {
      method: "POST",
    });

    const response = await POST(request, { params: Promise.resolve({ id: "deployment-1" }) });

    // Should still succeed in demo mode even if database update fails
    expect(response.status).toBe(200);
  });

  it("should restrict rollback to Admin role only, not Deployer", async () => {
    const { requireRole } = await import("@/lib/api-middleware");

    vi.mocked(requireRole).mockResolvedValue(
      NextResponse.json({ error: "Admin role required" }, { status: 403 })
    );

    const request = new NextRequest("http://localhost/api/deployments/deployment-1/rollback", {
      method: "POST",
    });

    const response = await POST(request, { params: Promise.resolve({ id: "deployment-1" }) });

    expect(response.status).toBe(403);
    // Verify it's checking specifically for Admin, not Deployer
    expect(vi.mocked(requireRole)).toHaveBeenCalledWith("admin");
  });
});

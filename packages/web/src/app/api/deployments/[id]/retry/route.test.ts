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
  loadConfig: vi.fn(() => Promise.resolve({ settings: {} })),
  DEPLOYMENT_STATUS_CATEGORIES: {
    RETRYABLE: ["failed", "cancelled", "rolled_back"],
  },
}));

vi.mock("@/lib/demo-store", () => ({
  resolveDeployment: vi.fn(),
  demoDeployments: [],
}));

vi.mock("@/lib/posthog-server", () => ({
  serverTrackDeployment: vi.fn(),
  serverTrackError: vi.fn(),
}));

describe("POST /api/deployments/[id]/retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should require Admin or Deployer role", async () => {
    const { requireRoles } = await import("@/lib/api-middleware");

    vi.mocked(requireRoles).mockResolvedValue(
      new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }) as any
    );

    const request = new NextRequest("http://localhost/api/deployments/123/retry", {
      method: "POST",
    });

    const response = await POST(request, { params: { id: "123" } });

    expect(response.status).toBe(403);
    expect(vi.mocked(requireRoles)).toHaveBeenCalledWith(["admin", "deployer"]);
  });

  it("should return 404 when deployment not found", async () => {
    const { requireRoles } = await import("@/lib/api-middleware");
    const { resolveDeployment } = await import("@/lib/demo-store");

    vi.mocked(requireRoles).mockResolvedValue({
      user: { email: "admin@example.com", roles: ["admin"] },
    } as any);

    vi.mocked(resolveDeployment).mockReturnValue(null);

    const request = new NextRequest("http://localhost/api/deployments/999/retry", {
      method: "POST",
    });

    const response = await POST(request, { params: { id: "999" } });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain("not found");
  });

  it("should return 400 when no retryable tenants exist", async () => {
    const { requireRoles } = await import("@/lib/api-middleware");
    const { resolveDeployment } = await import("@/lib/demo-store");

    vi.mocked(requireRoles).mockResolvedValue({
      user: { email: "admin@example.com", roles: ["admin"] },
    } as any);

    vi.mocked(resolveDeployment).mockReturnValue({
      id: "123",
      batchId: "batch-1",
      solutionName: "TestAgent",
      status: "completed",
      tenantResults: [
        { tenantId: "tenant-1", status: "completed" },
        { tenantId: "tenant-2", status: "completed" },
      ],
    } as any);

    const request = new NextRequest("http://localhost/api/deployments/123/retry", {
      method: "POST",
    });

    const response = await POST(request, { params: { id: "123" } });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("No failed or cancelled tenants");
  });

  it("should retry failed tenant deployments", async () => {
    const { requireRoles } = await import("@/lib/api-middleware");
    const { resolveDeployment } = await import("@/lib/demo-store");
    const { serverTrackDeployment } = await import("@/lib/posthog-server");

    vi.mocked(requireRoles).mockResolvedValue({
      user: { email: "admin@example.com", roles: ["admin"] },
    } as any);

    const mockDeployment = {
      id: "123",
      batchId: "batch-1",
      solutionName: "TestAgent",
      status: "in_progress",
      tenantResults: [
        { tenantId: "tenant-1", status: "completed" },
        { tenantId: "tenant-2", status: "failed" },
        { tenantId: "tenant-3", status: "cancelled" },
      ],
    };

    vi.mocked(resolveDeployment).mockReturnValue(mockDeployment as any);

    const request = new NextRequest("http://localhost/api/deployments/123/retry", {
      method: "POST",
    });

    const response = await POST(request, { params: { id: "123" } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.message).toContain("Retrying");
    expect(data.retriedCount).toBe(2);
    expect(data.tenantIds).toEqual(["tenant-2", "tenant-3"]);
  });

  it("should only retry retryable statuses (failed, cancelled, rolled_back)", async () => {
    const { requireRoles } = await import("@/lib/api-middleware");
    const { resolveDeployment } = await import("@/lib/demo-store");

    vi.mocked(requireRoles).mockResolvedValue({
      user: { email: "admin@example.com", roles: ["admin"] },
    } as any);

    const mockDeployment = {
      id: "123",
      batchId: "batch-1",
      solutionName: "TestAgent",
      status: "in_progress",
      tenantResults: [
        { tenantId: "tenant-1", status: "failed" }, // Retryable
        { tenantId: "tenant-2", status: "cancelled" }, // Retryable
        { tenantId: "tenant-3", status: "rolled_back" }, // Retryable
        { tenantId: "tenant-4", status: "in_progress" }, // Not retryable
        { tenantId: "tenant-5", status: "pending" }, // Not retryable
      ],
    };

    vi.mocked(resolveDeployment).mockReturnValue(mockDeployment as any);

    const request = new NextRequest("http://localhost/api/deployments/123/retry", {
      method: "POST",
    });

    const response = await POST(request, { params: { id: "123" } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.retriedCount).toBe(3);
    expect(data.tenantIds).toEqual(["tenant-1", "tenant-2", "tenant-3"]);
  });

  it("should track retry analytics", async () => {
    const { requireRoles } = await import("@/lib/api-middleware");
    const { resolveDeployment } = await import("@/lib/demo-store");
    const { serverTrackDeployment } = await import("@/lib/posthog-server");

    vi.mocked(requireRoles).mockResolvedValue({
      user: { email: "admin@example.com", roles: ["admin"] },
    } as any);

    vi.mocked(resolveDeployment).mockReturnValue({
      id: "123",
      batchId: "batch-1",
      solutionName: "TestAgent",
      status: "in_progress",
      tenantResults: [{ tenantId: "tenant-1", status: "failed" }],
    } as any);

    const request = new NextRequest("http://localhost/api/deployments/123/retry", {
      method: "POST",
    });

    await POST(request, { params: { id: "123" } });

    expect(vi.mocked(serverTrackDeployment)).toHaveBeenCalledWith(
      "123",
      expect.objectContaining({
        action: "retry",
      })
    );
  });
});

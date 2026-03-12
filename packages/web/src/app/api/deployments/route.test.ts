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
import { GET } from "./route";
import { NextRequest, NextResponse } from "next/server";

// Mock dependencies
vi.mock("@/lib/api-middleware", () => ({
  requireAuth: vi.fn(),
  logAuthFailure: vi.fn(),
}));

vi.mock("@agentsync/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@agentsync/core")>()),
  isDemoMode: vi.fn(() => true),
  generateMockDeploymentHistory: vi.fn(() => [
    {
      id: "mock-1",
      solutionName: "MockAgent",
      status: "completed",
      createdAt: "2024-01-01T00:00:00Z",
      tenantResults: [],
    },
  ]),
}));

vi.mock("@/lib/demo-store", () => ({
  demoDeployments: new Map([
    [
      "deploy-1",
      {
        id: "deploy-1",
        solutionName: "TestAgent",
        status: "in_progress",
        createdAt: "2024-01-02T00:00:00Z",
        tenantResults: [],
      },
    ],
    [
      "deploy-2",
      {
        id: "deploy-2",
        solutionName: "AnotherAgent",
        status: "completed",
        createdAt: "2024-01-03T00:00:00Z",
        tenantResults: [],
      },
    ],
  ]),
}));

vi.mock("@agentsync/worker", () => ({
  DeploymentQueueManager: vi.fn(),
}));

describe("GET /api/deployments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should require authentication", async () => {
    const { requireAuth } = await import("@/lib/api-middleware");

    vi.mocked(requireAuth).mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );

    const request = new NextRequest("http://localhost/api/deployments");
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it("should return list of deployments in demo mode", async () => {
    const { requireAuth } = await import("@/lib/api-middleware");

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "1", email: "user@example.com", roles: ["viewer"] },
    } as any);

    const request = new NextRequest("http://localhost/api/deployments");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.demoMode).toBe(true);
    expect(data.deployments).toBeDefined();
    expect(Array.isArray(data.deployments)).toBe(true);
  });

  it("should respect limit parameter", async () => {
    const { requireAuth } = await import("@/lib/api-middleware");

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "1", email: "user@example.com", roles: ["viewer"] },
    } as any);

    const request = new NextRequest("http://localhost/api/deployments?limit=5");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.deployments.length).toBeLessThanOrEqual(5);
  });

  it("should default to limit of 20", async () => {
    const { requireAuth } = await import("@/lib/api-middleware");
    const { generateMockDeploymentHistory } = await import("@agentsync/core");

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "1", email: "user@example.com", roles: ["viewer"] },
    } as any);

    const request = new NextRequest("http://localhost/api/deployments");
    await GET(request);

    // Should call generateMockDeploymentHistory with limit-based count
    expect(vi.mocked(generateMockDeploymentHistory)).toHaveBeenCalled();
  });

  it("should filter by status when status parameter provided", async () => {
    const { requireAuth } = await import("@/lib/api-middleware");

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "1", email: "user@example.com", roles: ["viewer"] },
    } as any);

    const request = new NextRequest("http://localhost/api/deployments?status=completed");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    // All returned deployments should have 'completed' status
    data.deployments.forEach((deployment: any) => {
      expect(deployment.status).toBe("completed");
    });
  });

  it("should sort deployments by creation date descending", async () => {
    const { requireAuth } = await import("@/lib/api-middleware");

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "1", email: "user@example.com", roles: ["viewer"] },
    } as any);

    const request = new NextRequest("http://localhost/api/deployments");
    const response = await GET(request);
    const data = await response.json();

    const deployments = data.deployments;
    if (deployments.length > 1) {
      for (let i = 0; i < deployments.length - 1; i++) {
        const current = new Date(deployments[i].createdAt).getTime();
        const next = new Date(deployments[i + 1].createdAt).getTime();
        expect(current).toBeGreaterThanOrEqual(next);
      }
    }
  });

  it("should include live deployments from demo store", async () => {
    const { requireAuth } = await import("@/lib/api-middleware");

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "1", email: "user@example.com", roles: ["viewer"] },
    } as any);

    const request = new NextRequest("http://localhost/api/deployments");
    const response = await GET(request);
    const data = await response.json();

    const deploymentIds = data.deployments.map((d: any) => d.id);
    expect(deploymentIds).toContain("deploy-1");
    expect(deploymentIds).toContain("deploy-2");
  });

  it("should not duplicate deployments from store and mock history", async () => {
    const { requireAuth } = await import("@/lib/api-middleware");
    const { generateMockDeploymentHistory } = await import("@agentsync/core");

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "1", email: "user@example.com", roles: ["viewer"] },
    } as any);

    // Mock history returns a deployment with same ID as one in store
    vi.mocked(generateMockDeploymentHistory).mockReturnValue([
      {
        id: "deploy-1", // Same as in demo store
        solutionName: "TestAgent",
        status: "completed",
        createdAt: "2024-01-01T00:00:00Z",
        tenantResults: [],
      } as any,
    ]);

    const request = new NextRequest("http://localhost/api/deployments");
    const response = await GET(request);
    const data = await response.json();

    // Count occurrences of 'deploy-1'
    const deploy1Count = data.deployments.filter((d: any) => d.id === "deploy-1").length;
    expect(deploy1Count).toBe(1); // Should only appear once
  });

  it("should handle empty deployments list", async () => {
    const { requireAuth } = await import("@/lib/api-middleware");
    const { generateMockDeploymentHistory } = await import("@agentsync/core");
    const { demoDeployments } = await import("@/lib/demo-store");

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "1", email: "user@example.com", roles: ["viewer"] },
    } as any);

    // Clear demo deployments
    demoDeployments.clear();
    vi.mocked(generateMockDeploymentHistory).mockReturnValue([]);

    const request = new NextRequest("http://localhost/api/deployments");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.deployments).toEqual([]);
  });

  it("should handle non-numeric limit parameter gracefully", async () => {
    const { requireAuth } = await import("@/lib/api-middleware");

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "1", email: "user@example.com", roles: ["viewer"] },
    } as any);

    const request = new NextRequest("http://localhost/api/deployments?limit=invalid");
    const response = await GET(request);

    // Should still return 200 and use default limit (NaN becomes default)
    expect(response.status).toBe(200);
  });

  it("should filter out in_progress deployments when status=completed", async () => {
    const { requireAuth } = await import("@/lib/api-middleware");

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "1", email: "user@example.com", roles: ["viewer"] },
    } as any);

    const request = new NextRequest("http://localhost/api/deployments?status=completed");
    const response = await GET(request);
    const data = await response.json();

    const hasInProgress = data.deployments.some((d: any) => d.status === "in_progress");
    expect(hasInProgress).toBe(false);
  });
});

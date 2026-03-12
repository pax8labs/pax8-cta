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
import { GET, POST } from "./route";
import { NextRequest, NextResponse } from "next/server";

// Mock dependencies
vi.mock("@/lib/api-middleware", () => ({
  requireAuth: vi.fn(),
  requireApproverEmail: vi.fn(),
  logAuthFailure: vi.fn(),
}));

vi.mock("@/lib/repositories/approval-repository", () => ({
  getApprovalByDeployment: vi.fn(),
  createApproval: vi.fn(),
  addVote: vi.fn(),
  hasVoted: vi.fn(),
  updateApprovalStatus: vi.fn(),
}));

vi.mock("@/lib/repositories/deployment-repository", () => ({
  updateBatchStatus: vi.fn(),
}));

vi.mock("@/lib/repositories/audit-repository", () => ({
  logApprovalAction: vi.fn(),
}));

vi.mock("@/lib/demo-store", () => ({
  demoDeployments: new Map(),
  demoBatches: new Map(),
}));

vi.mock("@/lib/demo-worker", () => ({
  startDemoDeployment: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  deploymentRateLimit: vi.fn(() =>
    Promise.resolve({ success: true, remaining: 99, reset: Date.now() + 60000 })
  ),
  createRateLimitResponse: vi.fn(),
}));

vi.mock("@/lib/validation", () => ({
  parseAndValidate: vi.fn(async (request: any) => {
    const body = await request.json();
    if (!body.action || !["approve", "reject"].includes(body.action)) {
      return {
        success: false,
        errors: [{ path: "action", message: 'Action must be "approve" or "reject"' }],
      };
    }
    return { success: true, data: body };
  }),
  approvalActionSchema: {},
}));

vi.mock("@agentsync/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@agentsync/core")>()),
  isDemoMode: vi.fn(() => false),
  loadConfig: vi.fn(() =>
    Promise.resolve({
      settings: {
        approval: {
          approvers: ["approver@example.com", "admin@example.com"],
        },
      },
    })
  ),
}));

describe("GET /api/deployments/[id]/approve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should require authentication", async () => {
    const { requireAuth } = await import("@/lib/api-middleware");

    vi.mocked(requireAuth).mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );

    const request = new NextRequest("http://localhost/api/deployments/123/approve");
    const response = await GET(request, { params: { id: "123" } });

    expect(response.status).toBe(401);
  });

  it("should return approval status when approval exists", async () => {
    const { requireAuth } = await import("@/lib/api-middleware");
    const { getApprovalByDeployment } = await import("@/lib/repositories/approval-repository");

    vi.mocked(requireAuth).mockResolvedValue({
      user: { email: "user@example.com", roles: ["viewer"] },
    } as any);

    vi.mocked(getApprovalByDeployment).mockReturnValue({
      id: "approval-1",
      deploymentId: "123",
      status: "pending",
      requiredApprovals: 2,
      approvals: [{ approver: "approver1@example.com", timestamp: "2024-01-01T00:00:00Z" }],
      rejections: [],
      createdAt: "2024-01-01T00:00:00Z",
      expiresAt: "2024-01-02T00:00:00Z",
    } as any);

    const request = new NextRequest("http://localhost/api/deployments/123/approve");
    const response = await GET(request, { params: { id: "123" } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.requiresApproval).toBe(true);
    expect(data.status).toBe("pending");
    expect(data.currentApprovals).toBe(1);
    expect(data.requiredApprovals).toBe(2);
  });

  it("should return no approval required when approval does not exist", async () => {
    const { requireAuth } = await import("@/lib/api-middleware");
    const { getApprovalByDeployment } = await import("@/lib/repositories/approval-repository");

    vi.mocked(requireAuth).mockResolvedValue({
      user: { email: "user@example.com", roles: ["viewer"] },
    } as any);

    vi.mocked(getApprovalByDeployment).mockReturnValue(null);

    const request = new NextRequest("http://localhost/api/deployments/123/approve");
    const response = await GET(request, { params: { id: "123" } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.requiresApproval).toBe(false);
  });
});

describe("POST /api/deployments/[id]/approve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should reject non-approvers", async () => {
    const { requireApproverEmail } = await import("@/lib/api-middleware");

    vi.mocked(requireApproverEmail).mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );

    const request = new NextRequest("http://localhost/api/deployments/123/approve", {
      method: "POST",
      body: JSON.stringify({ action: "approve" }),
    });

    const response = await POST(request, { params: { id: "123" } });

    expect(response.status).toBe(403);
  });

  it("should allow approved approvers to approve", async () => {
    const { requireApproverEmail } = await import("@/lib/api-middleware");
    const { getApprovalByDeployment, addVote, hasVoted } =
      await import("@/lib/repositories/approval-repository");

    vi.mocked(requireApproverEmail).mockResolvedValue({
      user: { email: "approver@example.com", roles: ["admin"] },
    } as any);

    vi.mocked(hasVoted).mockReturnValue(false);

    // First call returns the existing approval, second call returns updated state with 2 approvals
    vi.mocked(getApprovalByDeployment)
      .mockReturnValueOnce({
        id: "approval-1",
        deploymentId: "123",
        status: "pending",
        requiredApprovals: 2,
        approvals: [{ approver: "other@example.com", timestamp: "2024-01-01T00:00:00Z" }],
        rejections: [],
        createdAt: "2024-01-01T00:00:00Z",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      } as any)
      .mockReturnValueOnce({
        id: "approval-1",
        deploymentId: "123",
        status: "pending",
        requiredApprovals: 2,
        approvals: [
          { approver: "other@example.com", timestamp: "2024-01-01T00:00:00Z" },
          { approver: "approver@example.com", timestamp: new Date().toISOString() },
        ],
        rejections: [],
        createdAt: "2024-01-01T00:00:00Z",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      } as any);

    const request = new NextRequest("http://localhost/api/deployments/123/approve", {
      method: "POST",
      body: JSON.stringify({ action: "approve" }),
    });

    const response = await POST(request, { params: { id: "123" } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(vi.mocked(addVote)).toHaveBeenCalledWith(
      "approval-1",
      "approver@example.com",
      "approve",
      undefined
    );
    expect(data.status).toBe("approved");
  });

  it("should require action in request body", async () => {
    const { requireApproverEmail } = await import("@/lib/api-middleware");

    vi.mocked(requireApproverEmail).mockResolvedValue({
      user: { email: "approver@example.com", roles: ["admin"] },
    } as any);

    const request = new NextRequest("http://localhost/api/deployments/123/approve", {
      method: "POST",
      body: JSON.stringify({}), // Missing action
    });

    const response = await POST(request, { params: { id: "123" } });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error.message).toContain("Invalid request body");
  });

  it("should handle rejection with reason", async () => {
    const { requireApproverEmail } = await import("@/lib/api-middleware");
    const { getApprovalByDeployment, addVote, hasVoted } =
      await import("@/lib/repositories/approval-repository");

    vi.mocked(requireApproverEmail).mockResolvedValue({
      user: { email: "approver@example.com", roles: ["admin"] },
    } as any);

    vi.mocked(hasVoted).mockReturnValue(false);

    // First call returns the existing approval, second call returns updated state with rejection
    vi.mocked(getApprovalByDeployment)
      .mockReturnValueOnce({
        id: "approval-1",
        deploymentId: "123",
        status: "pending",
        requiredApprovals: 2,
        approvals: [],
        rejections: [],
        createdAt: "2024-01-01T00:00:00Z",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      } as any)
      .mockReturnValueOnce({
        id: "approval-1",
        deploymentId: "123",
        status: "pending",
        requiredApprovals: 2,
        approvals: [],
        rejections: [
          {
            approver: "approver@example.com",
            reason: "Security concerns",
            timestamp: new Date().toISOString(),
          },
        ],
        createdAt: "2024-01-01T00:00:00Z",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      } as any);

    const request = new NextRequest("http://localhost/api/deployments/123/approve", {
      method: "POST",
      body: JSON.stringify({
        action: "reject",
        reason: "Security concerns",
      }),
    });

    const response = await POST(request, { params: { id: "123" } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(vi.mocked(addVote)).toHaveBeenCalledWith(
      "approval-1",
      "approver@example.com",
      "reject",
      "Security concerns"
    );
    expect(data.status).toBe("rejected");
    expect(data.message).toBe("Deployment rejected");
  });
});

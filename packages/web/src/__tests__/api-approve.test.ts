import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { createMockRequest, parseResponse } from "./helpers";

// Mock @agentsync/core before importing the route
vi.mock("@agentsync/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@agentsync/core")>()),
  loadConfig: vi.fn().mockResolvedValue({
    version: "2.0",
    partner: {
      tenantId: "partner-123",
      clientId: "client-123",
    },
    tenants: [],
    settings: {
      approval: {
        required: true,
        minApprovals: 2,
        approvers: ["admin@example.com", "lead@example.com"],
        timeout: "24h",
      },
    },
  }),
  isDemoMode: vi.fn().mockReturnValue(false),
}));

// Mock the repository modules to avoid database interactions in tests
const mockApprovals = new Map<string, any>();
const mockDeployments = new Map<string, any>();

vi.mock("../lib/repositories/approval-repository", () => ({
  getApprovalByDeployment: vi.fn((deploymentId: string) => {
    return mockApprovals.get(deploymentId) || null;
  }),
  createApproval: vi.fn((approval: any) => {
    const id = crypto.randomUUID();
    const newApproval = {
      id,
      ...approval,
      approvals: [],
      rejections: [],
    };
    mockApprovals.set(approval.deploymentId, newApproval);
    return newApproval;
  }),
  addVote: vi.fn((approvalId: string, approver: string, action: string, reason?: string) => {
    const approval = Array.from(mockApprovals.values()).find((a) => a.id === approvalId);
    if (!approval) return;

    const vote = {
      id: Date.now(),
      approvalId,
      approver,
      action,
      reason,
      timestamp: new Date().toISOString(),
    };

    if (action === "approve") {
      approval.approvals.push(vote);
    } else {
      approval.rejections.push(vote);
    }
  }),
  hasVoted: vi.fn((approvalId: string, approver: string) => {
    const approval = Array.from(mockApprovals.values()).find((a) => a.id === approvalId);
    if (!approval) return false;
    return (
      approval.approvals.some((a: any) => a.approver === approver) ||
      approval.rejections.some((r: any) => r.approver === approver)
    );
  }),
  updateApprovalStatus: vi.fn((id: string, status: string) => {
    const approval = Array.from(mockApprovals.values()).find((a) => a.id === id);
    if (approval) approval.status = status;
  }),
}));

vi.mock("../lib/repositories/deployment-repository", () => ({
  updateBatchStatus: vi.fn((id: string, status: string) => {
    const deployment = mockDeployments.get(id) || { id, status: "pending" };
    deployment.status = status;
    mockDeployments.set(id, deployment);
  }),
}));

vi.mock("../lib/repositories/audit-repository", () => ({
  logApprovalAction: vi.fn(),
  writeAuditLog: vi.fn(),
}));

vi.mock("../lib/demo-store", () => ({
  demoDeployments: {
    get: vi.fn(),
    set: vi.fn(),
  },
  demoBatches: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock("../lib/demo-worker", () => ({
  startDemoDeployment: vi.fn(),
}));

vi.mock("../lib/rate-limit", () => ({
  deploymentRateLimit: vi.fn(() =>
    Promise.resolve({ success: true, remaining: 99, reset: Date.now() + 60000 })
  ),
  createRateLimitResponse: vi.fn(),
}));

vi.mock("../lib/api-middleware", () => ({
  requireAuth: vi.fn(),
  requireApproverEmail: vi.fn(),
  logAuthFailure: vi.fn(),
}));

// Import after mocks
import { GET, POST } from "../app/api/deployments/[id]/approve/route";

describe("Approval API Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApprovals.clear();
    mockDeployments.clear();
  });

  describe("GET /api/deployments/[id]/approve", () => {
    it("should return no approval required for unknown deployment", async () => {
      const request = createMockRequest("/api/deployments/unknown-id/approve");
      const response = await GET(request, { params: { id: "unknown-id" } });

      expect(response.status).toBe(200);
      const data = await parseResponse<{ requiresApproval: boolean; message: string }>(response);
      expect(data.requiresApproval).toBe(false);
      expect(data.message).toBe("No approval required or not found");
    });
  });

  describe("POST /api/deployments/[id]/approve", () => {
    it("should reject invalid action", async () => {
      const { requireApproverEmail } = await import("../lib/api-middleware");
      vi.mocked(requireApproverEmail).mockResolvedValue({
        user: { email: "admin@example.com", roles: ["admin"] },
      } as any);

      const request = createMockRequest("/api/deployments/deploy-123/approve", {
        method: "POST",
        body: { action: "invalid" },
      });

      const response = await POST(request, { params: { id: "deploy-123" } });

      expect(response.status).toBe(400);
      const data = await parseResponse<{ error: { message: string } }>(response);
      expect(data.error.message).toContain("Invalid request body");
    });

    it("should require approver", async () => {
      // requireApproverEmail returns 403 for unauthorized users
      const { requireApproverEmail } = await import("../lib/api-middleware");
      vi.mocked(requireApproverEmail).mockResolvedValue(
        NextResponse.json({ error: "Forbidden" }, { status: 403 })
      );

      const request = createMockRequest("/api/deployments/deploy-123/approve", {
        method: "POST",
        body: { action: "approve" },
      });

      const response = await POST(request, { params: { id: "deploy-123" } });

      expect(response.status).toBe(403);
    });

    it("should reject unauthorized approver", async () => {
      const { requireApproverEmail } = await import("../lib/api-middleware");
      vi.mocked(requireApproverEmail).mockResolvedValue(
        NextResponse.json({ error: "Forbidden" }, { status: 403 })
      );

      const request = createMockRequest("/api/deployments/deploy-123/approve", {
        method: "POST",
        body: { action: "approve" },
      });

      const response = await POST(request, { params: { id: "deploy-123" } });

      expect(response.status).toBe(403);
    });

    it("should record approval from authorized approver", async () => {
      const { requireApproverEmail } = await import("../lib/api-middleware");
      vi.mocked(requireApproverEmail).mockResolvedValue({
        user: { email: "admin@example.com", roles: ["admin"] },
      } as any);

      const deploymentId = `test-deploy-${Date.now()}`;
      const request = createMockRequest(`/api/deployments/${deploymentId}/approve`, {
        method: "POST",
        body: { action: "approve" },
      });

      const response = await POST(request, { params: { id: deploymentId } });

      expect(response.status).toBe(200);
      const data = await parseResponse<{
        status: string;
        message: string;
        currentApprovals: number;
        requiredApprovals: number;
      }>(response);

      expect(data.status).toBe("pending"); // Still pending, needs 2 approvals
      expect(data.currentApprovals).toBe(1);
      expect(data.requiredApprovals).toBe(2);
      expect(data.message).toContain("approval recorded");
    });

    it("should approve deployment when min approvals reached", async () => {
      const { requireApproverEmail } = await import("../lib/api-middleware");
      const deploymentId = `test-deploy-approved-${Date.now()}`;

      // First approval
      vi.mocked(requireApproverEmail).mockResolvedValue({
        user: { email: "admin@example.com", roles: ["admin"] },
      } as any);
      const request1 = createMockRequest(`/api/deployments/${deploymentId}/approve`, {
        method: "POST",
        body: { action: "approve" },
      });
      await POST(request1, { params: { id: deploymentId } });

      // Second approval from different user
      vi.mocked(requireApproverEmail).mockResolvedValue({
        user: { email: "lead@example.com", roles: ["admin"] },
      } as any);
      const request2 = createMockRequest(`/api/deployments/${deploymentId}/approve`, {
        method: "POST",
        body: { action: "approve" },
      });
      const response = await POST(request2, { params: { id: deploymentId } });

      expect(response.status).toBe(200);
      const data = await parseResponse<{
        status: string;
        message: string;
        currentApprovals: number;
      }>(response);

      expect(data.status).toBe("approved");
      expect(data.currentApprovals).toBe(2);
      expect(data.message).toBe("Deployment approved");
    });

    it("should reject deployment immediately when rejected", async () => {
      const { requireApproverEmail } = await import("../lib/api-middleware");
      vi.mocked(requireApproverEmail).mockResolvedValue({
        user: { email: "admin@example.com", roles: ["admin"] },
      } as any);

      const deploymentId = `test-deploy-reject-${Date.now()}`;
      const request = createMockRequest(`/api/deployments/${deploymentId}/approve`, {
        method: "POST",
        body: { action: "reject", reason: "Not ready" },
      });

      const response = await POST(request, { params: { id: deploymentId } });

      expect(response.status).toBe(200);
      const data = await parseResponse<{ status: string; message: string }>(response);
      expect(data.status).toBe("rejected");
      expect(data.message).toBe("Deployment rejected");
    });

    it("should prevent duplicate voting by same approver", async () => {
      const { requireApproverEmail } = await import("../lib/api-middleware");
      vi.mocked(requireApproverEmail).mockResolvedValue({
        user: { email: "admin@example.com", roles: ["admin"] },
      } as any);

      const deploymentId = `test-deploy-dupe-${Date.now()}`;

      // First approval
      const request1 = createMockRequest(`/api/deployments/${deploymentId}/approve`, {
        method: "POST",
        body: { action: "approve" },
      });
      await POST(request1, { params: { id: deploymentId } });

      // Second attempt by same approver
      const request2 = createMockRequest(`/api/deployments/${deploymentId}/approve`, {
        method: "POST",
        body: { action: "approve" },
      });
      const response = await POST(request2, { params: { id: deploymentId } });

      expect(response.status).toBe(400);
      const data = await parseResponse<{ error: { message: string } }>(response);
      expect(data.error.message).toContain("has already voted");
    });

    it("should prevent voting on already decided deployment", async () => {
      const { requireApproverEmail } = await import("../lib/api-middleware");
      const deploymentId = `test-deploy-decided-${Date.now()}`;

      // Reject first
      vi.mocked(requireApproverEmail).mockResolvedValue({
        user: { email: "admin@example.com", roles: ["admin"] },
      } as any);
      const request1 = createMockRequest(`/api/deployments/${deploymentId}/approve`, {
        method: "POST",
        body: { action: "reject" },
      });
      await POST(request1, { params: { id: deploymentId } });

      // Try to approve after rejection
      vi.mocked(requireApproverEmail).mockResolvedValue({
        user: { email: "lead@example.com", roles: ["admin"] },
      } as any);
      const request2 = createMockRequest(`/api/deployments/${deploymentId}/approve`, {
        method: "POST",
        body: { action: "approve" },
      });
      const response = await POST(request2, { params: { id: deploymentId } });

      expect(response.status).toBe(400);
      const data = await parseResponse<{ error: { message: string } }>(response);
      expect(data.error.message).toContain("already rejected");
    });
  });
});

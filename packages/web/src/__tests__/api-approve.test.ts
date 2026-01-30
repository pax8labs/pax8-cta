import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, parseResponse } from './helpers';

// Mock session user email - can be changed per test
let mockUserEmail: string | null = 'admin@example.com';

// Mock next-auth to avoid calling headers() outside request scope
vi.mock('next-auth', () => ({
  getServerSession: vi.fn().mockImplementation(() => {
    if (!mockUserEmail) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      user: {
        email: mockUserEmail,
        name: 'Test User',
        roles: ['Admin'],
      },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
  }),
}));

// Mock @agentsync/core before importing the route
vi.mock('@agentsync/core', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    version: '2.0',
    partner: {
      tenantId: 'partner-123',
      clientId: 'client-123',
    },
    tenants: [],
    settings: {
      approval: {
        required: true,
        minApprovals: 2,
        approvers: ['admin@example.com', 'lead@example.com'],
        timeout: '24h',
      },
    },
  }),
  isDemoMode: vi.fn().mockReturnValue(false),
}));

// Mock the repository modules to avoid database interactions in tests
const mockApprovals = new Map<string, any>();
const mockDeployments = new Map<string, any>();

vi.mock('../lib/repositories/approval-repository', () => ({
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
    const approval = Array.from(mockApprovals.values()).find(a => a.id === approvalId);
    if (!approval) return;

    const vote = {
      id: Date.now(),
      approvalId,
      approver,
      action,
      reason,
      timestamp: new Date().toISOString(),
    };

    if (action === 'approve') {
      approval.approvals.push(vote);
    } else {
      approval.rejections.push(vote);
    }
  }),
  hasVoted: vi.fn((approvalId: string, approver: string) => {
    const approval = Array.from(mockApprovals.values()).find(a => a.id === approvalId);
    if (!approval) return false;
    return approval.approvals.some((a: any) => a.approver === approver) ||
           approval.rejections.some((r: any) => r.approver === approver);
  }),
  updateApprovalStatus: vi.fn((id: string, status: string) => {
    const approval = Array.from(mockApprovals.values()).find(a => a.id === id);
    if (approval) approval.status = status;
  }),
}));

vi.mock('../lib/repositories/deployment-repository', () => ({
  updateBatchStatus: vi.fn((id: string, status: string) => {
    const deployment = mockDeployments.get(id) || { id, status: 'pending' };
    deployment.status = status;
    mockDeployments.set(id, deployment);
  }),
}));

vi.mock('../lib/repositories/audit-repository', () => ({
  logApprovalAction: vi.fn(),
}));

vi.mock('../lib/demo-store', () => ({
  demoDeployments: {
    get: vi.fn(),
    set: vi.fn(),
  },
  demoBatches: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

// Import after mocks
import { GET, POST } from '../app/api/deployments/[id]/approve/route';

describe('Approval API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApprovals.clear();
    mockDeployments.clear();
    // Reset to default authorized user
    mockUserEmail = 'admin@example.com';
  });

  describe('GET /api/deployments/[id]/approve', () => {
    it('should return no approval required for unknown deployment', async () => {
      const request = createMockRequest('/api/deployments/unknown-id/approve');
      const response = await GET(request, { params: { id: 'unknown-id' } });

      expect(response.status).toBe(200);
      const data = await parseResponse<{ requiresApproval: boolean; message: string }>(response);
      expect(data.requiresApproval).toBe(false);
      expect(data.message).toBe('No approval required or not found');
    });
  });

  describe('POST /api/deployments/[id]/approve', () => {
    it('should reject invalid action', async () => {
      const request = createMockRequest('/api/deployments/deploy-123/approve', {
        method: 'POST',
        body: { action: 'invalid' },
      });

      const response = await POST(request, { params: { id: 'deploy-123' } });

      expect(response.status).toBe(400);
      const data = await parseResponse<{ error: string }>(response);
      expect(data.error).toBe('action must be "approve" or "reject"');
    });

    it('should reject unauthenticated user', async () => {
      // Set no user session
      mockUserEmail = null;

      const request = createMockRequest('/api/deployments/deploy-123/approve', {
        method: 'POST',
        body: { action: 'approve' },
      });

      const response = await POST(request, { params: { id: 'deploy-123' } });

      expect(response.status).toBe(401);
      const data = await parseResponse<{ error: string }>(response);
      expect(data.error).toBe('Unauthorized');
    });

    it('should reject unauthorized approver', async () => {
      // Set user to unauthorized email
      mockUserEmail = 'unauthorized@example.com';

      const request = createMockRequest('/api/deployments/deploy-123/approve', {
        method: 'POST',
        body: { action: 'approve' },
      });

      const response = await POST(request, { params: { id: 'deploy-123' } });

      expect(response.status).toBe(403);
      const data = await parseResponse<{ error: string; message?: string }>(response);
      // The api-middleware returns { error: 'Forbidden', message: 'You are not authorized...' }
      expect(data.error).toBe('Forbidden');
      expect(data.message).toContain('not authorized to approve');
    });

    it('should record approval from authorized approver', async () => {
      // mockUserEmail is already set to admin@example.com by beforeEach
      const deploymentId = `test-deploy-${Date.now()}`;
      const request = createMockRequest(`/api/deployments/${deploymentId}/approve`, {
        method: 'POST',
        body: { action: 'approve' },
      });

      const response = await POST(request, { params: { id: deploymentId } });

      expect(response.status).toBe(200);
      const data = await parseResponse<{
        status: string;
        message: string;
        currentApprovals: number;
        requiredApprovals: number;
      }>(response);

      expect(data.status).toBe('pending'); // Still pending, needs 2 approvals
      expect(data.currentApprovals).toBe(1);
      expect(data.requiredApprovals).toBe(2);
      expect(data.message).toContain('approval recorded');
    });

    it('should approve deployment when min approvals reached', async () => {
      const deploymentId = `test-deploy-approved-${Date.now()}`;

      // First approval as admin
      mockUserEmail = 'admin@example.com';
      const request1 = createMockRequest(`/api/deployments/${deploymentId}/approve`, {
        method: 'POST',
        body: { action: 'approve' },
      });
      await POST(request1, { params: { id: deploymentId } });

      // Second approval as lead
      mockUserEmail = 'lead@example.com';
      const request2 = createMockRequest(`/api/deployments/${deploymentId}/approve`, {
        method: 'POST',
        body: { action: 'approve' },
      });
      const response = await POST(request2, { params: { id: deploymentId } });

      expect(response.status).toBe(200);
      const data = await parseResponse<{
        status: string;
        message: string;
        currentApprovals: number;
      }>(response);

      expect(data.status).toBe('approved');
      expect(data.currentApprovals).toBe(2);
      expect(data.message).toBe('Deployment approved');
    });

    it('should reject deployment immediately when rejected', async () => {
      // mockUserEmail is already set to admin@example.com by beforeEach
      const deploymentId = `test-deploy-reject-${Date.now()}`;
      const request = createMockRequest(`/api/deployments/${deploymentId}/approve`, {
        method: 'POST',
        body: { action: 'reject', reason: 'Not ready' },
      });

      const response = await POST(request, { params: { id: deploymentId } });

      expect(response.status).toBe(200);
      const data = await parseResponse<{ status: string; message: string }>(response);
      expect(data.status).toBe('rejected');
      expect(data.message).toBe('Deployment rejected');
    });

    it('should prevent duplicate voting by same approver', async () => {
      // mockUserEmail is already set to admin@example.com by beforeEach
      const deploymentId = `test-deploy-dupe-${Date.now()}`;

      // First approval
      const request1 = createMockRequest(`/api/deployments/${deploymentId}/approve`, {
        method: 'POST',
        body: { action: 'approve' },
      });
      await POST(request1, { params: { id: deploymentId } });

      // Second attempt by same approver (same mockUserEmail)
      const request2 = createMockRequest(`/api/deployments/${deploymentId}/approve`, {
        method: 'POST',
        body: { action: 'approve' },
      });
      const response = await POST(request2, { params: { id: deploymentId } });

      expect(response.status).toBe(400);
      const data = await parseResponse<{ error: string }>(response);
      expect(data.error).toContain('has already voted');
    });

    it('should prevent voting on already decided deployment', async () => {
      const deploymentId = `test-deploy-decided-${Date.now()}`;

      // Reject first as admin
      mockUserEmail = 'admin@example.com';
      const request1 = createMockRequest(`/api/deployments/${deploymentId}/approve`, {
        method: 'POST',
        body: { action: 'reject' },
      });
      await POST(request1, { params: { id: deploymentId } });

      // Try to approve after rejection as lead
      mockUserEmail = 'lead@example.com';
      const request2 = createMockRequest(`/api/deployments/${deploymentId}/approve`, {
        method: 'POST',
        body: { action: 'approve' },
      });
      const response = await POST(request2, { params: { id: deploymentId } });

      expect(response.status).toBe(400);
      const data = await parseResponse<{ error: string }>(response);
      expect(data.error).toContain('already rejected');
    });
  });
});

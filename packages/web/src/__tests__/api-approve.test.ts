import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, parseResponse } from './helpers';

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
}));

// Import after mocks
import { GET, POST } from '../app/api/deployments/[id]/approve/route';

describe('Approval API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
        body: { action: 'invalid', approver: 'admin@example.com' },
      });

      const response = await POST(request, { params: { id: 'deploy-123' } });

      expect(response.status).toBe(400);
      const data = await parseResponse<{ error: string }>(response);
      expect(data.error).toBe('action must be "approve" or "reject"');
    });

    it('should require approver', async () => {
      const request = createMockRequest('/api/deployments/deploy-123/approve', {
        method: 'POST',
        body: { action: 'approve' },
      });

      const response = await POST(request, { params: { id: 'deploy-123' } });

      expect(response.status).toBe(400);
      const data = await parseResponse<{ error: string }>(response);
      expect(data.error).toBe('approver is required');
    });

    it('should reject unauthorized approver', async () => {
      const request = createMockRequest('/api/deployments/deploy-123/approve', {
        method: 'POST',
        body: { action: 'approve', approver: 'unauthorized@example.com' },
      });

      const response = await POST(request, { params: { id: 'deploy-123' } });

      expect(response.status).toBe(403);
      const data = await parseResponse<{ error: string }>(response);
      expect(data.error).toContain('is not authorized to approve');
    });

    it('should record approval from authorized approver', async () => {
      const deploymentId = `test-deploy-${Date.now()}`;
      const request = createMockRequest(`/api/deployments/${deploymentId}/approve`, {
        method: 'POST',
        body: { action: 'approve', approver: 'admin@example.com' },
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

      // First approval
      const request1 = createMockRequest(`/api/deployments/${deploymentId}/approve`, {
        method: 'POST',
        body: { action: 'approve', approver: 'admin@example.com' },
      });
      await POST(request1, { params: { id: deploymentId } });

      // Second approval
      const request2 = createMockRequest(`/api/deployments/${deploymentId}/approve`, {
        method: 'POST',
        body: { action: 'approve', approver: 'lead@example.com' },
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
      const deploymentId = `test-deploy-reject-${Date.now()}`;
      const request = createMockRequest(`/api/deployments/${deploymentId}/approve`, {
        method: 'POST',
        body: { action: 'reject', approver: 'admin@example.com', reason: 'Not ready' },
      });

      const response = await POST(request, { params: { id: deploymentId } });

      expect(response.status).toBe(200);
      const data = await parseResponse<{ status: string; message: string }>(response);
      expect(data.status).toBe('rejected');
      expect(data.message).toBe('Deployment rejected');
    });

    it('should prevent duplicate voting by same approver', async () => {
      const deploymentId = `test-deploy-dupe-${Date.now()}`;

      // First approval
      const request1 = createMockRequest(`/api/deployments/${deploymentId}/approve`, {
        method: 'POST',
        body: { action: 'approve', approver: 'admin@example.com' },
      });
      await POST(request1, { params: { id: deploymentId } });

      // Second attempt by same approver
      const request2 = createMockRequest(`/api/deployments/${deploymentId}/approve`, {
        method: 'POST',
        body: { action: 'approve', approver: 'admin@example.com' },
      });
      const response = await POST(request2, { params: { id: deploymentId } });

      expect(response.status).toBe(400);
      const data = await parseResponse<{ error: string }>(response);
      expect(data.error).toContain('has already voted');
    });

    it('should prevent voting on already decided deployment', async () => {
      const deploymentId = `test-deploy-decided-${Date.now()}`;

      // Reject first
      const request1 = createMockRequest(`/api/deployments/${deploymentId}/approve`, {
        method: 'POST',
        body: { action: 'reject', approver: 'admin@example.com' },
      });
      await POST(request1, { params: { id: deploymentId } });

      // Try to approve after rejection
      const request2 = createMockRequest(`/api/deployments/${deploymentId}/approve`, {
        method: 'POST',
        body: { action: 'approve', approver: 'lead@example.com' },
      });
      const response = await POST(request2, { params: { id: deploymentId } });

      expect(response.status).toBe(400);
      const data = await parseResponse<{ error: string }>(response);
      expect(data.error).toContain('already rejected');
    });
  });
});

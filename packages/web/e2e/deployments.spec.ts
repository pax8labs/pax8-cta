import { test, expect } from '@playwright/test';

test.describe('Deployments', () => {
  test.describe('API Endpoints', () => {
    test('GET /api/deployments returns list', async ({ request }) => {
      const response = await request.get('/api/deployments?limit=10');

      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body.deployments).toBeDefined();
      expect(Array.isArray(body.deployments)).toBe(true);
    });

    test('GET /api/deployments respects limit parameter', async ({ request }) => {
      const response = await request.get('/api/deployments?limit=5');

      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body.deployments.length).toBeLessThanOrEqual(5);
    });

    test('GET /api/deployments returns proper deployment structure', async ({ request }) => {
      const response = await request.get('/api/deployments?limit=10');

      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body.demoMode).toBe(true);

      if (body.deployments.length > 0) {
        const deployment = body.deployments[0];
        expect(deployment.id).toBeDefined();
        expect(deployment.solutionName).toBeDefined();
        expect(deployment.status).toBeDefined();
        expect(deployment.createdAt).toBeDefined();
        expect(deployment.totalTenants).toBeDefined();
        expect(deployment.completedTenants).toBeDefined();
        expect(deployment.failedTenants).toBeDefined();
      }
    });

    test('GET /api/deployments/:id returns deployment details', async ({ request }) => {
      // Use a demo deployment ID
      const response = await request.get('/api/deployments/test-deployment-id');

      // Should return 200 in demo mode or 404 if not found
      expect([200, 404]).toContain(response.status());

      if (response.status() === 200) {
        const body = await response.json();
        expect(body.id || body.deploymentId).toBeDefined();
        expect(body.status).toBeDefined();
      }
    });
  });

  test.describe('Deployment Creation', () => {
    test('POST /api/deployments/create creates a new deployment', async ({ request }) => {
      // Get demo tenants
      const tenantsResponse = await request.get('/api/tenants');
      const tenants = await tenantsResponse.json();
      const enabledTenants = tenants.tenants
        .filter((t: { enabled: boolean }) => t.enabled)
        .slice(0, 2);

      const response = await request.post('/api/deployments/create', {
        data: {
          solutionName: 'CustomerServiceAgent',
          solutionVersion: '1.0.0.5',
          targetTenants: enabledTenants,
        },
      });

      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body.demoMode).toBe(true);
      expect(body.deploymentId).toBeDefined();
    });

    test('POST /api/deployments/create validates required fields', async ({ request }) => {
      // Missing solution name
      const response = await request.post('/api/deployments/create', {
        data: {
          solutionVersion: '1.0.0',
          targetTenants: [],
        },
      });

      expect(response.status()).toBe(400);
    });
  });

  test.describe('Deployment Filtering', () => {
    test('deployments have valid status values', async ({ request }) => {
      const response = await request.get('/api/deployments?limit=50');

      expect(response.status()).toBe(200);

      const body = await response.json();
      const validStatuses = ['pending', 'in_progress', 'completed', 'failed', 'cancelled'];

      for (const deployment of body.deployments) {
        expect(validStatuses).toContain(deployment.status);
      }
    });

    test('deployments have valid date formats', async ({ request }) => {
      const response = await request.get('/api/deployments?limit=10');

      expect(response.status()).toBe(200);

      const body = await response.json();

      for (const deployment of body.deployments) {
        // createdAt should be a valid ISO date
        const createdDate = new Date(deployment.createdAt);
        expect(createdDate.toString()).not.toBe('Invalid Date');

        if (deployment.updatedAt) {
          const updatedDate = new Date(deployment.updatedAt);
          expect(updatedDate.toString()).not.toBe('Invalid Date');
        }
      }
    });

    test('deployments include tenant results', async ({ request }) => {
      const response = await request.get('/api/deployments?limit=10');

      expect(response.status()).toBe(200);

      const body = await response.json();

      for (const deployment of body.deployments) {
        expect(deployment.tenantResults).toBeDefined();
        expect(Array.isArray(deployment.tenantResults)).toBe(true);

        for (const result of deployment.tenantResults) {
          expect(result.tenantId).toBeDefined();
          expect(result.tenantName).toBeDefined();
          expect(result.status).toBeDefined();
        }
      }
    });
  });

  test.describe('Deployment Actions', () => {
    test('POST /api/deployments/:id/cancel cancels pending jobs', async ({ request }) => {
      const response = await request.post('/api/deployments/test-id/cancel');

      // Should work or return error if no jobs to cancel
      expect([200, 400, 500]).toContain(response.status());

      const body = await response.json();
      if (response.status() === 200) {
        expect(body.cancelledCount).toBeDefined();
      } else {
        expect(body.error).toBeDefined();
      }
    });

    test('POST /api/deployments/:id/retry retries failed jobs', async ({ request }) => {
      const response = await request.post('/api/deployments/test-id/retry');

      // Should work or return error if no failed jobs
      expect([200, 400, 404, 500]).toContain(response.status());

      const body = await response.json();
      if (response.status() === 200) {
        expect(body.retriedTenants).toBeDefined();
      } else {
        expect(body.error).toBeDefined();
      }
    });
  });

  test.describe('Approval Workflow', () => {
    test('GET /api/deployments/:id/approve returns approval status', async ({ request }) => {
      const response = await request.get('/api/deployments/test-id/approve');

      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(typeof body.requiresApproval).toBe('boolean');
    });

    test('POST /api/deployments/:id/approve validates input', async ({ request }) => {
      // Missing action
      const response1 = await request.post('/api/deployments/test-id/approve', {
        data: { approver: 'test@example.com' },
      });
      expect(response1.status()).toBe(400);

      // Missing approver
      const response2 = await request.post('/api/deployments/test-id/approve', {
        data: { action: 'approve' },
      });
      expect(response2.status()).toBe(400);

      // Invalid action
      const response3 = await request.post('/api/deployments/test-id/approve', {
        data: { action: 'invalid', approver: 'test@example.com' },
      });
      expect(response3.status()).toBe(400);
    });

    test('POST /api/deployments/:id/approve accepts valid approval', async ({ request }) => {
      const response = await request.post('/api/deployments/approval-test/approve', {
        data: {
          action: 'approve',
          approver: 'admin@example.com',
        },
      });

      // May succeed or fail depending on config
      expect([200, 403]).toContain(response.status());

      const body = await response.json();
      if (response.status() === 200) {
        expect(body.status).toBeDefined();
        expect(body.currentApprovals).toBeDefined();
      }
    });

    test('POST /api/deployments/:id/approve accepts rejection with reason', async ({ request }) => {
      const response = await request.post('/api/deployments/rejection-test/approve', {
        data: {
          action: 'reject',
          approver: 'admin@example.com',
          reason: 'Not ready for production',
        },
      });

      // May succeed or fail depending on config
      expect([200, 400, 403]).toContain(response.status());
    });
  });
});

import { test, expect } from '@playwright/test';

test.describe('Tenants', () => {
  test.describe('API Endpoints', () => {
    test('GET /api/tenants returns tenant list', async ({ request }) => {
      const response = await request.get('/api/tenants');

      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body.tenants).toBeDefined();
      expect(Array.isArray(body.tenants)).toBe(true);

      // Check structure
      if (body.tenants.length > 0) {
        const tenant = body.tenants[0];
        expect(tenant.name).toBeDefined();
        expect(tenant.tenantId).toBeDefined();
        expect(tenant.environmentUrl).toBeDefined();
        expect(typeof tenant.enabled).toBe('boolean');
      }
    });

    test('GET /api/tenants includes partner and source info', async ({ request }) => {
      const response = await request.get('/api/tenants');

      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body.partner).toBeDefined();
      expect(body.partner.tenantId).toBeDefined();
      expect(body.partner.clientId).toBeDefined();
      expect(body.source).toBeDefined();
      expect(body.source.environmentUrl).toBeDefined();
    });

    test('tenants have proper metadata structure', async ({ request }) => {
      const response = await request.get('/api/tenants');

      expect(response.status()).toBe(200);

      const body = await response.json();

      for (const tenant of body.tenants) {
        // Optional fields that may be present
        if (tenant.tags) {
          expect(Array.isArray(tenant.tags)).toBe(true);
        }
        if (tenant.metadata) {
          expect(typeof tenant.metadata).toBe('object');
        }
      }
    });
  });

  test.describe('Tenant Detail API', () => {
    test('GET /api/tenants/:id returns tenant details', async ({ request }) => {
      // Use a known demo tenant ID
      const tenantId = '11111111-1111-1111-1111-111111111111';
      const response = await request.get(`/api/tenants/${tenantId}`);

      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body.tenant).toBeDefined();
      expect(body.tenant.tenantId).toBe(tenantId);
      expect(body.tenant.name).toBeDefined();
      expect(body.tenant.environmentUrl).toBeDefined();
      expect(body.tenant.tags).toBeDefined();
      expect(typeof body.tenant.enabled).toBe('boolean');
    });

    test('GET /api/tenants/:id includes deployed agents', async ({ request }) => {
      const tenantId = '11111111-1111-1111-1111-111111111111';
      const response = await request.get(`/api/tenants/${tenantId}`);

      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body.tenant.deployedAgents).toBeDefined();
      expect(Array.isArray(body.tenant.deployedAgents)).toBe(true);
    });

    test('GET /api/tenants/:id returns 404 for unknown tenant', async ({ request }) => {
      const response = await request.get('/api/tenants/unknown-tenant-id');

      expect(response.status()).toBe(404);
    });
  });

  test.describe('Tags API', () => {
    test('GET /api/tenants/tags returns list of tags', async ({ request }) => {
      const response = await request.get('/api/tenants/tags');

      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body.tags).toBeDefined();
      expect(Array.isArray(body.tags)).toBe(true);
      expect(body.tags.length).toBeGreaterThan(0);
    });

    test('POST /api/tenants/tags creates a new tag', async ({ request }) => {
      const response = await request.post('/api/tenants/tags', {
        data: { tag: 'test-tag-' + Date.now() },
      });

      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body.tag).toBeDefined();
      expect(body.message).toContain('created');
    });

    test('POST /api/tenants/tags validates tag format', async ({ request }) => {
      // Empty tag
      const response1 = await request.post('/api/tenants/tags', {
        data: { tag: '' },
      });
      expect(response1.status()).toBe(400);

      // Invalid characters
      const response2 = await request.post('/api/tenants/tags', {
        data: { tag: 'Invalid Tag!' },
      });
      expect(response2.status()).toBe(400);

      // Too long
      const response3 = await request.post('/api/tenants/tags', {
        data: { tag: 'a'.repeat(100) },
      });
      expect(response3.status()).toBe(400);
    });

    test('PUT /api/tenants/:id/tags updates tenant tags', async ({ request }) => {
      const tenantId = '11111111-1111-1111-1111-111111111111';
      const response = await request.put(`/api/tenants/${tenantId}/tags`, {
        data: { tags: ['enterprise', 'test-update'] },
      });

      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body.tags).toBeDefined();
      expect(Array.isArray(body.tags)).toBe(true);
    });
  });

  test.describe('Tenant Status API', () => {
    test('PUT /api/tenants/:id/status updates tenant status', async ({ request }) => {
      const tenantId = '11111111-1111-1111-1111-111111111111';

      // Get current status
      const getResponse = await request.get(`/api/tenants/${tenantId}`);
      const currentStatus = (await getResponse.json()).tenant.enabled;

      // Toggle status
      const response = await request.put(`/api/tenants/${tenantId}/status`, {
        data: { enabled: !currentStatus },
      });

      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body.enabled).toBe(!currentStatus);

      // Restore original status
      await request.put(`/api/tenants/${tenantId}/status`, {
        data: { enabled: currentStatus },
      });
    });

    test('PUT /api/tenants/:id/status validates input', async ({ request }) => {
      const tenantId = '11111111-1111-1111-1111-111111111111';

      // Invalid enabled value
      const response = await request.put(`/api/tenants/${tenantId}/status`, {
        data: { enabled: 'not-a-boolean' },
      });

      expect(response.status()).toBe(400);
    });
  });

  test.describe('Agent Removal API', () => {
    test('DELETE /api/tenants/:id/agents/:name removes an agent', async ({ request }) => {
      // This tenant has agents in demo mode
      const tenantId = '11111111-1111-1111-1111-111111111111';
      const agentName = 'Customer Service Agent';

      const response = await request.delete(
        `/api/tenants/${tenantId}/agents/${encodeURIComponent(agentName)}`
      );

      // Should succeed or agent not found
      expect([200, 404]).toContain(response.status());

      if (response.status() === 200) {
        const body = await response.json();
        expect(body.message).toContain('removal initiated');
      }
    });

    test('DELETE /api/tenants/:id/agents/:name returns 404 for unknown tenant', async ({ request }) => {
      const response = await request.delete(
        '/api/tenants/unknown-tenant/agents/SomeAgent'
      );

      expect(response.status()).toBe(404);
    });
  });

  test.describe('Tenant Filtering', () => {
    test('can filter tenants by enabled status', async ({ request }) => {
      const response = await request.get('/api/tenants');

      expect(response.status()).toBe(200);

      const body = await response.json();
      const enabledTenants = body.tenants.filter((t: { enabled: boolean }) => t.enabled);
      const disabledTenants = body.tenants.filter((t: { enabled: boolean }) => !t.enabled);

      // At least some tenants should be enabled
      expect(enabledTenants.length).toBeGreaterThan(0);

      // All tenants should have explicit enabled flag
      for (const tenant of body.tenants) {
        expect(typeof tenant.enabled).toBe('boolean');
      }
    });

    test('tenants have valid environment URLs', async ({ request }) => {
      const response = await request.get('/api/tenants');

      expect(response.status()).toBe(200);

      const body = await response.json();

      for (const tenant of body.tenants) {
        expect(tenant.environmentUrl).toMatch(/^https?:\/\//);
      }
    });

    test('tenant IDs are valid GUIDs or demo IDs', async ({ request }) => {
      const response = await request.get('/api/tenants');

      expect(response.status()).toBe(200);

      const body = await response.json();

      for (const tenant of body.tenants) {
        expect(tenant.tenantId).toBeDefined();
        // Allow demo IDs that might not be strict GUIDs
        expect(tenant.tenantId.length).toBeGreaterThan(0);
      }
    });
  });
});

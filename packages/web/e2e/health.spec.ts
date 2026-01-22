import { test, expect } from '@playwright/test';

test.describe('Health Endpoints', () => {
  test('GET /api/health returns healthy status', async ({ request }) => {
    const response = await request.get('/api/health');

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('healthy');
    expect(body.timestamp).toBeDefined();
    expect(body.version).toBeDefined();
  });

  test('GET /api/health/ready returns readiness status', async ({ request }) => {
    const response = await request.get('/api/health/ready');

    // May return 503 if Redis is not available
    expect([200, 503]).toContain(response.status());

    const body = await response.json();
    expect(['ready', 'not_ready']).toContain(body.status);
    expect(body.timestamp).toBeDefined();
    expect(body.checks).toBeDefined();
    expect(Array.isArray(body.checks)).toBe(true);
  });
});

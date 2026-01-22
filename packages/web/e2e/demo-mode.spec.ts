import { test, expect } from '@playwright/test';

test.describe('Demo Mode', () => {
  test.use({
    // Override web server to use demo mode
    baseURL: 'http://localhost:3001',
  });

  test.beforeEach(async ({ page }) => {
    // Set demo mode cookie or navigate to demo mode enabled instance
    // In demo mode, auth is bypassed
  });

  test('dashboard displays demo tenant data', async ({ request }) => {
    const response = await request.get('/api/tenants');

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.demoMode).toBe(true);
    expect(body.tenants).toBeDefined();
    expect(Array.isArray(body.tenants)).toBe(true);
    expect(body.tenants.length).toBeGreaterThan(0);

    // Check tenant structure
    const firstTenant = body.tenants[0];
    expect(firstTenant.name).toBeDefined();
    expect(firstTenant.tenantId).toBeDefined();
    expect(firstTenant.environmentUrl).toBeDefined();
    expect(firstTenant.enabled).toBeDefined();
  });

  test('deployments API returns demo data', async ({ request }) => {
    const response = await request.get('/api/deployments');

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.demoMode).toBe(true);
    expect(body.deployments).toBeDefined();
    expect(Array.isArray(body.deployments)).toBe(true);
  });

  test('deployment detail returns demo data', async ({ request }) => {
    const response = await request.get('/api/deployments/demo-123');

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.demoMode).toBe(true);
    expect(body.id).toBe('demo-123');
    expect(body.status).toBeDefined();
    expect(body.tenantResults).toBeDefined();
  });

  test('stats API returns demo statistics', async ({ request }) => {
    const response = await request.get('/api/stats');

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.demoMode).toBe(true);
    expect(typeof body.totalTenants).toBe('number');
    expect(typeof body.enabledTenants).toBe('number');
    expect(typeof body.activeDeployments).toBe('number');
    expect(typeof body.completedToday).toBe('number');
    expect(typeof body.failedToday).toBe('number');
  });

  test('solutions API returns demo solutions', async ({ request }) => {
    const response = await request.get('/api/solutions');

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.demoMode).toBe(true);
    expect(body.solutions).toBeDefined();
    expect(Array.isArray(body.solutions)).toBe(true);
  });
});

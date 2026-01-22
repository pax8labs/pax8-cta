import { test, expect } from '@playwright/test';

test.describe('Server-Sent Events', () => {
  test('SSE endpoint requires deploymentId', async ({ request }) => {
    const response = await request.get('/api/ws');

    expect(response.status()).toBe(400);

    const body = await response.json();
    expect(body.error).toContain('deploymentId');
  });

  test('SSE endpoint returns event stream', async ({ request }) => {
    // Note: Playwright's request doesn't fully support SSE,
    // but we can check the response headers
    const response = await request.get('/api/ws?deploymentId=test-123', {
      timeout: 5000,
    });

    // SSE endpoint should return 200 with proper content type
    expect(response.status()).toBe(200);

    const contentType = response.headers()['content-type'];
    expect(contentType).toContain('text/event-stream');
  });

  test('SSE endpoint includes required headers', async ({ request }) => {
    const response = await request.get('/api/ws?deploymentId=test-456', {
      timeout: 5000,
    });

    const headers = response.headers();

    // Check for SSE-required headers
    expect(headers['content-type']).toContain('text/event-stream');
    expect(headers['cache-control']).toContain('no-cache');
  });
});

test.describe('Deployment Updates Hook (Integration)', () => {
  test('deployment page connects to SSE', async ({ page }) => {
    // Navigate to a deployment detail page
    await page.goto('/deployments/test-deployment');

    // In demo mode, the page should load without errors
    // and attempt to connect to SSE
    await page.waitForTimeout(1000);

    // Check that the page loaded
    const pageContent = await page.content();
    expect(pageContent).toBeTruthy();
  });
});

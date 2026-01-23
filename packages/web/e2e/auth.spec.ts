import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('unauthenticated users are redirected to sign in', async ({ page }) => {
    await page.goto('/');

    // Should redirect to sign in page
    await expect(page).toHaveURL(/\/auth\/signin/);
  });

  test('sign in page displays correctly', async ({ page }) => {
    await page.goto('/auth/signin');

    // Check for sign in page elements
    await expect(page.getByText('Copilot Studio Deployer')).toBeVisible();
    await expect(page.getByText('Multi-tenant deployment automation')).toBeVisible();
  });

  test('auth error page displays correctly', async ({ page }) => {
    await page.goto('/auth/error?error=AccessDenied');

    await expect(page.getByText('Access Denied')).toBeVisible();
    await expect(page.getByText('Try signing in again')).toBeVisible();
  });

  test('protected API routes return 401 without auth', async ({ request }) => {
    const response = await request.get('/api/deployments');

    // NextAuth middleware should block unauthenticated requests
    expect([401, 302]).toContain(response.status());
  });
});

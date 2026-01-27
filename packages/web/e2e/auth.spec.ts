import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('unauthenticated users are redirected to sign in', async ({ page }) => {
    await page.goto('/');

    // Should redirect to sign in page
    await expect(page).toHaveURL(/\/auth\/signin/);
  });

  test('sign in page displays AgentSync branding', async ({ page }) => {
    await page.goto('/auth/signin');

    // Check for updated AgentSync branding
    await expect(page.getByRole('heading', { name: 'AgentSync' })).toBeVisible();
    await expect(page.getByText('Multi-tenant Copilot Studio deployment automation')).toBeVisible();
  });

  test('sign in page shows demo mode provider in demo mode', async ({ page }) => {
    await page.goto('/auth/signin');

    // Wait for providers to load
    await page.waitForTimeout(1000);

    // Should show Demo Mode sign-in option
    await expect(page.getByRole('button', { name: /Sign in with Demo Mode/i })).toBeVisible();
  });

  test('sign in page shows demo mode notice', async ({ page }) => {
    await page.goto('/auth/signin');

    // Wait for content to load
    await page.waitForTimeout(1000);

    // Should show demo mode active notice
    await expect(page.getByText('Demo Mode Active')).toBeVisible();
    await expect(page.getByText(/Sign in with demo credentials/i)).toBeVisible();
  });

  test('sign in page has correct visual elements', async ({ page }) => {
    await page.goto('/auth/signin');

    // Check for logo (SVG element)
    const logo = page.locator('svg').first();
    await expect(logo).toBeVisible();

    // Check for sign-in disclaimer
    await expect(page.getByText(/By signing in, you agree/i)).toBeVisible();
  });

  test('auth error page displays correctly', async ({ page }) => {
    await page.goto('/auth/error?error=AccessDenied');

    await expect(page.getByText('Access Denied')).toBeVisible();
    await expect(page.getByText('Try signing in again')).toBeVisible();
  });

  test('sign in error shows error message', async ({ page }) => {
    await page.goto('/auth/signin?error=OAuthSignin');

    await expect(page.getByText('Error starting sign in flow')).toBeVisible();
  });

  test('credentials error shows error message', async ({ page }) => {
    await page.goto('/auth/signin?error=CredentialsSignin');

    await expect(page.getByText('Invalid credentials')).toBeVisible();
  });
});

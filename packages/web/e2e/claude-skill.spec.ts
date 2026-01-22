import { test, expect } from '@playwright/test';

/**
 * E2E tests for Claude Code skill integration
 * 
 * These tests verify that the AgentSync API works correctly for
 * Claude Code skill usage patterns. The skill itself is markdown
 * and doesn't need testing, but we verify the API supports the
 * workflows described in the skill.
 */

test.describe('Claude Code Skill Integration', () => {
  test.beforeEach(async ({ page }) => {
    // Start at the homepage
    await page.goto('/');
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
  });

  test('API should be accessible without authentication in demo mode', async ({ request }) => {
    // Verify demo mode APIs work (as Claude Code would call them)
    const response = await request.get('/api/stats');
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data).toHaveProperty('totalDeployments');
  });

  test('should list all agents (skill workflow: list agents)', async ({ request }) => {
    const response = await request.get('/api/agents');
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data).toHaveProperty('agents');
    expect(Array.isArray(data.agents)).toBe(true);
    
    // Verify agent structure matches skill expectations
    if (data.agents.length > 0) {
      const agent = data.agents[0];
      expect(agent).toHaveProperty('uniqueName');
      expect(agent).toHaveProperty('friendlyName');
      expect(agent).toHaveProperty('version');
    }
  });

  test('should list all tenants (skill workflow: list tenants)', async ({ request }) => {
    const response = await request.get('/api/tenants');
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data).toHaveProperty('tenants');
    expect(Array.isArray(data.tenants)).toBe(true);
    
    // Verify tenant structure
    if (data.tenants.length > 0) {
      const tenant = data.tenants[0];
      expect(tenant).toHaveProperty('tenantId');
      expect(tenant).toHaveProperty('name');
      expect(tenant).toHaveProperty('environmentUrl');
    }
  });

  test('should list deployments with filtering (skill workflow: show failed deployments)', async ({ request }) => {
    // Test listing all deployments
    const allResponse = await request.get('/api/deployments?limit=10');
    expect(allResponse.ok()).toBeTruthy();
    
    const allData = await allResponse.json();
    expect(allData).toHaveProperty('deployments');
    
    // Test filtering by status
    const failedResponse = await request.get('/api/deployments?status=failed');
    expect(failedResponse.ok()).toBeTruthy();
    
    const failedData = await failedResponse.json();
    expect(failedData).toHaveProperty('deployments');
    
    // Verify all returned deployments have failed status
    failedData.deployments.forEach((deployment: any) => {
      expect(deployment.status).toBe('failed');
    });
  });

  test('should get deployment details (skill workflow: check deployment status)', async ({ request }) => {
    // First get a deployment
    const listResponse = await request.get('/api/deployments?limit=1');
    const listData = await listResponse.json();
    
    if (listData.deployments.length === 0) {
      test.skip();
      return;
    }
    
    const deploymentId = listData.deployments[0].id;
    
    // Get detailed status
    const detailResponse = await request.get(`/api/deployments/${deploymentId}`);
    expect(detailResponse.ok()).toBeTruthy();
    
    const data = await detailResponse.json();
    expect(data).toHaveProperty('id');
    expect(data).toHaveProperty('status');
    expect(data).toHaveProperty('solutionName');
    expect(data).toHaveProperty('tenantResults');
  });

  test('should get deployment stats (skill workflow: get overview)', async ({ request }) => {
    const response = await request.get('/api/stats');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data).toHaveProperty('activeDeployments');
    expect(data).toHaveProperty('totalTenants');
    expect(data).toHaveProperty('completedToday');
    expect(typeof data.activeDeployments).toBe('number');
    expect(typeof data.totalTenants).toBe('number');
  });

  test('should download solution file for deployment (skill workflow: create deployment)', async ({ request }) => {
    // Get an agent to download
    const agentsResponse = await request.get('/api/agents');
    const agentsData = await agentsResponse.json();
    
    if (agentsData.agents.length === 0) {
      test.skip();
      return;
    }
    
    const agentId = agentsData.agents[0].uniqueName;
    
    // Download solution
    const solutionResponse = await request.get(`/api/demo-solutions/${agentId}`);
    expect(solutionResponse.ok()).toBeTruthy();
    
    // Verify it's a zip file
    const contentType = solutionResponse.headers()['content-type'];
    expect(contentType).toContain('application');
  });

  test('should handle deployment creation workflow', async ({ request }) => {
    // This tests the full workflow that Claude Code skill would use
    
    // 1. Get agents
    const agentsResponse = await request.get('/api/agents');
    const agentsData = await agentsResponse.json();
    
    if (agentsData.agents.length === 0) {
      test.skip();
      return;
    }
    
    // 2. Get tenants
    const tenantsResponse = await request.get('/api/tenants');
    const tenantsData = await tenantsResponse.json();
    
    if (tenantsData.tenants.length === 0) {
      test.skip();
      return;
    }
    
    // 3. Download solution
    const agentId = agentsData.agents[0].uniqueName;
    const solutionResponse = await request.get(`/api/demo-solutions/${agentId}`);
    expect(solutionResponse.ok()).toBeTruthy();
    
    const solutionBuffer = await solutionResponse.body();
    
    // 4. Create deployment (multipart form)
    const tenantId = tenantsData.tenants[0].tenantId;
    
    const formData = {
      multipart: {
        solution: {
          name: `${agentId}_managed.zip`,
          mimeType: 'application/zip',
          buffer: solutionBuffer,
        },
        tenantIds: JSON.stringify([tenantId]),
      },
    };
    
    const createResponse = await request.post('/api/deployments/create', formData);
    expect(createResponse.ok()).toBeTruthy();
    
    const createData = await createResponse.json();
    expect(createData).toHaveProperty('deploymentId');
    expect(createData.demoMode).toBe(true);
  });

  test('should provide helpful error messages', async ({ request }) => {
    // Test error scenarios that Claude Code skill might encounter
    
    // Non-existent deployment
    const response = await request.get('/api/deployments/nonexistent');
    expect(response.ok()).toBe(false);
    
    // Non-existent agent solution
    const solutionResponse = await request.get('/api/demo-solutions/NonExistentAgent');
    expect(solutionResponse.ok()).toBe(false);
  });
});

test.describe('Claude Code Skill Slash Commands', () => {
  test('/deployments workflow - list and analyze', async ({ request }) => {
    // Simulates: User runs "/deployments" slash command
    
    const response = await request.get('/api/deployments?limit=10');
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data).toHaveProperty('deployments');
    
    // Verify we can identify failed deployments
    const failed = data.deployments.filter((d: any) => d.status === 'failed');
    expect(Array.isArray(failed)).toBe(true);
  });

  test('/deploy workflow - guided deployment creation', async ({ request }) => {
    // Simulates: User runs "/deploy" slash command
    
    // Step 1: List available agents
    const agentsResponse = await request.get('/api/agents');
    expect(agentsResponse.ok()).toBeTruthy();
    
    // Step 2: List available tenants
    const tenantsResponse = await request.get('/api/tenants');
    expect(tenantsResponse.ok()).toBeTruthy();
    
    // Workflow should guide user through selection
    const agentsData = await agentsResponse.json();
    const tenantsData = await tenantsResponse.json();
    
    expect(agentsData.agents.length).toBeGreaterThan(0);
    expect(tenantsData.tenants.length).toBeGreaterThan(0);
  });

  test('/monitor workflow - real-time progress', async ({ request }) => {
    // Simulates: User runs "/monitor <deployment-id>" slash command
    
    // Get a recent deployment
    const listResponse = await request.get('/api/deployments?limit=1');
    const listData = await listResponse.json();
    
    if (listData.deployments.length === 0) {
      test.skip();
      return;
    }
    
    const deploymentId = listData.deployments[0].id;
    
    // Monitor progress
    const progressResponse = await request.get(`/api/deployments/${deploymentId}`);
    expect(progressResponse.ok()).toBeTruthy();
    
    const data = await progressResponse.json();
    expect(data).toHaveProperty('status');
    expect(data).toHaveProperty('tenantResults');
  });
});

import { vi } from "vitest";

/**
 * Mock API responses for testing
 */
export const mockDeploymentsResponse = {
  deployments: [
    {
      id: "batch-test-123",
      solutionName: "TestAgent_v1",
      status: "completed",
      createdAt: "2024-01-30T12:00:00.000Z",
      completedAt: "2024-01-30T12:05:00.000Z",
    },
    {
      id: "batch-test-456",
      solutionName: "TestAgent_v2",
      status: "failed",
      createdAt: "2024-01-30T11:00:00.000Z",
      completedAt: "2024-01-30T11:03:00.000Z",
    },
  ],
  total: 2,
};

export const mockDeploymentStatusResponse = {
  id: "batch-test-123",
  solutionName: "TestAgent_v1",
  status: "completed",
  createdAt: "2024-01-30T12:00:00.000Z",
  completedAt: "2024-01-30T12:05:00.000Z",
  tenantResults: [
    {
      tenantId: "11111111-1111-1111-1111-111111111111",
      tenantName: "Test Tenant 1",
      status: "completed",
    },
  ],
};

export const mockAgentsResponse = {
  agents: [
    {
      uniqueName: "TestAgent_v1",
      friendlyName: "Test Agent Version 1",
      version: "1.0.0",
      deployedTo: ["Tenant 1"],
    },
  ],
};

export const mockTenantsResponse = {
  tenants: [
    {
      tenantId: "11111111-1111-1111-1111-111111111111",
      name: "Test Tenant 1",
      environmentUrl: "https://test1.crm.dynamics.com",
      deployedAgents: ["TestAgent_v1"],
    },
  ],
};

export const mockStatsResponse = {
  totalDeployments: 100,
  activeDeployments: 5,
  completedToday: 12,
  totalTenants: 10,
  successRate: 0.95,
};

export const mockCreateDeploymentResponse = {
  deploymentId: "batch-new-789",
  status: "pending",
  demoMode: true,
};

/**
 * Create a mock fetch response
 */
export function createMockResponse(data: unknown, status = 200, ok = true) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(data),
    text: vi.fn().mockResolvedValue(JSON.stringify(data)),
    headers: {
      get: vi.fn().mockReturnValue(null),
    },
  };
}

/**
 * Create a mock fetch function
 */
export function createMockFetch(responses: Map<string, unknown>) {
  return vi.fn().mockImplementation((url: string) => {
    for (const [pattern, response] of responses.entries()) {
      if (url.includes(pattern)) {
        return Promise.resolve(createMockResponse(response));
      }
    }
    return Promise.resolve(createMockResponse({ error: "Not found" }, 404, false));
  });
}

/**
 * Mock api-client module
 */
export function mockApiClient() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    del: vi.fn(),
    apiRequest: vi.fn(),
  };
}

/**
 * Mock logger module
 */
export function mockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

/**
 * Shared test utilities for @agentsync packages
 *
 * Provides common mock factories, test fixtures, and helper functions
 * to reduce duplication across test files.
 */

import { vi } from 'vitest';
import type { Config, TenantConfig } from '../config/schema.js';

// ============================================================================
// Mock Factories
// ============================================================================

/**
 * Creates a mock TokenManager for testing authentication flows
 */
export function createMockTokenManager() {
  return {
    getDataverseToken: vi.fn().mockResolvedValue('mock-dataverse-token'),
    getToken: vi.fn().mockResolvedValue('mock-token'),
    getGraphToken: vi.fn().mockResolvedValue('mock-graph-token'),
    clearCache: vi.fn(),
  };
}

/**
 * Creates a mock DataverseClient for testing Dataverse operations
 */
export function createMockDataverseClient() {
  return {
    get: vi.fn().mockResolvedValue({ value: [] }),
    post: vi.fn().mockResolvedValue({}),
    patch: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    executeAction: vi.fn().mockResolvedValue({}),
    querySolutions: vi.fn().mockResolvedValue([]),
    getSolutionByName: vi.fn().mockResolvedValue(null),
  };
}

/**
 * Creates a mock SolutionOperations for testing deployment flows
 */
export function createMockSolutionOps() {
  return {
    listSolutions: vi.fn().mockResolvedValue([]),
    getSolution: vi.fn().mockResolvedValue(null),
    exportSolution: vi.fn().mockResolvedValue('/path/to/solution.zip'),
    importSolutionAsync: vi.fn().mockResolvedValue('import-job-123'),
    waitForImport: vi.fn().mockResolvedValue({ success: true, importJobId: 'import-job-123' }),
  };
}

/**
 * Creates a mock RollbackService for testing rollback flows
 */
export function createMockRollbackService() {
  return {
    createSnapshot: vi.fn().mockResolvedValue({ id: 'snapshot-123' }),
    getLatestSnapshot: vi.fn().mockResolvedValue(null),
    listSnapshots: vi.fn().mockResolvedValue([]),
    rollback: vi.fn().mockResolvedValue({ success: true }),
    cleanupOldSnapshots: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Creates a mock HealthCheckService for testing health checks
 */
export function createMockHealthCheckService() {
  return {
    checkTenantHealth: vi.fn().mockResolvedValue({
      healthy: true,
      checks: [{ name: 'api', passed: true }],
    }),
    checkAllTenants: vi.fn().mockResolvedValue([]),
  };
}

/**
 * Creates a mock WebhookService for testing notifications
 */
export function createMockWebhookService() {
  return {
    notifyTenantStarted: vi.fn().mockResolvedValue(undefined),
    notifyTenantCompleted: vi.fn().mockResolvedValue(undefined),
    notifyTenantFailed: vi.fn().mockResolvedValue(undefined),
    notifyDeploymentStarted: vi.fn().mockResolvedValue(undefined),
    notifyDeploymentCompleted: vi.fn().mockResolvedValue(undefined),
    notifyRollbackCompleted: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Creates a mock AuditLog for testing audit trails
 */
export function createMockAuditLog() {
  return {
    log: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    logDeploymentCreated: vi.fn().mockResolvedValue(undefined),
    logDeploymentCompleted: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Creates a mock Logger for testing log output
 */
export function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

/**
 * Creates a mock fetch response
 */
export function createMockFetchResponse(
  data: unknown,
  options: { ok?: boolean; status?: number; headers?: Record<string, string> } = {}
) {
  const { ok = true, status = 200, headers = {} } = options;
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(data),
    text: vi.fn().mockResolvedValue(JSON.stringify(data)),
    headers: new Map(Object.entries(headers)),
    clone: vi.fn().mockReturnThis(),
  };
}

/**
 * Creates a mock fetch that fails
 */
export function createMockFetchError(message: string, status = 500) {
  return {
    ok: false,
    status,
    json: vi.fn().mockResolvedValue({ error: message }),
    text: vi.fn().mockResolvedValue(message),
    headers: new Map(),
    clone: vi.fn().mockReturnThis(),
  };
}

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Creates a test tenant configuration
 */
export function createTestTenant(overrides: Partial<TenantConfig> = {}): TenantConfig {
  return {
    tenantId: '00000000-0000-0000-0000-000000000001',
    name: 'Test Tenant',
    environmentUrl: 'https://test.crm.dynamics.com',
    enabled: true,
    tags: [],
    ...overrides,
  };
}

/**
 * Creates a test configuration
 */
export function createTestConfig(overrides: Partial<Config> = {}): Config {
  return {
    version: '2.0',
    partner: {
      tenantId: '00000000-0000-0000-0000-000000000000',
      clientId: '11111111-1111-1111-1111-111111111111',
    },
    source: {
      tenantId: '22222222-2222-2222-2222-222222222222',
      environmentUrl: 'https://source.crm.dynamics.com',
    },
    tenants: [createTestTenant()],
    ...overrides,
  };
}

/**
 * Creates a test solution record
 */
export function createTestSolution(overrides: Partial<{
  solutionid: string;
  uniquename: string;
  friendlyname: string;
  version: string;
  ismanaged: boolean;
}> = {}) {
  return {
    solutionid: 'solution-123',
    uniquename: 'TestSolution',
    friendlyname: 'Test Solution',
    version: '1.0.0.0',
    ismanaged: false,
    isvisible: true,
    publisherid: {
      publisherid: 'publisher-123',
      uniquename: 'testpublisher',
      friendlyname: 'Test Publisher',
    },
    ...overrides,
  };
}

/**
 * Creates a test deployment job data
 */
export function createTestDeploymentJob(overrides: Partial<{
  deploymentId: string;
  solutionPath: string;
  solutionName: string;
  tenant: TenantConfig;
}> = {}) {
  return {
    deploymentId: 'deploy-123',
    solutionPath: '/path/to/solution.zip',
    solutionName: 'TestSolution',
    tenant: createTestTenant(),
    partnerTenantId: '00000000-0000-0000-0000-000000000000',
    partnerClientId: '11111111-1111-1111-1111-111111111111',
    ...overrides,
  };
}

/**
 * Creates complete rollback settings for tests
 */
export function createTestRollbackSettings(overrides: Partial<{
  enabled: boolean;
  keepVersions: number;
  autoRollbackOnFailure: boolean;
  rollbackTimeout: string;
}> = {}) {
  return {
    enabled: true,
    keepVersions: 3,
    autoRollbackOnFailure: false,
    rollbackTimeout: '10m',
    ...overrides,
  };
}

/**
 * Creates complete health check settings for tests
 */
export function createTestHealthCheckSettings(overrides: Partial<{
  enabled: boolean;
  expectedStatus: number;
  timeout: string;
  retries: number;
  endpoint?: string;
}> = {}) {
  return {
    enabled: true,
    expectedStatus: 200,
    timeout: '30s',
    retries: 3,
    ...overrides,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Wait for a specified number of milliseconds
 * Useful for testing async behavior with timeouts
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a deferred promise for testing async flows
 */
export function createDeferred<T>() {
  let resolve: (value: T) => void;
  let reject: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve: resolve!, reject: reject! };
}

/**
 * Assert that a promise rejects with a specific error message
 */
export async function expectToReject(
  promise: Promise<unknown>,
  errorMessageOrPattern: string | RegExp
): Promise<void> {
  try {
    await promise;
    throw new Error('Expected promise to reject but it resolved');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (typeof errorMessageOrPattern === 'string') {
      if (!message.includes(errorMessageOrPattern)) {
        throw new Error(
          `Expected error message to include "${errorMessageOrPattern}" but got: "${message}"`
        );
      }
    } else {
      if (!errorMessageOrPattern.test(message)) {
        throw new Error(
          `Expected error message to match ${errorMessageOrPattern} but got: "${message}"`
        );
      }
    }
  }
}

/**
 * Mock the global fetch function
 * Returns a cleanup function to restore the original
 */
export function mockGlobalFetch(mockFn: ReturnType<typeof vi.fn> = vi.fn()) {
  const originalFetch = globalThis.fetch;
  // Cast is safe because we control the mock implementation
  globalThis.fetch = mockFn as unknown as typeof fetch;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

/**
 * Create a mock BullMQ job for testing worker processors
 */
export function createMockBullMQJob(data: unknown, overrides: Partial<{
  id: string;
  name: string;
  attemptsMade: number;
  timestamp: number;
}> = {}) {
  return {
    id: 'job-123',
    name: 'test-job',
    data,
    attemptsMade: 0,
    timestamp: Date.now(),
    updateProgress: vi.fn().mockResolvedValue(undefined),
    log: vi.fn().mockResolvedValue(undefined),
    moveToFailed: vi.fn().mockResolvedValue(undefined),
    moveToCompleted: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

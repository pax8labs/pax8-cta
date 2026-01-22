import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TenantConfig, Config } from '@agentsync/core';

// Use vi.hoisted to ensure mocks are available before imports
const mockWorkerLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

const mockSolutionOps = vi.hoisted(() => ({
  importSolutionAsync: vi.fn().mockResolvedValue('import-job-123'),
  waitForImport: vi.fn().mockResolvedValue({ success: true, importJobId: 'import-job-123' }),
}));

const mockConnectionOps = vi.hoisted(() => ({
  applyConnectionMappings: vi.fn().mockResolvedValue(undefined),
  applyEnvironmentVariables: vi.fn().mockResolvedValue(undefined),
}));

const mockHealthCheckService = vi.hoisted(() => ({
  checkTenantHealth: vi.fn().mockResolvedValue({
    healthy: true,
    checks: [{ name: 'api', passed: true }],
  }),
}));

const mockRollbackService = vi.hoisted(() => ({
  createSnapshot: vi.fn().mockResolvedValue({ id: 'snapshot-123' }),
  getLatestSnapshot: vi.fn().mockResolvedValue(null),
  rollback: vi.fn().mockResolvedValue({ success: true }),
}));

const mockWebhookService = vi.hoisted(() => ({
  notifyTenantStarted: vi.fn().mockResolvedValue(undefined),
  notifyTenantCompleted: vi.fn().mockResolvedValue(undefined),
  notifyTenantFailed: vi.fn().mockResolvedValue(undefined),
  notifyRollbackCompleted: vi.fn().mockResolvedValue(undefined),
}));

const mockAuditLog = vi.hoisted(() => ({
  log: vi.fn().mockResolvedValue(undefined),
}));

const mockWorker = vi.hoisted(() => ({
  on: vi.fn(),
  close: vi.fn().mockResolvedValue(undefined),
}));

// Mock BullMQ
vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation((_name, processor, _options) => {
    // Store the processor function so we can test it
    const workerInstance = { ...mockWorker, _processor: processor };
    return workerInstance;
  }),
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({ id: 'job-123' }),
    addBulk: vi.fn().mockResolvedValue([]),
    close: vi.fn().mockResolvedValue(undefined),
  })),
  QueueEvents: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  })),
  Job: vi.fn(),
}));

// Mock @agentsync/core modules with hoisted mocks
vi.mock('@agentsync/core', () => ({
  TokenManager: vi.fn().mockImplementation(() => ({
    getToken: vi.fn().mockResolvedValue('mock-token'),
  })),
  DataverseClient: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue({ value: [] }),
    executeAction: vi.fn().mockResolvedValue({}),
  })),
  SolutionOperations: vi.fn().mockImplementation(() => mockSolutionOps),
  ConnectionOperations: vi.fn().mockImplementation(() => mockConnectionOps),
  RollbackService: vi.fn().mockImplementation(() => mockRollbackService),
  HealthCheckService: vi.fn().mockImplementation(() => mockHealthCheckService),
  WebhookService: vi.fn().mockImplementation(() => mockWebhookService),
  SchedulerService: vi.fn().mockImplementation(() => ({
    isWithinMaintenanceWindow: vi.fn().mockReturnValue(true),
    validateCron: vi.fn().mockReturnValue({ valid: true }),
    describeCron: vi.fn().mockReturnValue('Every day at midnight'),
  })),
  getClientSecret: vi.fn().mockReturnValue('mock-client-secret'),
  getEffectiveConnectionMappings: vi.fn().mockReturnValue([]),
  getEffectiveEnvironmentVariables: vi.fn().mockReturnValue([]),
  getEffectiveRollbackSettings: vi.fn().mockReturnValue({
    enabled: false,
    autoRollbackOnFailure: false,
  }),
  workerLogger: mockWorkerLogger,
  timedOperation: vi.fn().mockImplementation(async (_logger, _name, fn) => fn()),
  getAuditLog: vi.fn().mockReturnValue(mockAuditLog),
  parseRedisUrl: vi.fn().mockReturnValue({
    host: 'localhost',
    port: 6379,
    maxRetriesPerRequest: null,
  }),
  DEFAULT_REDIS_URL: 'redis://localhost:6379',
  DEFAULT_WORKER_CONCURRENCY: 5,
  DEFAULT_RATE_LIMIT_MAX: 10,
  DEFAULT_RATE_LIMIT_DURATION_MS: 1000,
  SOLUTION_IMPORT_POLL_INTERVAL_MS: 5000,
  SOLUTION_IMPORT_TIMEOUT_MS: 300000,
  // Queue constants needed by DeploymentQueueManager
  DEFAULT_JOB_ATTEMPTS: 3,
  JOB_RETRY_INITIAL_DELAY_MS: 10000,
  COMPLETED_JOB_RETENTION_MS: 86400000,
  COMPLETED_JOB_MAX_COUNT: 1000,
  FAILED_JOB_RETENTION_MS: 604800000,
  SCHEDULED_JOB_RETENTION_MS: 86400000,
  SCHEDULED_JOB_MAX_COUNT: 500,
  SCHEDULED_FAILED_JOB_RETENTION_MS: 604800000,
  ONE_SECOND_MS: 1000,
  // Mock deployment status update function
  updateDeploymentStatus: vi.fn(),
}));

// Import after mocks are set up
import {
  createTenantDeploymentWorker,
  createScheduledDeploymentWorker,
  cleanupWorker,
} from '../processor.js';
import { Worker } from 'bullmq';
import {
  getEffectiveRollbackSettings,
  getEffectiveConnectionMappings,
} from '@agentsync/core';

describe('Processor', () => {
  const mockTenant = {
    tenantId: 'tenant-123',
    name: 'Test Tenant',
    environmentUrl: 'https://test.crm.dynamics.com',
    enabled: true,
    tags: [],
  } as TenantConfig;

  const mockConfig = {
    version: '2.0',
    source: {
      environmentUrl: 'https://source.crm.dynamics.com',
    },
    partner: {
      tenantId: 'partner-tenant-123',
      clientId: 'partner-client-123',
    },
    tenants: [mockTenant],
  } as Config;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mock implementations
    mockSolutionOps.importSolutionAsync.mockResolvedValue('import-job-123');
    mockSolutionOps.waitForImport.mockResolvedValue({ success: true, importJobId: 'import-job-123' });
    mockHealthCheckService.checkTenantHealth.mockResolvedValue({
      healthy: true,
      checks: [{ name: 'api', passed: true }],
    });
    mockRollbackService.createSnapshot.mockResolvedValue({ id: 'snapshot-123' });
    vi.mocked(getEffectiveRollbackSettings).mockReturnValue({
      enabled: false,
      keepVersions: 3,
      autoRollbackOnFailure: false,
      rollbackTimeout: '10m',
    });
    vi.mocked(getEffectiveConnectionMappings).mockReturnValue([]);
  });

  afterEach(async () => {
    await cleanupWorker();
  });

  describe('createTenantDeploymentWorker', () => {
    it('should create a worker with default options', () => {
      const worker = createTenantDeploymentWorker();

      expect(Worker).toHaveBeenCalledWith(
        'tenant-deployments',
        expect.any(Function),
        expect.objectContaining({
          connection: expect.objectContaining({
            host: 'localhost',
            port: 6379,
          }),
          concurrency: 5,
        })
      );
      expect(worker.on).toBeDefined();
    });

    it('should create a worker with custom options', () => {
      const worker = createTenantDeploymentWorker({
        redisUrl: 'redis://custom:6380',
        concurrency: 10,
        rateLimitMax: 20,
        rateLimitDuration: 2000,
      });

      expect(Worker).toHaveBeenCalled();
      expect(worker).toBeDefined();
    });

    it('should initialize services when config is provided', () => {
      createTenantDeploymentWorker({ config: mockConfig });

      expect(mockWorkerLogger.info).toHaveBeenCalledWith(
        'Worker services initialized',
        expect.objectContaining({
          hasRollback: true,
          hasHealthCheck: true,
        })
      );
    });

    it('should register event handlers', () => {
      const worker = createTenantDeploymentWorker();

      expect(worker.on).toHaveBeenCalledWith('completed', expect.any(Function));
      expect(worker.on).toHaveBeenCalledWith('failed', expect.any(Function));
      expect(worker.on).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });

  describe('processTenantDeployment (via worker processor)', () => {
    const createMockJob = (overrides = {}) => ({
      id: 'job-123',
      data: {
        deploymentId: 'deploy-123',
        solutionPath: '/path/to/solution.zip',
        solutionName: 'TestSolution',
        tenant: mockTenant,
        partnerTenantId: 'partner-tenant-123',
        partnerClientId: 'partner-client-123',
        config: mockConfig,
        ...overrides,
      },
      attemptsMade: 0,
      updateProgress: vi.fn().mockResolvedValue(undefined),
      getState: vi.fn().mockResolvedValue('active'),
      log: vi.fn(),
    });

    it('should process a successful deployment', async () => {
      const worker = createTenantDeploymentWorker({ config: mockConfig });
      // @ts-expect-error - accessing internal processor for testing
      const processor = worker._processor;

      const mockJob = createMockJob();
      const result = await processor(mockJob);

      expect(result.success).toBe(true);
      expect(result.tenantId).toBe('tenant-123');
      expect(result.tenantName).toBe('Test Tenant');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should log deployment start', async () => {
      const worker = createTenantDeploymentWorker({ config: mockConfig });
      // @ts-expect-error - accessing internal processor for testing
      const processor = worker._processor;

      const mockJob = createMockJob();
      await processor(mockJob);

      expect(mockWorkerLogger.info).toHaveBeenCalledWith(
        'Starting deployment',
        expect.objectContaining({
          jobId: 'job-123',
          deploymentId: 'deploy-123',
          tenant: 'Test Tenant',
        })
      );
    });

    it('should update job progress during deployment', async () => {
      const worker = createTenantDeploymentWorker({ config: mockConfig });
      // @ts-expect-error - accessing internal processor for testing
      const processor = worker._processor;

      const mockJob = createMockJob();
      await processor(mockJob);

      // Progress should be updated multiple times during deployment
      expect(mockJob.updateProgress).toHaveBeenCalled();
    });

    it('should handle import failure', async () => {
      mockSolutionOps.waitForImport.mockResolvedValueOnce({
        success: false,
        importJobId: 'import-job-456',
        error: 'Solution import failed: missing dependency',
      });

      const worker = createTenantDeploymentWorker({ config: mockConfig });
      // @ts-expect-error - accessing internal processor for testing
      const processor = worker._processor;

      const mockJob = createMockJob();
      const result = await processor(mockJob);

      expect(result.success).toBe(false);
      expect(result.error).toContain('missing dependency');
    });

    it('should run pre-deployment health check when enabled', async () => {
      const configWithHealthCheck: Config = {
        ...mockConfig,
        settings: {
          healthCheck: {
            enabled: true,
            expectedStatus: 200,
            timeout: '30s',
            retries: 2,
          },
        },
      };

      const worker = createTenantDeploymentWorker({ config: configWithHealthCheck });
      // @ts-expect-error - accessing internal processor for testing
      const processor = worker._processor;

      const mockJob = createMockJob({ config: configWithHealthCheck });
      await processor(mockJob);

      // Health check should have been called
      expect(mockWorkerLogger.info).toHaveBeenCalledWith(
        'Running pre-deployment health check',
        expect.any(Object)
      );
    });

    it('should fail deployment when pre-deployment health check fails', async () => {
      mockHealthCheckService.checkTenantHealth.mockResolvedValueOnce({
        healthy: false,
        checks: [{ name: 'api', passed: false }],
      });

      const configWithHealthCheck: Config = {
        ...mockConfig,
        settings: {
          healthCheck: {
            enabled: true,
            expectedStatus: 200,
            timeout: '30s',
            retries: 3,
          },
        },
      };

      const worker = createTenantDeploymentWorker({ config: configWithHealthCheck });
      // @ts-expect-error - accessing internal processor for testing
      const processor = worker._processor;

      const mockJob = createMockJob({ config: configWithHealthCheck });
      const result = await processor(mockJob);

      expect(result.success).toBe(false);
      expect(result.error).toContain('health check failed');
    });

    it('should create rollback snapshot when enabled', async () => {
      vi.mocked(getEffectiveRollbackSettings).mockReturnValue({
        enabled: true,
        keepVersions: 3,
        autoRollbackOnFailure: false,
        rollbackTimeout: '10m',
      });

      const worker = createTenantDeploymentWorker({ config: mockConfig });
      // @ts-expect-error - accessing internal processor for testing
      const processor = worker._processor;

      const mockJob = createMockJob();
      await processor(mockJob);

      expect(mockWorkerLogger.info).toHaveBeenCalledWith(
        'Creating rollback snapshot',
        expect.any(Object)
      );
    });

    it('should handle exceptions gracefully', async () => {
      mockSolutionOps.importSolutionAsync.mockRejectedValueOnce(new Error('Network error'));

      const worker = createTenantDeploymentWorker({ config: mockConfig });
      // @ts-expect-error - accessing internal processor for testing
      const processor = worker._processor;

      const mockJob = createMockJob();
      const result = await processor(mockJob);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should apply connection mappings after import', async () => {
      vi.mocked(getEffectiveConnectionMappings).mockReturnValue([
        { sourceLogicalName: 'conn1', targetConnectionId: 'conn-id-1' },
      ]);

      const worker = createTenantDeploymentWorker({ config: mockConfig });
      // @ts-expect-error - accessing internal processor for testing
      const processor = worker._processor;

      const mockJob = createMockJob();
      await processor(mockJob);

      // Connection mappings should be applied
      expect(mockWorkerLogger.info).toHaveBeenCalledWith(
        'Configuring connection references',
        expect.objectContaining({ count: 1 })
      );
    });

    it('should log audit entry on successful deployment', async () => {
      const worker = createTenantDeploymentWorker({ config: mockConfig });
      // @ts-expect-error - accessing internal processor for testing
      const processor = worker._processor;

      const mockJob = createMockJob();
      await processor(mockJob);

      expect(mockAuditLog.log).toHaveBeenCalledWith(
        'solution.imported',
        expect.objectContaining({
          userId: 'worker',
          resourceType: 'tenant',
          resourceId: 'tenant-123',
          success: true,
        })
      );
    });

    it('should log audit entry on failed deployment', async () => {
      mockSolutionOps.importSolutionAsync.mockRejectedValueOnce(new Error('Import error'));

      const worker = createTenantDeploymentWorker({ config: mockConfig });
      // @ts-expect-error - accessing internal processor for testing
      const processor = worker._processor;

      const mockJob = createMockJob();
      await processor(mockJob);

      expect(mockAuditLog.log).toHaveBeenCalledWith(
        'solution.imported',
        expect.objectContaining({
          success: false,
          errorMessage: 'Import error',
        })
      );
    });

    it('should auto-rollback when import fails and autoRollbackOnFailure is enabled', async () => {
      mockSolutionOps.waitForImport.mockResolvedValueOnce({
        success: false,
        importJobId: 'import-job-789',
        error: 'Import failed',
      });

      mockRollbackService.getLatestSnapshot.mockResolvedValueOnce({
        id: 'snapshot-latest',
        solutionName: 'TestSolution',
        tenantId: 'tenant-123',
      });

      vi.mocked(getEffectiveRollbackSettings).mockReturnValue({
        enabled: true,
        keepVersions: 3,
        autoRollbackOnFailure: true,
        rollbackTimeout: '10m',
      });

      const worker = createTenantDeploymentWorker({ config: mockConfig });
      // @ts-expect-error - accessing internal processor for testing
      const processor = worker._processor;

      const mockJob = createMockJob();
      await processor(mockJob);

      expect(mockWorkerLogger.info).toHaveBeenCalledWith(
        'Initiating auto-rollback',
        expect.any(Object)
      );
      expect(mockRollbackService.rollback).toHaveBeenCalled();
    });
  });

  describe('createScheduledDeploymentWorker', () => {
    it('should create a scheduled deployment worker', () => {
      const worker = createScheduledDeploymentWorker();

      expect(Worker).toHaveBeenCalledWith(
        'scheduled-deployments',
        expect.any(Function),
        expect.objectContaining({
          concurrency: 1, // Should only process one schedule at a time
        })
      );
      expect(worker).toBeDefined();
    });

    it('should register event handlers', () => {
      const worker = createScheduledDeploymentWorker();

      expect(worker.on).toHaveBeenCalledWith('completed', expect.any(Function));
      expect(worker.on).toHaveBeenCalledWith('failed', expect.any(Function));
      expect(worker.on).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });

  describe('cleanupWorker', () => {
    it('should clean up worker resources', async () => {
      // First initialize services
      createTenantDeploymentWorker({ config: mockConfig });

      // Then cleanup
      await cleanupWorker();

      expect(mockWorkerLogger.info).toHaveBeenCalledWith('Cleaning up worker resources');
    });
  });
});

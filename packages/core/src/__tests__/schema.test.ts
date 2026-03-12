import { describe, it, expect } from "vitest";
import {
  parseDuration,
  getEffectiveConnectionMappings,
  getEffectiveEnvironmentVariables,
  getEffectiveRollbackSettings,
  TenantConfigSchema,
  DeploymentSchema,
  DeploymentBatchSchema,
  DeploymentJobSchema,
  DeploymentSnapshotSchema,
  WebhookEventSchema,
  migrateDeploymentJob,
  DEPLOYMENT_STATUS_CATEGORIES,
  calculateDeploymentStatus,
  type DeploymentJob,
  type Deployment,
  type DeploymentBatch,
  type DeploymentStatus,
} from "../config/schema.js";

describe("parseDuration", () => {
  it("should parse milliseconds", () => {
    expect(parseDuration("100ms")).toBe(100);
    expect(parseDuration("1ms")).toBe(1);
  });

  it("should parse seconds", () => {
    expect(parseDuration("30s")).toBe(30000);
    expect(parseDuration("1s")).toBe(1000);
  });

  it("should parse minutes", () => {
    expect(parseDuration("5m")).toBe(300000);
    expect(parseDuration("1m")).toBe(60000);
  });

  it("should parse hours", () => {
    expect(parseDuration("2h")).toBe(7200000);
    expect(parseDuration("1h")).toBe(3600000);
  });

  it("should parse days", () => {
    expect(parseDuration("1d")).toBe(86400000);
    expect(parseDuration("7d")).toBe(604800000);
  });

  it("should throw for invalid format", () => {
    expect(() => parseDuration("invalid")).toThrow("Invalid duration format");
    expect(() => parseDuration("5")).toThrow("Invalid duration format");
    expect(() => parseDuration("5x")).toThrow("Invalid duration format");
  });
});

describe("getEffectiveConnectionMappings", () => {
  it("should return global mappings when tenant has none", () => {
    const config = {
      version: "2.0",
      partner: {
        tenantId: "00000000-0000-0000-0000-000000000001",
        clientId: "00000000-0000-0000-0000-000000000002",
      },
      source: {
        tenantId: "00000000-0000-0000-0000-000000000003",
        environmentUrl: "https://source.crm.dynamics.com",
      },
      tenants: [],
      settings: {
        defaultConnectionMappings: [
          { sourceLogicalName: "cr_sharepoint", targetConnectionId: "global-sp-123" },
        ],
      },
    };

    const tenant = {
      name: "Test Tenant",
      tenantId: "00000000-0000-0000-0000-000000000004",
      environmentUrl: "https://test.crm.dynamics.com",
      tags: [],
      enabled: true,
    };

    const result = getEffectiveConnectionMappings(config, tenant);
    expect(result).toHaveLength(1);
    expect(result[0].targetConnectionId).toBe("global-sp-123");
  });

  it("should override global mappings with tenant-specific", () => {
    const config = {
      version: "2.0",
      partner: {
        tenantId: "00000000-0000-0000-0000-000000000001",
        clientId: "00000000-0000-0000-0000-000000000002",
      },
      source: {
        tenantId: "00000000-0000-0000-0000-000000000003",
        environmentUrl: "https://source.crm.dynamics.com",
      },
      tenants: [],
      settings: {
        defaultConnectionMappings: [
          { sourceLogicalName: "cr_sharepoint", targetConnectionId: "global-sp-123" },
          { sourceLogicalName: "cr_outlook", targetConnectionId: "global-ol-456" },
        ],
      },
    };

    const tenant = {
      name: "Test Tenant",
      tenantId: "00000000-0000-0000-0000-000000000004",
      environmentUrl: "https://test.crm.dynamics.com",
      tags: [],
      enabled: true,
      connectionMappings: [
        { sourceLogicalName: "cr_sharepoint", targetConnectionId: "tenant-sp-789" },
      ],
    };

    const result = getEffectiveConnectionMappings(config, tenant);
    expect(result).toHaveLength(2);

    const spMapping = result.find((m) => m.sourceLogicalName === "cr_sharepoint");
    const olMapping = result.find((m) => m.sourceLogicalName === "cr_outlook");

    expect(spMapping?.targetConnectionId).toBe("tenant-sp-789");
    expect(olMapping?.targetConnectionId).toBe("global-ol-456");
  });
});

describe("getEffectiveEnvironmentVariables", () => {
  it("should merge global and tenant variables", () => {
    const config = {
      version: "2.0",
      partner: {
        tenantId: "00000000-0000-0000-0000-000000000001",
        clientId: "00000000-0000-0000-0000-000000000002",
      },
      source: {
        tenantId: "00000000-0000-0000-0000-000000000003",
        environmentUrl: "https://source.crm.dynamics.com",
      },
      tenants: [],
      settings: {
        defaultEnvironmentVariables: [
          { schemaName: "cr_Environment", value: "Production", type: "String" as const },
        ],
      },
    };

    const tenant = {
      name: "Test Tenant",
      tenantId: "00000000-0000-0000-0000-000000000004",
      environmentUrl: "https://test.crm.dynamics.com",
      tags: [],
      enabled: true,
      environmentVariables: [
        { schemaName: "cr_SupportEmail", value: "support@test.com", type: "String" as const },
      ],
    };

    const result = getEffectiveEnvironmentVariables(config, tenant);
    expect(result).toHaveLength(2);
  });

  it("should allow tenant to override global variables", () => {
    const config = {
      version: "2.0",
      partner: {
        tenantId: "00000000-0000-0000-0000-000000000001",
        clientId: "00000000-0000-0000-0000-000000000002",
      },
      source: {
        tenantId: "00000000-0000-0000-0000-000000000003",
        environmentUrl: "https://source.crm.dynamics.com",
      },
      tenants: [],
      settings: {
        defaultEnvironmentVariables: [
          { schemaName: "cr_MaxRetries", value: 3, type: "Number" as const },
        ],
      },
    };

    const tenant = {
      name: "Test Tenant",
      tenantId: "00000000-0000-0000-0000-000000000004",
      environmentUrl: "https://test.crm.dynamics.com",
      tags: [],
      enabled: true,
      environmentVariables: [{ schemaName: "cr_MaxRetries", value: 5, type: "Number" as const }],
    };

    const result = getEffectiveEnvironmentVariables(config, tenant);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(5);
  });
});

describe("getEffectiveRollbackSettings", () => {
  it("should return default settings when none configured", () => {
    const config = {
      version: "2.0",
      partner: {
        tenantId: "00000000-0000-0000-0000-000000000001",
        clientId: "00000000-0000-0000-0000-000000000002",
      },
      source: {
        tenantId: "00000000-0000-0000-0000-000000000003",
        environmentUrl: "https://source.crm.dynamics.com",
      },
      tenants: [],
    };

    const tenant = {
      name: "Test Tenant",
      tenantId: "00000000-0000-0000-0000-000000000004",
      environmentUrl: "https://test.crm.dynamics.com",
      tags: [],
      enabled: true,
    };

    const result = getEffectiveRollbackSettings(config, tenant);
    expect(result.enabled).toBe(true);
    expect(result.keepVersions).toBe(3);
  });

  it("should merge global and tenant rollback settings", () => {
    const config = {
      version: "2.0",
      partner: {
        tenantId: "00000000-0000-0000-0000-000000000001",
        clientId: "00000000-0000-0000-0000-000000000002",
      },
      source: {
        tenantId: "00000000-0000-0000-0000-000000000003",
        environmentUrl: "https://source.crm.dynamics.com",
      },
      tenants: [],
      settings: {
        rollback: {
          enabled: true,
          keepVersions: 5,
          autoRollbackOnFailure: false,
          rollbackTimeout: "10m",
        },
      },
    };

    const tenant = {
      name: "Test Tenant",
      tenantId: "00000000-0000-0000-0000-000000000004",
      environmentUrl: "https://test.crm.dynamics.com",
      tags: [],
      enabled: true,
      rollback: {
        keepVersions: 10,
      },
    };

    const result = getEffectiveRollbackSettings(config, tenant);
    expect(result.enabled).toBe(true);
    expect(result.keepVersions).toBe(10);
  });
});

describe("TenantConfigSchema", () => {
  it("should validate a minimal tenant config", () => {
    const tenant = {
      name: "Test Tenant",
      tenantId: "00000000-0000-0000-0000-000000000001",
      environmentUrl: "https://test.crm.dynamics.com",
    };

    const result = TenantConfigSchema.safeParse(tenant);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(true);
      expect(result.data.tags).toEqual([]);
    }
  });

  it("should validate a full tenant config", () => {
    const tenant = {
      name: "Test Tenant",
      tenantId: "00000000-0000-0000-0000-000000000001",
      environmentUrl: "https://test.crm.dynamics.com",
      tags: ["enterprise", "wave1"],
      enabled: true,
      connectionMappings: [{ sourceLogicalName: "cr_sharepoint", targetConnectionId: "sp-123" }],
      environmentVariables: [{ schemaName: "cr_Email", value: "test@test.com", type: "String" }],
      healthCheck: {
        enabled: true,
        timeout: "30s",
      },
      rollback: {
        enabled: true,
        keepVersions: 5,
      },
    };

    const result = TenantConfigSchema.safeParse(tenant);
    expect(result.success).toBe(true);
  });

  it("should reject invalid tenant config", () => {
    const tenant = {
      name: "Test Tenant",
      tenantId: "invalid-uuid",
      environmentUrl: "not-a-url",
    };

    const result = TenantConfigSchema.safeParse(tenant);
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// v2 Deployment Model Tests
// ============================================================================

describe("Deployment Schema (v2)", () => {
  const validDeployment: Deployment = {
    id: "batch-abc123-0",
    batchId: "batch-abc123",
    solutionName: "CustomerServiceAgent",
    solutionVersion: "1.0.0",
    solutionPath: "./solutions/CustomerServiceAgent_1_0_0.zip",
    tenantId: "11111111-1111-1111-1111-111111111111",
    tenantName: "Contoso Corp",
    environmentUrl: "https://contoso.crm.dynamics.com",
    status: "pending",
    createdAt: "2024-01-15T10:00:00.000Z",
    updatedAt: "2024-01-15T10:00:00.000Z",
    attemptNumber: 1,
    triggeredBy: "manual",
  };

  it("validates a valid deployment", () => {
    const result = DeploymentSchema.safeParse(validDeployment);
    expect(result.success).toBe(true);
  });

  it("allows optional fields to be omitted", () => {
    const minimal = {
      id: "deploy-1",
      solutionName: "TestAgent",
      tenantId: "11111111-1111-1111-1111-111111111111",
      tenantName: "Test Tenant",
      status: "pending",
      createdAt: "2024-01-15T10:00:00.000Z",
      updatedAt: "2024-01-15T10:00:00.000Z",
    };
    const result = DeploymentSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });

  it("validates all deployment statuses", () => {
    const statuses = [
      "pending",
      "scheduled",
      "awaiting_approval",
      "approved",
      "rejected",
      "in_progress",
      "completed",
      "failed",
      "cancelled",
      "rolling_back",
      "rolled_back",
    ];

    for (const status of statuses) {
      const deployment = { ...validDeployment, status };
      const result = DeploymentSchema.safeParse(deployment);
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid tenant ID format", () => {
    const invalid = { ...validDeployment, tenantId: "not-a-uuid" };
    const result = DeploymentSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects invalid status", () => {
    const invalid = { ...validDeployment, status: "invalid_status" };
    const result = DeploymentSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects invalid datetime format", () => {
    const invalid = { ...validDeployment, createdAt: "not-a-date" };
    const result = DeploymentSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("DeploymentBatch Schema", () => {
  const validBatch: DeploymentBatch = {
    id: "batch-abc123",
    solutionName: "CustomerServiceAgent",
    solutionVersion: "1.0.0",
    solutionPath: "./solutions/CustomerServiceAgent_1_0_0.zip",
    status: "in_progress",
    totalDeployments: 5,
    completedDeployments: 2,
    failedDeployments: 1,
    createdAt: "2024-01-15T10:00:00.000Z",
    updatedAt: "2024-01-15T10:05:00.000Z",
    startedAt: "2024-01-15T10:01:00.000Z",
    triggeredBy: "manual",
  };

  it("validates a valid batch", () => {
    const result = DeploymentBatchSchema.safeParse(validBatch);
    expect(result.success).toBe(true);
  });

  it("validates batch with approvals", () => {
    const batchWithApprovals = {
      ...validBatch,
      approvals: [
        {
          approver: "admin@contoso.com",
          approved: true,
          timestamp: "2024-01-15T10:00:30.000Z",
          comment: "Approved for production",
        },
      ],
    };
    const result = DeploymentBatchSchema.safeParse(batchWithApprovals);
    expect(result.success).toBe(true);
  });

  it("validates batch with wave tracking", () => {
    const batchWithWaves = {
      ...validBatch,
      currentWave: 2,
      totalWaves: 3,
    };
    const result = DeploymentBatchSchema.safeParse(batchWithWaves);
    expect(result.success).toBe(true);
  });

  it("rejects negative deployment counts", () => {
    const invalid = { ...validBatch, completedDeployments: -1 };
    const result = DeploymentBatchSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects invalid approver email", () => {
    const invalid = {
      ...validBatch,
      approvals: [
        {
          approver: "not-an-email",
          approved: true,
          timestamp: "2024-01-15T10:00:30.000Z",
        },
      ],
    };
    const result = DeploymentBatchSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("migrateDeploymentJob", () => {
  const legacyJob: DeploymentJob = {
    id: "deploy-legacy-001",
    solutionPath: "./solutions/OldAgent_1_0_0.zip",
    solutionName: "OldAgent",
    solutionVersion: "1.0.0",
    status: "completed",
    createdAt: "2024-01-10T09:00:00.000Z",
    updatedAt: "2024-01-10T09:30:00.000Z",
    startedAt: "2024-01-10T09:01:00.000Z",
    completedAt: "2024-01-10T09:30:00.000Z",
    tenantResults: [
      {
        tenantId: "11111111-1111-1111-1111-111111111111",
        tenantName: "Contoso Corp",
        status: "completed",
        startedAt: "2024-01-10T09:01:00.000Z",
        completedAt: "2024-01-10T09:15:00.000Z",
        attemptNumber: 1,
      },
      {
        tenantId: "22222222-2222-2222-2222-222222222222",
        tenantName: "Fabrikam Inc",
        status: "failed",
        startedAt: "2024-01-10T09:15:00.000Z",
        completedAt: "2024-01-10T09:20:00.000Z",
        error: "Connection timeout",
        attemptNumber: 2,
      },
      {
        tenantId: "33333333-3333-3333-3333-333333333333",
        tenantName: "Adventure Works",
        status: "completed",
        startedAt: "2024-01-10T09:20:00.000Z",
        completedAt: "2024-01-10T09:30:00.000Z",
        attemptNumber: 1,
      },
    ],
    totalTenants: 3,
    completedTenants: 2,
    failedTenants: 1,
    triggeredBy: "manual",
  };

  it("creates correct number of deployments", () => {
    const { deployments } = migrateDeploymentJob(legacyJob);
    expect(deployments.length).toBe(3);
  });

  it("preserves tenant information in deployments", () => {
    const { deployments } = migrateDeploymentJob(legacyJob);

    expect(deployments[0].tenantId).toBe("11111111-1111-1111-1111-111111111111");
    expect(deployments[0].tenantName).toBe("Contoso Corp");
    expect(deployments[1].tenantId).toBe("22222222-2222-2222-2222-222222222222");
    expect(deployments[1].tenantName).toBe("Fabrikam Inc");
  });

  it("preserves status for each deployment", () => {
    const { deployments } = migrateDeploymentJob(legacyJob);

    expect(deployments[0].status).toBe("completed");
    expect(deployments[1].status).toBe("failed");
    expect(deployments[2].status).toBe("completed");
  });

  it("preserves error message for failed deployments", () => {
    const { deployments } = migrateDeploymentJob(legacyJob);

    expect(deployments[1].error).toBe("Connection timeout");
    expect(deployments[0].error).toBeUndefined();
  });

  it("preserves attempt numbers", () => {
    const { deployments } = migrateDeploymentJob(legacyJob);

    expect(deployments[0].attemptNumber).toBe(1);
    expect(deployments[1].attemptNumber).toBe(2);
  });

  it("creates deployment IDs with batch prefix", () => {
    const { deployments } = migrateDeploymentJob(legacyJob);

    expect(deployments[0].id).toBe("deploy-legacy-001-0");
    expect(deployments[1].id).toBe("deploy-legacy-001-1");
    expect(deployments[2].id).toBe("deploy-legacy-001-2");
  });

  it("sets batchId on all deployments", () => {
    const { deployments } = migrateDeploymentJob(legacyJob);

    for (const deployment of deployments) {
      expect(deployment.batchId).toBe("deploy-legacy-001");
    }
  });

  it("creates batch with correct aggregates", () => {
    const { batch } = migrateDeploymentJob(legacyJob);

    expect(batch.id).toBe("deploy-legacy-001");
    expect(batch.totalDeployments).toBe(3);
    expect(batch.completedDeployments).toBe(2);
    expect(batch.failedDeployments).toBe(1);
  });

  it("preserves solution info in batch", () => {
    const { batch } = migrateDeploymentJob(legacyJob);

    expect(batch.solutionName).toBe("OldAgent");
    expect(batch.solutionVersion).toBe("1.0.0");
    expect(batch.solutionPath).toBe("./solutions/OldAgent_1_0_0.zip");
  });

  it("preserves timestamps in batch", () => {
    const { batch } = migrateDeploymentJob(legacyJob);

    expect(batch.createdAt).toBe("2024-01-10T09:00:00.000Z");
    expect(batch.startedAt).toBe("2024-01-10T09:01:00.000Z");
    expect(batch.completedAt).toBe("2024-01-10T09:30:00.000Z");
  });

  it("preserves triggeredBy metadata", () => {
    const { batch, deployments } = migrateDeploymentJob(legacyJob);

    expect(batch.triggeredBy).toBe("manual");
    expect(deployments[0].triggeredBy).toBe("manual");
  });

  it("handles job with wave information", () => {
    const jobWithWaves = {
      ...legacyJob,
      currentWave: 2,
      totalWaves: 3,
      tenantResults: legacyJob.tenantResults.map((r, i) => ({
        ...r,
        waveNumber: i + 1,
      })),
    };

    const { batch, deployments } = migrateDeploymentJob(jobWithWaves);

    expect(batch.currentWave).toBe(2);
    expect(batch.totalWaves).toBe(3);
    expect(deployments[0].waveNumber).toBe(1);
    expect(deployments[1].waveNumber).toBe(2);
  });

  it("handles job with approvals", () => {
    const jobWithApprovals = {
      ...legacyJob,
      approvals: [
        {
          approver: "admin@company.com",
          approved: true,
          timestamp: "2024-01-10T08:55:00.000Z",
          comment: "LGTM",
        },
      ],
    };

    const { batch } = migrateDeploymentJob(jobWithApprovals);

    expect(batch.approvals).toHaveLength(1);
    expect(batch.approvals![0].approver).toBe("admin@company.com");
  });

  it("validates migrated deployments against schema", () => {
    const { deployments } = migrateDeploymentJob(legacyJob);

    for (const deployment of deployments) {
      const result = DeploymentSchema.safeParse(deployment);
      expect(result.success).toBe(true);
    }
  });

  it("validates migrated batch against schema", () => {
    const { batch } = migrateDeploymentJob(legacyJob);
    const result = DeploymentBatchSchema.safeParse(batch);
    expect(result.success).toBe(true);
  });
});

describe("DeploymentJob Schema (legacy)", () => {
  it("validates legacy deployment job", () => {
    const legacyJob = {
      id: "legacy-001",
      solutionPath: "./solutions/Test.zip",
      solutionName: "TestAgent",
      status: "completed",
      createdAt: "2024-01-15T10:00:00.000Z",
      updatedAt: "2024-01-15T10:30:00.000Z",
      tenantResults: [
        {
          tenantId: "11111111-1111-1111-1111-111111111111",
          tenantName: "Test Tenant",
          status: "completed",
        },
      ],
      totalTenants: 1,
      completedTenants: 1,
      failedTenants: 0,
    };

    const result = DeploymentJobSchema.safeParse(legacyJob);
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Status Categories and calculateDeploymentStatus Tests
// ============================================================================

describe("DEPLOYMENT_STATUS_CATEGORIES", () => {
  it("should have correct ACTIVE statuses", () => {
    expect(DEPLOYMENT_STATUS_CATEGORIES.ACTIVE).toContain("completed");
    expect(DEPLOYMENT_STATUS_CATEGORIES.ACTIVE).toContain("in_progress");
    expect(DEPLOYMENT_STATUS_CATEGORIES.ACTIVE).toHaveLength(2);
  });

  it("should have correct PENDING_ACTION statuses", () => {
    expect(DEPLOYMENT_STATUS_CATEGORIES.PENDING_ACTION).toContain("pending");
    expect(DEPLOYMENT_STATUS_CATEGORIES.PENDING_ACTION).toContain("scheduled");
    expect(DEPLOYMENT_STATUS_CATEGORIES.PENDING_ACTION).toContain("awaiting_approval");
    expect(DEPLOYMENT_STATUS_CATEGORIES.PENDING_ACTION).toContain("approved");
    expect(DEPLOYMENT_STATUS_CATEGORIES.PENDING_ACTION).toHaveLength(4);
  });

  it("should have correct FAILED statuses", () => {
    expect(DEPLOYMENT_STATUS_CATEGORIES.FAILED).toContain("failed");
    expect(DEPLOYMENT_STATUS_CATEGORIES.FAILED).toContain("rejected");
    expect(DEPLOYMENT_STATUS_CATEGORIES.FAILED).toContain("cancelled");
    expect(DEPLOYMENT_STATUS_CATEGORIES.FAILED).toContain("rolled_back");
    expect(DEPLOYMENT_STATUS_CATEGORIES.FAILED).toContain("rolling_back");
    expect(DEPLOYMENT_STATUS_CATEGORIES.FAILED).toHaveLength(5);
  });

  it("should have correct TERMINAL statuses", () => {
    expect(DEPLOYMENT_STATUS_CATEGORIES.TERMINAL).toContain("completed");
    expect(DEPLOYMENT_STATUS_CATEGORIES.TERMINAL).toContain("failed");
    expect(DEPLOYMENT_STATUS_CATEGORIES.TERMINAL).toContain("rolled_back");
    expect(DEPLOYMENT_STATUS_CATEGORIES.TERMINAL).toContain("cancelled");
    expect(DEPLOYMENT_STATUS_CATEGORIES.TERMINAL).toContain("rejected");
    expect(DEPLOYMENT_STATUS_CATEGORIES.TERMINAL).toHaveLength(5);
  });

  it("should have correct RETRYABLE statuses", () => {
    expect(DEPLOYMENT_STATUS_CATEGORIES.RETRYABLE).toContain("failed");
    expect(DEPLOYMENT_STATUS_CATEGORIES.RETRYABLE).toContain("cancelled");
    expect(DEPLOYMENT_STATUS_CATEGORIES.RETRYABLE).toContain("rolled_back");
    expect(DEPLOYMENT_STATUS_CATEGORIES.RETRYABLE).toHaveLength(3);
  });

  it("should have no overlap between ACTIVE and FAILED", () => {
    const active = new Set(DEPLOYMENT_STATUS_CATEGORIES.ACTIVE);
    const failed = new Set(DEPLOYMENT_STATUS_CATEGORIES.FAILED);
    const overlap = [...active].filter((s) => failed.has(s));
    expect(overlap).toHaveLength(0);
  });

  it("should have no overlap between PENDING_ACTION and TERMINAL", () => {
    const pending = new Set(DEPLOYMENT_STATUS_CATEGORIES.PENDING_ACTION);
    const terminal = new Set(DEPLOYMENT_STATUS_CATEGORIES.TERMINAL);
    const overlap = [...pending].filter((s) => terminal.has(s));
    expect(overlap).toHaveLength(0);
  });
});

describe("calculateDeploymentStatus", () => {
  const makeResult = (status: DeploymentStatus) => ({ status });

  it("should return pending for empty array", () => {
    expect(calculateDeploymentStatus([])).toBe("pending");
  });

  it("should return in_progress if any tenant is in_progress", () => {
    const results = [makeResult("completed"), makeResult("in_progress"), makeResult("pending")];
    expect(calculateDeploymentStatus(results)).toBe("in_progress");
  });

  it("should return rolling_back if any tenant is rolling_back", () => {
    const results = [makeResult("completed"), makeResult("rolling_back"), makeResult("failed")];
    expect(calculateDeploymentStatus(results)).toBe("rolling_back");
  });

  it("should prioritize in_progress over rolling_back", () => {
    const results = [makeResult("in_progress"), makeResult("rolling_back")];
    expect(calculateDeploymentStatus(results)).toBe("in_progress");
  });

  it("should return failed if any tenant has failed status", () => {
    const results = [makeResult("completed"), makeResult("failed"), makeResult("completed")];
    expect(calculateDeploymentStatus(results)).toBe("failed");
  });

  it("should return failed if any tenant has cancelled status", () => {
    const results = [makeResult("completed"), makeResult("cancelled"), makeResult("completed")];
    expect(calculateDeploymentStatus(results)).toBe("failed");
  });

  it("should return failed if all are rolled_back (rolled_back is a retryable/failed state)", () => {
    // rolled_back is in RETRYABLE category, so overall status is 'failed' (can be retried)
    const results = [makeResult("rolled_back"), makeResult("rolled_back")];
    expect(calculateDeploymentStatus(results)).toBe("failed");
  });

  it("should return completed if all tenants are completed", () => {
    const results = [makeResult("completed"), makeResult("completed"), makeResult("completed")];
    expect(calculateDeploymentStatus(results)).toBe("completed");
  });

  it("should return approved if highest status is approved", () => {
    const results = [makeResult("approved"), makeResult("pending")];
    expect(calculateDeploymentStatus(results)).toBe("approved");
  });

  it("should return awaiting_approval if highest status is awaiting_approval", () => {
    const results = [makeResult("awaiting_approval"), makeResult("pending")];
    expect(calculateDeploymentStatus(results)).toBe("awaiting_approval");
  });

  it("should return scheduled if highest status is scheduled", () => {
    const results = [makeResult("scheduled"), makeResult("pending")];
    expect(calculateDeploymentStatus(results)).toBe("scheduled");
  });

  it("should return pending if all tenants are pending", () => {
    const results = [makeResult("pending"), makeResult("pending")];
    expect(calculateDeploymentStatus(results)).toBe("pending");
  });

  it("should handle single tenant results", () => {
    expect(calculateDeploymentStatus([makeResult("completed")])).toBe("completed");
    expect(calculateDeploymentStatus([makeResult("failed")])).toBe("failed");
    expect(calculateDeploymentStatus([makeResult("in_progress")])).toBe("in_progress");
    expect(calculateDeploymentStatus([makeResult("pending")])).toBe("pending");
  });

  it("should handle complex mixed scenarios", () => {
    // Scenario: Most completed, one failed
    const scenario1 = [
      makeResult("completed"),
      makeResult("completed"),
      makeResult("completed"),
      makeResult("failed"),
      makeResult("completed"),
    ];
    expect(calculateDeploymentStatus(scenario1)).toBe("failed");

    // Scenario: Mix of pending and completed (no active processing)
    const scenario2 = [makeResult("pending"), makeResult("completed")];
    expect(calculateDeploymentStatus(scenario2)).toBe("completed");
  });
});

// ============================================================================
// Metadata Validation Tests
// ============================================================================

describe("Metadata field validation", () => {
  describe("TenantConfigSchema metadata", () => {
    const baseTenant = {
      name: "Test Tenant",
      tenantId: "00000000-0000-0000-0000-000000000001",
      environmentUrl: "https://test.crm.dynamics.com",
    };

    it("should accept metadata with string values", () => {
      const result = TenantConfigSchema.safeParse({
        ...baseTenant,
        metadata: { region: "us-east", tier: "enterprise" },
      });
      expect(result.success).toBe(true);
    });

    it("should accept metadata with number values", () => {
      const result = TenantConfigSchema.safeParse({
        ...baseTenant,
        metadata: { priority: 1, maxUsers: 500 },
      });
      expect(result.success).toBe(true);
    });

    it("should accept metadata with boolean values", () => {
      const result = TenantConfigSchema.safeParse({
        ...baseTenant,
        metadata: { isProduction: true, hasSLA: false },
      });
      expect(result.success).toBe(true);
    });

    it("should accept metadata with mixed primitive values", () => {
      const result = TenantConfigSchema.safeParse({
        ...baseTenant,
        metadata: { region: "us-east", priority: 1, isProduction: true },
      });
      expect(result.success).toBe(true);
    });

    it("should reject metadata with object values", () => {
      const result = TenantConfigSchema.safeParse({
        ...baseTenant,
        metadata: { nested: { key: "value" } },
      });
      expect(result.success).toBe(false);
    });

    it("should reject metadata with array values", () => {
      const result = TenantConfigSchema.safeParse({
        ...baseTenant,
        metadata: { tags: ["a", "b"] },
      });
      expect(result.success).toBe(false);
    });

    it("should reject metadata with null values", () => {
      const result = TenantConfigSchema.safeParse({
        ...baseTenant,
        metadata: { key: null },
      });
      expect(result.success).toBe(false);
    });
  });

  describe("DeploymentSnapshotSchema metadata", () => {
    const baseSnapshot = {
      id: "snap-1",
      deploymentId: "deploy-1",
      tenantId: "00000000-0000-0000-0000-000000000001",
      tenantName: "Test Tenant",
      solutionName: "TestAgent",
      previousVersion: "1.0.0",
      createdAt: "2024-01-15T10:00:00.000Z",
    };

    it("should accept metadata with constrained types", () => {
      const result = DeploymentSnapshotSchema.safeParse({
        ...baseSnapshot,
        metadata: { reason: "rollback", version: 2, automatic: true },
      });
      expect(result.success).toBe(true);
    });

    it("should reject metadata with object values", () => {
      const result = DeploymentSnapshotSchema.safeParse({
        ...baseSnapshot,
        metadata: { nested: { key: "value" } },
      });
      expect(result.success).toBe(false);
    });
  });

  describe("WebhookEventSchema metadata", () => {
    const baseEvent = {
      event: "deployment.completed",
      timestamp: "2024-01-15T10:00:00.000Z",
      deploymentId: "deploy-1",
      solutionName: "TestAgent",
      status: "completed" as const,
    };

    it("should accept metadata with constrained types", () => {
      const result = WebhookEventSchema.safeParse({
        ...baseEvent,
        metadata: { source: "cli", attempt: 1, dryRun: false },
      });
      expect(result.success).toBe(true);
    });

    it("should reject metadata with object values", () => {
      const result = WebhookEventSchema.safeParse({
        ...baseEvent,
        metadata: { payload: { data: "test" } },
      });
      expect(result.success).toBe(false);
    });
  });
});

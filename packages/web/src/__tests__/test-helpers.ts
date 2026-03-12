/**
 * Test helpers and utilities
 * Provides reusable functions for setting up test environments
 */

import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { unlinkSync, existsSync } from "fs";
import { runMigrations } from "@/lib/migrations/runner";

/**
 * Create a fresh test database with schema
 */
export function createTestDatabase(): Database.Database {
  const testDbPath = `./test-${randomUUID()}.db`;

  // Create database
  const db = new Database(testDbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Run migrations to create schema
  runMigrations(db);

  // Store path for cleanup
  (db as any).__testDbPath = testDbPath;

  return db;
}

/**
 * Clean up test database
 */
export function cleanupTestDatabase(db: Database.Database): void {
  const dbPath = (db as any).__testDbPath;

  db.close();

  if (dbPath && existsSync(dbPath)) {
    unlinkSync(dbPath);
  }

  // Clean up WAL and SHM files
  if (existsSync(`${dbPath}-wal`)) {
    unlinkSync(`${dbPath}-wal`);
  }
  if (existsSync(`${dbPath}-shm`)) {
    unlinkSync(`${dbPath}-shm`);
  }
}

/**
 * Test data factories
 */

export function createTestDeploymentBatch(
  overrides?: Partial<{
    id: string;
    solutionName: string;
    status: string;
    totalDeployments: number;
    completedDeployments: number;
    failedDeployments: number;
    triggeredBy: string;
    createdAt: string;
    updatedAt: string;
  }>
) {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    solutionName: "TestAgent",
    solutionVersion: "1.0.0",
    solutionPath: "/test/solution.zip",
    status: "pending",
    totalDeployments: 1,
    completedDeployments: 0,
    failedDeployments: 0,
    triggeredBy: "test-user",
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    currentWave: 1,
    totalWaves: 1,
    ...overrides,
  };
}

export function createTestDeployment(
  overrides?: Partial<{
    id: string;
    batchId: string;
    tenantId: string;
    tenantName: string;
    status: string;
    error: string | null;
  }>
) {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    batchId: randomUUID(),
    solutionName: "TestAgent",
    solutionVersion: "1.0.0",
    solutionPath: "/test/solution.zip",
    tenantId: randomUUID(),
    tenantName: "Test Tenant",
    environmentUrl: "https://test.crm.dynamics.com",
    status: "pending",
    error: null,
    attemptNumber: 1,
    waveNumber: 1,
    previousVersion: null,
    rollbackAvailable: 0,
    solutionImportJobId: null,
    urlOverride: null,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    ...overrides,
  };
}

export function createTestApproval(
  overrides?: Partial<{
    id: string;
    deploymentId: string;
    status: string;
    requiredApprovals: number;
    createdAt: string;
    expiresAt: string;
  }>
) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now

  return {
    id: randomUUID(),
    deploymentId: randomUUID(),
    status: "pending",
    requiredApprovals: 1,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    ...overrides,
  };
}

export function createTestApprovalVote(
  overrides?: Partial<{
    approvalId: string;
    approver: string;
    action: string;
    reason: string | null;
  }>
) {
  return {
    approvalId: randomUUID(),
    approver: "test-user@example.com",
    action: "approve",
    reason: null,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

export function createTestAuditLog(
  overrides?: Partial<{
    timestamp: string;
    action: string;
    userId: string | null;
    userEmail: string | null;
    resourceType: string;
    resourceId: string | null;
    success: number;
  }>
) {
  return {
    timestamp: new Date().toISOString(),
    action: "test.action",
    userId: "test-user-id",
    userEmail: "test@example.com",
    resourceType: "test",
    resourceId: randomUUID(),
    resourceName: "Test Resource",
    details: "{}",
    success: 1,
    errorMessage: null,
    ...overrides,
  };
}

export function createTestHealthCheckResult(
  overrides?: Partial<{
    tenantId: string;
    tenantName: string;
    healthy: number;
    checks: string;
  }>
) {
  return {
    tenantId: randomUUID(),
    tenantName: "Test Tenant",
    healthy: 1,
    checks: JSON.stringify([{ name: "api", passed: true }]),
    totalDurationMs: 100,
    checkedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createTestWebhook(
  overrides?: Partial<{
    id: string;
    name: string;
    secret: string;
    enabled: number;
  }>
) {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    name: "Test Webhook",
    secret: randomUUID(),
    enabled: 1,
    createdAt: now,
    createdBy: "test-user@example.com",
    updatedAt: now,
    lastUsedAt: null,
    ...overrides,
  };
}

/**
 * Insert test data into database
 */

export function insertDeploymentBatch(
  db: Database.Database,
  batch: ReturnType<typeof createTestDeploymentBatch>
) {
  db.prepare(
    `
    INSERT INTO deployment_batches (
      id, solution_name, solution_version, solution_path, status,
      total_deployments, completed_deployments, failed_deployments,
      triggered_by, created_at, updated_at, started_at, completed_at,
      current_wave, total_waves
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    batch.id,
    batch.solutionName,
    batch.solutionVersion,
    batch.solutionPath,
    batch.status,
    batch.totalDeployments,
    batch.completedDeployments,
    batch.failedDeployments,
    batch.triggeredBy,
    batch.createdAt,
    batch.updatedAt,
    batch.startedAt,
    batch.completedAt,
    batch.currentWave,
    batch.totalWaves
  );

  return batch;
}

export function insertDeployment(
  db: Database.Database,
  deployment: ReturnType<typeof createTestDeployment>
) {
  db.prepare(
    `
    INSERT INTO deployments (
      id, batch_id, solution_name, solution_version, solution_path,
      tenant_id, tenant_name, environment_url, status, error,
      attempt_number, wave_number, previous_version, rollback_available,
      solution_import_job_id, url_override, created_at, updated_at,
      started_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    deployment.id,
    deployment.batchId,
    deployment.solutionName,
    deployment.solutionVersion,
    deployment.solutionPath,
    deployment.tenantId,
    deployment.tenantName,
    deployment.environmentUrl,
    deployment.status,
    deployment.error,
    deployment.attemptNumber,
    deployment.waveNumber,
    deployment.previousVersion,
    deployment.rollbackAvailable,
    deployment.solutionImportJobId,
    deployment.urlOverride,
    deployment.createdAt,
    deployment.updatedAt,
    deployment.startedAt,
    deployment.completedAt
  );

  return deployment;
}

export function insertApproval(
  db: Database.Database,
  approval: ReturnType<typeof createTestApproval>
) {
  db.prepare(
    `
    INSERT INTO approvals (
      id, deployment_id, status, required_approvals, created_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `
  ).run(
    approval.id,
    approval.deploymentId,
    approval.status,
    approval.requiredApprovals,
    approval.createdAt,
    approval.expiresAt
  );

  return approval;
}

export function insertApprovalVote(
  db: Database.Database,
  vote: ReturnType<typeof createTestApprovalVote>
) {
  db.prepare(
    `
    INSERT INTO approval_votes (
      approval_id, approver, action, reason, timestamp
    ) VALUES (?, ?, ?, ?, ?)
  `
  ).run(vote.approvalId, vote.approver, vote.action, vote.reason, vote.timestamp);

  return vote;
}

export function insertAuditLog(db: Database.Database, log: ReturnType<typeof createTestAuditLog>) {
  db.prepare(
    `
    INSERT INTO audit_logs (
      timestamp, action, user_id, user_email, resource_type, resource_id,
      resource_name, details, success, error_message
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    log.timestamp,
    log.action,
    log.userId,
    log.userEmail,
    log.resourceType,
    log.resourceId,
    log.resourceName,
    log.details,
    log.success,
    log.errorMessage
  );

  return log;
}

/**
 * Mock session for testing
 */
export function createMockSession(
  overrides?: Partial<{
    userId: string;
    userEmail: string;
    role: string;
  }>
) {
  return {
    user: {
      id: "test-user-id",
      email: "test@example.com",
      name: "Test User",
      role: "admin",
      ...overrides,
    },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

/**
 * Wait for async operations
 */
export function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function until it succeeds or times out
 */
export async function retry<T>(
  fn: () => T | Promise<T>,
  options: {
    retries?: number;
    delay?: number;
    timeout?: number;
  } = {}
): Promise<T> {
  const { retries = 3, delay = 100, timeout = 5000 } = options;

  const startTime = Date.now();
  let lastError: Error | undefined;

  for (let i = 0; i < retries; i++) {
    if (Date.now() - startTime > timeout) {
      throw new Error(`Retry timeout after ${timeout}ms`);
    }

    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < retries - 1) {
        await waitFor(delay);
      }
    }
  }

  throw lastError || new Error("Retry failed");
}

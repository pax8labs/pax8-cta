/**
 * Copyright 2024 Pax8 Labs
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { z } from "zod";

// ============================================================================
// Connection Reference Mapping
// ============================================================================

export const ConnectionReferenceSchema = z.object({
  logicalName: z.string().min(1),
  connectionId: z.string().min(1),
  description: z.string().optional(),
});

export const ConnectionMappingSchema = z.object({
  sourceLogicalName: z.string().min(1),
  targetConnectionId: z.string().min(1),
  description: z.string().optional(),
});

// ============================================================================
// Environment Variables
// ============================================================================

export const EnvironmentVariableSchema = z.object({
  schemaName: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean()]),
  type: z.enum(["String", "Number", "Boolean", "JSON", "Secret"]).optional().default("String"),
});

// ============================================================================
// Deployment Waves
// ============================================================================

export const DeploymentWaveSchema = z.object({
  name: z.string().min(1),
  order: z.number().int().positive(),
  tenants: z.array(z.string()),
  waitAfterCompletion: z.string().optional(), // e.g., "5m", "1h"
  continueOnFailure: z.boolean().optional().default(false),
  maxParallel: z.number().int().positive().optional(),
});

// ============================================================================
// Health Checks
// ============================================================================

export const HealthCheckSchema = z.object({
  enabled: z.boolean().optional().default(true),
  endpoint: z.string().url().optional(),
  expectedStatus: z.number().int().optional().default(200),
  timeout: z.string().optional().default("30s"),
  retries: z.number().int().nonnegative().optional().default(3),
});

// ============================================================================
// Rollback Settings
// ============================================================================

export const RollbackSettingsSchema = z.object({
  enabled: z.boolean().optional().default(true),
  keepVersions: z.number().int().positive().optional().default(3),
  autoRollbackOnFailure: z.boolean().optional().default(false),
  rollbackTimeout: z.string().optional().default("10m"),
});

// ============================================================================
// Webhook Notifications
// ============================================================================

export const WebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(
    z.enum([
      "deployment.started",
      "deployment.completed",
      "deployment.failed",
      "wave.started",
      "wave.completed",
      "tenant.started",
      "tenant.completed",
      "tenant.failed",
      "rollback.started",
      "rollback.completed",
    ])
  ),
  headers: z.record(z.string()).optional(),
  secret: z.string().optional(),
  retries: z.number().int().nonnegative().optional().default(3),
});

// ============================================================================
// Scheduled Deployments
// ============================================================================

export const ScheduleSchema = z.object({
  cron: z.string().optional(),
  timezone: z.string().optional().default("UTC"),
  maintenanceWindow: z
    .object({
      start: z.string(), // e.g., "02:00"
      end: z.string(), // e.g., "06:00"
      daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(), // 0 = Sunday
    })
    .optional(),
});

// ============================================================================
// Approval Workflow
// ============================================================================

export const ApprovalWorkflowSchema = z.object({
  required: z.boolean().optional().default(false),
  approvers: z.array(z.string().email()).optional(),
  minApprovals: z.number().int().positive().optional().default(1),
  timeout: z.string().optional().default("24h"),
  autoApproveForTags: z.array(z.string()).optional(),
});

// ============================================================================
// Partner Tenant Configuration
// ============================================================================

export const PartnerConfigSchema = z.object({
  tenantId: z.string().uuid(),
  clientId: z.string().uuid(),
  // clientSecret should come from environment variable
});

// ============================================================================
// Source Environment Configuration
// ============================================================================

export const SourceConfigSchema = z.object({
  tenantId: z.string().uuid(),
  environmentUrl: z.string().url(),
  connectionReferences: z.array(ConnectionReferenceSchema).optional(),
});

// ============================================================================
// Customer Tenant Configuration (Enhanced)
// ============================================================================

export const TenantConfigSchema = z.object({
  // Basic info
  name: z.string().min(1),
  tenantId: z.string().uuid(),
  environmentUrl: z.string().url(),
  environmentId: z.string().optional(), // Power Platform environment ID for app user setup
  tags: z.array(z.string()).optional().default([]),
  enabled: z.boolean().optional().default(true),

  // Connection Reference Mappings
  connectionMappings: z.array(ConnectionMappingSchema).optional(),

  // Environment Variables
  environmentVariables: z.array(EnvironmentVariableSchema).optional(),

  // Health Check
  healthCheck: HealthCheckSchema.optional(),

  // Tenant-specific rollback settings
  rollback: RollbackSettingsSchema.optional(),

  // Tenant-specific schedule overrides
  schedule: ScheduleSchema.optional(),

  // Auto-setup application user (default: true, can be set to false to disable)
  autoSetup: z.boolean().default(true),

  // Metadata
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

// ============================================================================
// Global Settings
// ============================================================================

export const GlobalSettingsSchema = z.object({
  // Default connection mappings (can be overridden per tenant)
  defaultConnectionMappings: z.array(ConnectionMappingSchema).optional(),

  // Default environment variables (can be overridden per tenant)
  defaultEnvironmentVariables: z.array(EnvironmentVariableSchema).optional(),

  // Deployment waves
  waves: z.array(DeploymentWaveSchema).optional(),

  // Global rollback settings
  rollback: RollbackSettingsSchema.optional(),

  // Global health check settings
  healthCheck: HealthCheckSchema.optional(),

  // Webhook notifications
  webhooks: z.array(WebhookSchema).optional(),

  // Global schedule
  schedule: ScheduleSchema.optional(),

  // Approval workflow
  approval: ApprovalWorkflowSchema.optional(),

  // Auto-setup application users (default: true, can be overridden per tenant)
  autoSetup: z.boolean().optional(),

  // Rate limiting
  rateLimit: z
    .object({
      maxConcurrent: z.number().int().positive().optional().default(5),
      delayBetweenTenants: z.string().optional().default("1s"),
      maxRequestsPerMinute: z.number().int().positive().optional().default(60),
    })
    .optional(),

  // Retry settings
  retry: z
    .object({
      maxAttempts: z.number().int().positive().optional().default(3),
      initialDelay: z.string().optional().default("5s"),
      maxDelay: z.string().optional().default("5m"),
      backoffMultiplier: z.number().positive().optional().default(2),
    })
    .optional(),

  // Logging
  logging: z
    .object({
      level: z.enum(["debug", "info", "warn", "error"]).optional().default("info"),
      includeTimestamps: z.boolean().optional().default(true),
      format: z.enum(["json", "text"]).optional().default("text"),
    })
    .optional(),
});

// ============================================================================
// Full Configuration Schema
// ============================================================================

export const ConfigSchema = z.object({
  version: z.string().optional().default("2.0"),
  partner: PartnerConfigSchema,
  source: SourceConfigSchema,
  tenants: z.array(TenantConfigSchema),
  settings: GlobalSettingsSchema.optional(),
  webhooks: z.array(WebhookSchema).optional(),
});

// ============================================================================
// Type Exports
// ============================================================================

export type ConnectionReference = z.infer<typeof ConnectionReferenceSchema>;
export type ConnectionMapping = z.infer<typeof ConnectionMappingSchema>;
export type EnvironmentVariable = z.infer<typeof EnvironmentVariableSchema>;
export type DeploymentWave = z.infer<typeof DeploymentWaveSchema>;
export type HealthCheck = z.infer<typeof HealthCheckSchema>;
export type RollbackSettings = z.infer<typeof RollbackSettingsSchema>;
export type Webhook = z.infer<typeof WebhookSchema>;
export type Schedule = z.infer<typeof ScheduleSchema>;
export type ApprovalWorkflow = z.infer<typeof ApprovalWorkflowSchema>;
export type GlobalSettings = z.infer<typeof GlobalSettingsSchema>;
export type PartnerConfig = z.infer<typeof PartnerConfigSchema>;
export type SourceConfig = z.infer<typeof SourceConfigSchema>;
export type TenantConfig = z.infer<typeof TenantConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;

// ============================================================================
// Deployment Status & Results
// ============================================================================

export const DeploymentStatusSchema = z.enum([
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
]);

export type DeploymentStatus = z.infer<typeof DeploymentStatusSchema>;

// ============================================================================
// Centralized Status Categories
// These should be used throughout the app for consistent status filtering
// ============================================================================

/**
 * Status categories for filtering and display
 * - ACTIVE: Deployments that are actively running or successfully completed
 * - PENDING_ACTION: Deployments waiting for something (approval, schedule, etc.)
 * - FAILED: Deployments that encountered an error or were stopped
 * - TERMINAL: Deployments that have reached a final state (no more processing)
 * - RETRYABLE: Failed deployments that can be retried
 */
export const DEPLOYMENT_STATUS_CATEGORIES = {
  /** Running or successfully completed */
  ACTIVE: ["completed", "in_progress"] as const,
  /** Waiting for approval, schedule, or processing */
  PENDING_ACTION: ["pending", "scheduled", "awaiting_approval", "approved"] as const,
  /** Error states or stopped deployments */
  FAILED: ["failed", "rejected", "cancelled", "rolled_back", "rolling_back"] as const,
  /** Final states - no more processing will occur */
  TERMINAL: ["completed", "failed", "rolled_back", "cancelled", "rejected"] as const,
  /** Can be retried (including rolled_back - user may want to redeploy) */
  RETRYABLE: ["failed", "cancelled", "rolled_back"] as const,
} as const;

// Helper type for status category arrays
export type StatusCategory = keyof typeof DEPLOYMENT_STATUS_CATEGORIES;

/**
 * Calculate the overall deployment status from tenant results
 * Uses priority-based logic: in_progress > rolling_back > failed > rolled_back > completed > pending
 */
export function calculateDeploymentStatus(
  tenantResults: Array<{ status: DeploymentStatus }>
): DeploymentStatus {
  if (tenantResults.length === 0) return "pending";

  const statuses = new Set(tenantResults.map((t) => t.status));

  // Check in priority order
  if (statuses.has("in_progress")) return "in_progress";
  if (statuses.has("rolling_back")) return "rolling_back";

  // Any failure means overall failed
  const hasFailures = tenantResults.some((t) =>
    DEPLOYMENT_STATUS_CATEGORIES.RETRYABLE.includes(
      t.status as (typeof DEPLOYMENT_STATUS_CATEGORIES.RETRYABLE)[number]
    )
  );
  if (hasFailures) return "failed";

  if (statuses.has("rolled_back")) return "rolled_back";
  if (statuses.has("completed")) return "completed";
  if (statuses.has("approved")) return "approved";
  if (statuses.has("awaiting_approval")) return "awaiting_approval";
  if (statuses.has("scheduled")) return "scheduled";

  return "pending";
}

export const TenantDeploymentResultSchema = z.object({
  tenantId: z.string().uuid(),
  tenantName: z.string(),
  status: DeploymentStatusSchema,
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  error: z.string().optional(),
  solutionImportJobId: z.string().optional(),
  previousVersion: z.string().optional(),
  rollbackAvailable: z.boolean().optional(),
  waveNumber: z.number().int().positive().optional(),
  attemptNumber: z.number().int().positive().optional().default(1),
});

export type TenantDeploymentResult = z.infer<typeof TenantDeploymentResultSchema>;

export const DeploymentTriggerSchema = z.enum(["manual", "scheduled", "webhook", "api", "cli"]);

export type DeploymentTrigger = z.infer<typeof DeploymentTriggerSchema>;

export const DeploymentJobSchema = z.object({
  id: z.string(),
  solutionPath: z.string(),
  solutionName: z.string(),
  solutionVersion: z.string().optional(),
  status: DeploymentStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  scheduledAt: z.string().datetime().optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  tenantResults: z.array(TenantDeploymentResultSchema),
  totalTenants: z.number().int().positive(),
  completedTenants: z.number().int().nonnegative(),
  failedTenants: z.number().int().nonnegative(),
  currentWave: z.number().int().positive().optional(),
  totalWaves: z.number().int().positive().optional(),
  approvals: z
    .array(
      z.object({
        approver: z.string().email(),
        approved: z.boolean(),
        timestamp: z.string().datetime(),
        comment: z.string().optional(),
      })
    )
    .optional(),
  rollbackFromDeploymentId: z.string().optional(),
  canRollback: z.boolean().optional(),
  // New fields for enhanced visibility
  triggeredBy: DeploymentTriggerSchema.optional(),
  durationMs: z.number().int().nonnegative().optional(),
});

export type DeploymentJob = z.infer<typeof DeploymentJobSchema>;

// ============================================================================
// NEW Atomic Deployment Model (v2)
// ============================================================================
// A Deployment represents a single agent deployed to a single tenant.
// A DeploymentBatch groups multiple deployments that were initiated together.

export const DeploymentSchema = z.object({
  /** Unique identifier for this deployment */
  id: z.string(),
  /** Reference to the batch this deployment belongs to (if any) */
  batchId: z.string().optional(),

  // Agent/Solution info
  solutionName: z.string(),
  solutionVersion: z.string().optional(),
  solutionPath: z.string().optional(),

  // Tenant info
  tenantId: z.string().uuid(),
  tenantName: z.string(),
  environmentUrl: z.string().url().optional(),

  // Status
  status: DeploymentStatusSchema,
  error: z.string().optional(),

  // Timestamps
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),

  // Attempt tracking (for retries)
  attemptNumber: z.number().int().positive().default(1),

  // Metadata
  triggeredBy: DeploymentTriggerSchema.optional(),
  previousVersion: z.string().optional(),
  rollbackAvailable: z.boolean().optional(),
  solutionImportJobId: z.string().optional(),
  waveNumber: z.number().int().positive().optional(),

  // URL override for tenant-specific URL templating
  urlOverride: z
    .object({
      tenant: z.string(),
      sharepoint: z.string(),
      dynamicsCrm: z.string(),
      onmicrosoft: z.string(),
    })
    .optional(),
});

export type Deployment = z.infer<typeof DeploymentSchema>;

export const DeploymentBatchSchema = z.object({
  /** Unique identifier for this batch */
  id: z.string(),

  // Solution being deployed
  solutionName: z.string(),
  solutionVersion: z.string().optional(),
  solutionPath: z.string(),

  // Aggregated status
  status: DeploymentStatusSchema,

  // Counts (derived from deployments, but cached for performance)
  totalDeployments: z.number().int().nonnegative(),
  completedDeployments: z.number().int().nonnegative(),
  failedDeployments: z.number().int().nonnegative(),

  // Timestamps
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),

  // Wave tracking
  currentWave: z.number().int().positive().optional(),
  totalWaves: z.number().int().positive().optional(),

  // Approvals
  approvals: z
    .array(
      z.object({
        approver: z.string().email(),
        approved: z.boolean(),
        timestamp: z.string().datetime(),
        comment: z.string().optional(),
      })
    )
    .optional(),

  // Metadata
  triggeredBy: DeploymentTriggerSchema.optional(),
});

export type DeploymentBatch = z.infer<typeof DeploymentBatchSchema>;

// Helper to convert old DeploymentJob to new Deployment[] + DeploymentBatch
export function migrateDeploymentJob(job: DeploymentJob): {
  batch: DeploymentBatch;
  deployments: Deployment[];
} {
  const deployments: Deployment[] = job.tenantResults.map((result, index) => ({
    id: `${job.id}-${index}`,
    batchId: job.id,
    solutionName: job.solutionName,
    solutionVersion: job.solutionVersion,
    solutionPath: job.solutionPath,
    tenantId: result.tenantId,
    tenantName: result.tenantName,
    status: result.status,
    error: result.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    attemptNumber: result.attemptNumber || 1,
    triggeredBy: job.triggeredBy,
    previousVersion: result.previousVersion,
    rollbackAvailable: result.rollbackAvailable,
    solutionImportJobId: result.solutionImportJobId,
    waveNumber: result.waveNumber,
  }));

  const batch: DeploymentBatch = {
    id: job.id,
    solutionName: job.solutionName,
    solutionVersion: job.solutionVersion,
    solutionPath: job.solutionPath,
    status: job.status,
    totalDeployments: job.totalTenants,
    completedDeployments: job.completedTenants,
    failedDeployments: job.failedTenants,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    currentWave: job.currentWave,
    totalWaves: job.totalWaves,
    approvals: job.approvals,
    triggeredBy: job.triggeredBy,
  };

  return { batch, deployments };
}

// ============================================================================
// Solution Metadata (Enhanced)
// ============================================================================

export const SolutionMetadataSchema = z.object({
  uniqueName: z.string(),
  friendlyName: z.string(),
  version: z.string(),
  isManaged: z.boolean(),
  publisherId: z.string().uuid().optional(),
  publisherName: z.string().optional(),
  description: z.string().optional(),
  installedOn: z.string().datetime().optional(),
});

export type SolutionMetadata = z.infer<typeof SolutionMetadataSchema>;

// ============================================================================
// Snapshot for Rollback
// ============================================================================

export const DeploymentSnapshotSchema = z.object({
  id: z.string(),
  deploymentId: z.string(),
  tenantId: z.string().uuid(),
  tenantName: z.string(),
  solutionName: z.string(),
  previousVersion: z.string(),
  previousSolutionPath: z.string().optional(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

export type DeploymentSnapshot = z.infer<typeof DeploymentSnapshotSchema>;

// ============================================================================
// Webhook Event Payload
// ============================================================================

export const WebhookEventSchema = z.object({
  event: z.string(),
  timestamp: z.string().datetime(),
  deploymentId: z.string(),
  tenantId: z.string().uuid().optional(),
  tenantName: z.string().optional(),
  solutionName: z.string(),
  status: DeploymentStatusSchema,
  error: z.string().optional(),
  waveNumber: z.number().int().positive().optional(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

export type WebhookEvent = z.infer<typeof WebhookEventSchema>;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse a duration string like "5m", "1h", "30s" to milliseconds
 */
export function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)(ms|s|m|h|d)$/);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  const multipliers: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return value * multipliers[unit];
}

/**
 * Get effective connection mappings for a tenant (merges global defaults with tenant-specific)
 */
export function getEffectiveConnectionMappings(
  config: Config,
  tenant: TenantConfig
): ConnectionMapping[] {
  const globalMappings = config.settings?.defaultConnectionMappings || [];
  const tenantMappings = tenant.connectionMappings || [];

  // Tenant mappings override global ones with same sourceLogicalName
  const mappingMap = new Map<string, ConnectionMapping>();

  for (const mapping of globalMappings) {
    mappingMap.set(mapping.sourceLogicalName, mapping);
  }

  for (const mapping of tenantMappings) {
    mappingMap.set(mapping.sourceLogicalName, mapping);
  }

  return Array.from(mappingMap.values());
}

/**
 * Get effective environment variables for a tenant (merges global defaults with tenant-specific)
 */
export function getEffectiveEnvironmentVariables(
  config: Config,
  tenant: TenantConfig
): EnvironmentVariable[] {
  const globalVars = config.settings?.defaultEnvironmentVariables || [];
  const tenantVars = tenant.environmentVariables || [];

  // Tenant variables override global ones with same schemaName
  const varMap = new Map<string, EnvironmentVariable>();

  for (const v of globalVars) {
    varMap.set(v.schemaName, v);
  }

  for (const v of tenantVars) {
    varMap.set(v.schemaName, v);
  }

  return Array.from(varMap.values());
}

/**
 * Get effective rollback settings for a tenant
 */
export function getEffectiveRollbackSettings(
  config: Config,
  tenant: TenantConfig
): RollbackSettings {
  const globalSettings = config.settings?.rollback || { enabled: true, keepVersions: 3 };
  const tenantSettings = tenant.rollback || {};

  return {
    ...globalSettings,
    ...tenantSettings,
  } as RollbackSettings;
}

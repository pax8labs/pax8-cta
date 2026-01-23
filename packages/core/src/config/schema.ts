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
  events: z.array(z.enum([
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
  ])),
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
  maintenanceWindow: z.object({
    start: z.string(), // e.g., "02:00"
    end: z.string(),   // e.g., "06:00"
    daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(), // 0 = Sunday
  }).optional(),
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

  // Metadata
  metadata: z.record(z.unknown()).optional(),
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

  // Rate limiting
  rateLimit: z.object({
    maxConcurrent: z.number().int().positive().optional().default(5),
    delayBetweenTenants: z.string().optional().default("1s"),
    maxRequestsPerMinute: z.number().int().positive().optional().default(60),
  }).optional(),

  // Retry settings
  retry: z.object({
    maxAttempts: z.number().int().positive().optional().default(3),
    initialDelay: z.string().optional().default("5s"),
    maxDelay: z.string().optional().default("5m"),
    backoffMultiplier: z.number().positive().optional().default(2),
  }).optional(),

  // Logging
  logging: z.object({
    level: z.enum(["debug", "info", "warn", "error"]).optional().default("info"),
    includeTimestamps: z.boolean().optional().default(true),
    format: z.enum(["json", "text"]).optional().default("text"),
  }).optional(),
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
  approvals: z.array(z.object({
    approver: z.string().email(),
    approved: z.boolean(),
    timestamp: z.string().datetime(),
    comment: z.string().optional(),
  })).optional(),
  rollbackFromDeploymentId: z.string().optional(),
  canRollback: z.boolean().optional(),
});

export type DeploymentJob = z.infer<typeof DeploymentJobSchema>;

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
  metadata: z.record(z.unknown()).optional(),
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
  metadata: z.record(z.unknown()).optional(),
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

import { z } from 'zod';

/**
 * Zod schemas for runtime validation of all tool inputs
 */

// Deployment status enum
export const DeploymentStatusSchema = z.enum([
  'pending',
  'in_progress',
  'completed',
  'failed',
  'cancelled',
]);

// Deployment ID format
export const DeploymentIdSchema = z
  .string()
  .min(1, 'Deployment ID cannot be empty')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid deployment ID format');

// Tenant ID format
export const TenantIdSchema = z
  .string()
  .uuid('Tenant ID must be a valid UUID');

// Agent unique name format
export const AgentNameSchema = z
  .string()
  .min(1, 'Agent name cannot be empty')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid agent name format');

// List deployments parameters
export const ListDeploymentsSchema = z.object({
  status: DeploymentStatusSchema.optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

export type ListDeploymentsParams = z.infer<typeof ListDeploymentsSchema>;

// Get deployment status parameters
export const GetDeploymentStatusSchema = z.object({
  deploymentId: DeploymentIdSchema,
});

export type GetDeploymentStatusParams = z.infer<typeof GetDeploymentStatusSchema>;

// Analyze deployment risk parameters
export const AnalyzeDeploymentRiskSchema = z.object({
  agentId: AgentNameSchema,
  tenantIds: z.array(TenantIdSchema).min(1, 'At least one tenant ID is required'),
});

export type AnalyzeDeploymentRiskParams = z.infer<typeof AnalyzeDeploymentRiskSchema>;

// Create deployment parameters
export const CreateDeploymentSchema = z.object({
  solutionFile: z.string().min(1, 'Solution file path is required'),
  tenantIds: z.array(TenantIdSchema).min(1, 'At least one tenant ID is required'),
});

export type CreateDeploymentParams = z.infer<typeof CreateDeploymentSchema>;

// Monitor deployment parameters
export const MonitorDeploymentSchema = z.object({
  deploymentId: DeploymentIdSchema,
  pollIntervalMs: z.number().int().min(1000).max(60000).optional(),
});

export type MonitorDeploymentParams = z.infer<typeof MonitorDeploymentSchema>;

// Retry deployment parameters
export const RetryDeploymentSchema = z.object({
  deploymentId: DeploymentIdSchema,
});

export type RetryDeploymentParams = z.infer<typeof RetryDeploymentSchema>;

// No parameters schemas (for tools that don't take parameters)
export const NoParamsSchema = z.object({}).strict();

/**
 * Validate input against a schema
 * Throws ValidationError if invalid
 */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Validation failed: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
    }
    throw error;
  }
}

/**
 * Safely validate input, returning null if invalid
 */
export function validateSafe<T>(schema: z.ZodSchema<T>, data: unknown): T | null {
  const result = schema.safeParse(data);
  return result.success ? result.data : null;
}

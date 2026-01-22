/**
 * Client-safe exports from the config module.
 *
 * This file only exports types and constants that don't require Node.js APIs,
 * making them safe to import in client-side (browser) code.
 */

// Re-export types
export type {
  DeploymentStatus,
  TenantDeploymentResult,
  DeploymentTrigger,
  DeploymentJob,
  Deployment,
  DeploymentBatch,
  StatusCategory,
} from './schema.js'

// Re-export status constants and utilities
export {
  DEPLOYMENT_STATUS_CATEGORIES,
  calculateDeploymentStatus,
} from './schema.js'

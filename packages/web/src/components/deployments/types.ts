/**
 * Deployment-related type definitions for client-side use
 */

export type DeploymentStepId =
  | 'authenticating'
  | 'validating'
  | 'exporting'
  | 'uploading'
  | 'importing'
  | 'configuring'
  | 'verifying'
  | 'completing'

export type DeploymentStepStatus = 'pending' | 'in_progress' | 'completed' | 'failed'

export type TenantDeploymentStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'

export interface DeploymentStep {
  status: DeploymentStepStatus
  startedAt?: string
  completedAt?: string
  error?: string
}

export interface UrlOverride {
  sharepoint: string
  dynamicsCrm: string
  onmicrosoft: string
  tenant?: string
}

export interface TenantProgress {
  tenantId: string
  tenantName: string
  environmentUrl?: string
  urlOverride?: UrlOverride
  status: TenantDeploymentStatus
  currentStep: DeploymentStepId | null
  steps: Record<DeploymentStepId, DeploymentStep>
  error?: string
  startedAt?: string
  completedAt?: string
}

export const DEPLOYMENT_STEPS: Record<DeploymentStepId, { label: string; description: string }> = {
  authenticating: {
    label: 'Authenticating',
    description: 'Connecting to tenant with GDAP credentials',
  },
  validating: {
    label: 'Validating',
    description: 'Checking environment compatibility and permissions',
  },
  exporting: {
    label: 'Exporting',
    description: 'Exporting solution from source environment',
  },
  uploading: {
    label: 'Uploading',
    description: 'Transferring solution package to target',
  },
  importing: {
    label: 'Importing',
    description: 'Installing solution in target environment',
  },
  configuring: {
    label: 'Configuring',
    description: 'Setting up connection references and variables',
  },
  verifying: {
    label: 'Verifying',
    description: 'Confirming deployment was successful',
  },
  completing: {
    label: 'Completing',
    description: 'Finalizing deployment and cleaning up',
  },
}

export const STEP_ORDER: DeploymentStepId[] = [
  'authenticating',
  'validating',
  'exporting',
  'uploading',
  'importing',
  'configuring',
  'verifying',
  'completing',
]

export const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-800',
  scheduled: 'bg-blue-100 text-blue-800',
  awaiting_approval: 'bg-purple-100 text-purple-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-600',
  rolling_back: 'bg-orange-100 text-orange-800',
  rolled_back: 'bg-blue-100 text-blue-800',
}

export const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  scheduled: 'Scheduled',
  awaiting_approval: 'Awaiting Approval',
  approved: 'Approved',
  rejected: 'Rejected',
  in_progress: 'In Progress',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
  rolling_back: 'Rolling Back',
  rolled_back: 'Rolled Back',
}

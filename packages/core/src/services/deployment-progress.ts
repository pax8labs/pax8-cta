/**
 * Real-time deployment progress tracking types and utilities
 *
 * Provides step-by-step visibility into the deployment process with
 * minimum display times to ensure each step is legible even when fast.
 */

import { MIN_STEP_DISPLAY_MS } from '../constants.js';

// Re-export for backward compatibility
export { MIN_STEP_DISPLAY_MS };

export type DeploymentStepId =
  | 'authenticating'
  | 'validating'
  | 'exporting'
  | 'uploading'
  | 'importing'
  | 'configuring'
  | 'verifying'
  | 'completing';

export type DeploymentStepStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';

export interface DeploymentStep {
  id: DeploymentStepId;
  label: string;
  description: string;
  status: DeploymentStepStatus;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  details?: string;
}

export interface TenantDeploymentProgress {
  tenantId: string;
  tenantName: string;
  overallStatus: 'pending' | 'in_progress' | 'completed' | 'failed';
  currentStep: DeploymentStepId | null;
  steps: DeploymentStep[];
  progress: number; // 0-100
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface DeploymentProgressEvent {
  type: 'step_started' | 'step_completed' | 'step_failed' | 'tenant_completed' | 'deployment_completed';
  deploymentId: string;
  tenantId?: string;
  tenantName?: string;
  stepId?: DeploymentStepId;
  progress?: number;
  error?: string;
  details?: string;
  timestamp: string;
}

/**
 * Configuration for each deployment step
 */
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
};

/**
 * Create initial progress state for a tenant deployment
 */
export function createInitialTenantProgress(tenantId: string, tenantName: string): TenantDeploymentProgress {
  const steps: DeploymentStep[] = Object.entries(DEPLOYMENT_STEPS).map(([id, config]) => ({
    id: id as DeploymentStepId,
    label: config.label,
    description: config.description,
    status: 'pending' as DeploymentStepStatus,
  }));

  return {
    tenantId,
    tenantName,
    overallStatus: 'pending',
    currentStep: null,
    steps,
    progress: 0,
  };
}

/**
 * Calculate progress percentage based on completed steps
 */
export function calculateProgress(steps: DeploymentStep[]): number {
  const completed = steps.filter(s => s.status === 'completed' || s.status === 'skipped').length;
  const inProgress = steps.filter(s => s.status === 'in_progress').length;
  const total = steps.length;

  // Give partial credit for in-progress step
  return Math.round(((completed + inProgress * 0.5) / total) * 100);
}

/**
 * Update a tenant's progress state based on an event
 */
export function applyProgressEvent(
  progress: TenantDeploymentProgress,
  event: DeploymentProgressEvent
): TenantDeploymentProgress {
  const updatedProgress = { ...progress };
  const steps = [...progress.steps];

  switch (event.type) {
    case 'step_started': {
      if (event.stepId) {
        const stepIndex = steps.findIndex(s => s.id === event.stepId);
        if (stepIndex !== -1) {
          steps[stepIndex] = {
            ...steps[stepIndex],
            status: 'in_progress',
            startedAt: event.timestamp,
            details: event.details,
          };
          updatedProgress.currentStep = event.stepId;
          updatedProgress.overallStatus = 'in_progress';
          if (!updatedProgress.startedAt) {
            updatedProgress.startedAt = event.timestamp;
          }
        }
      }
      break;
    }

    case 'step_completed': {
      if (event.stepId) {
        const stepIndex = steps.findIndex(s => s.id === event.stepId);
        if (stepIndex !== -1) {
          steps[stepIndex] = {
            ...steps[stepIndex],
            status: 'completed',
            completedAt: event.timestamp,
            details: event.details,
          };
        }
      }
      break;
    }

    case 'step_failed': {
      if (event.stepId) {
        const stepIndex = steps.findIndex(s => s.id === event.stepId);
        if (stepIndex !== -1) {
          steps[stepIndex] = {
            ...steps[stepIndex],
            status: 'failed',
            completedAt: event.timestamp,
            error: event.error,
          };
          updatedProgress.error = event.error;
          updatedProgress.overallStatus = 'failed';
          updatedProgress.completedAt = event.timestamp;
        }
      }
      break;
    }

    case 'tenant_completed': {
      updatedProgress.overallStatus = 'completed';
      updatedProgress.completedAt = event.timestamp;
      updatedProgress.currentStep = null;
      break;
    }
  }

  updatedProgress.steps = steps;
  updatedProgress.progress = calculateProgress(steps);

  return updatedProgress;
}

/**
 * Format duration for display
 */
export function formatDuration(startedAt: string, completedAt?: string): string {
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const durationMs = end - start;

  if (durationMs < 1000) return `${durationMs}ms`;
  if (durationMs < 60000) return `${(durationMs / 1000).toFixed(1)}s`;
  return `${Math.floor(durationMs / 60000)}m ${Math.round((durationMs % 60000) / 1000)}s`;
}

/**
 * Generate simulated progress events for demo mode
 * Includes minimum display times between steps
 */
export async function* simulateDeploymentProgress(
  deploymentId: string,
  tenantId: string,
  tenantName: string,
  options?: { failAtStep?: DeploymentStepId; speedMultiplier?: number }
): AsyncGenerator<DeploymentProgressEvent> {
  const speedMultiplier = options?.speedMultiplier ?? 1;
  const minDelay = MIN_STEP_DISPLAY_MS / speedMultiplier;

  const stepDurations: Record<DeploymentStepId, number> = {
    authenticating: 800,
    validating: 600,
    exporting: 1200,
    uploading: 1500,
    importing: 2000,
    configuring: 900,
    verifying: 700,
    completing: 500,
  };

  const stepOrder: DeploymentStepId[] = [
    'authenticating',
    'validating',
    'exporting',
    'uploading',
    'importing',
    'configuring',
    'verifying',
    'completing',
  ];

  for (const stepId of stepOrder) {
    // Start step
    yield {
      type: 'step_started',
      deploymentId,
      tenantId,
      tenantName,
      stepId,
      timestamp: new Date().toISOString(),
    };

    // Simulate step processing with minimum display time
    const duration = Math.max(minDelay, stepDurations[stepId] / speedMultiplier);
    await new Promise(resolve => setTimeout(resolve, duration));

    // Check if this step should fail
    if (options?.failAtStep === stepId) {
      yield {
        type: 'step_failed',
        deploymentId,
        tenantId,
        tenantName,
        stepId,
        error: `Failed during ${DEPLOYMENT_STEPS[stepId].label.toLowerCase()}: Connection timeout`,
        timestamp: new Date().toISOString(),
      };
      return;
    }

    // Complete step
    yield {
      type: 'step_completed',
      deploymentId,
      tenantId,
      tenantName,
      stepId,
      timestamp: new Date().toISOString(),
    };
  }

  // Deployment completed
  yield {
    type: 'tenant_completed',
    deploymentId,
    tenantId,
    tenantName,
    timestamp: new Date().toISOString(),
  };
}

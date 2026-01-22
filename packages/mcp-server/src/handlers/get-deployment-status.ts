import { get } from '../lib/api-client.js';
import { validate, GetDeploymentStatusSchema } from '../lib/validation.js';
import { logger } from '../lib/logger.js';

export interface DeploymentStatusResponse {
  id: string;
  solutionName: string;
  status: string;
  createdAt: string;
  completedAt?: string;
  tenantResults: Array<{
    tenantId: string;
    tenantName: string;
    status: string;
    error?: string;
  }>;
}

/**
 * Get detailed status of a specific deployment
 */
export async function handleGetDeploymentStatus(args: unknown) {
  logger.info('Handling get_deployment_status request', { args });

  // Validate input
  const params = validate(GetDeploymentStatusSchema, args);

  // Make API request
  const data = await get<DeploymentStatusResponse>(
    `/api/deployments/${params.deploymentId}`
  );

  logger.info('Get deployment status successful', {
    deploymentId: params.deploymentId,
    status: data.status,
  });

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

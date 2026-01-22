import { post } from '../lib/api-client.js';
import { validate, RetryDeploymentSchema } from '../lib/validation.js';
import { logger } from '../lib/logger.js';

export interface RetryDeploymentResponse {
  deploymentId: string;
  status: string;
  message: string;
}

/**
 * Retry a failed deployment
 */
export async function handleRetryDeployment(args: unknown) {
  logger.info('Handling retry_deployment request', { args });

  // Validate input
  const params = validate(RetryDeploymentSchema, args);

  // Make API request
  const data = await post<RetryDeploymentResponse>(
    `/api/deployments/${params.deploymentId}/retry`,
    {}
  );

  logger.info('Retry deployment successful', {
    originalDeploymentId: params.deploymentId,
    newDeploymentId: data.deploymentId,
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

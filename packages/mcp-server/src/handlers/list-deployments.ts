import { get } from '../lib/api-client.js';
import { validate, ListDeploymentsSchema, ListDeploymentsParams } from '../lib/validation.js';
import { logger } from '../lib/logger.js';

export interface DeploymentsListResponse {
  deployments: Array<{
    id: string;
    solutionName: string;
    status: string;
    createdAt: string;
    completedAt?: string;
  }>;
  total?: number;
}

/**
 * List deployments with optional filtering
 */
export async function handleListDeployments(args: unknown) {
  logger.info('Handling list_deployments request', { args });

  // Validate input
  const params = validate(ListDeploymentsSchema, args || {});

  // Build query params
  const queryParams = new URLSearchParams();
  if (params.status) {
    queryParams.append('status', params.status);
  }
  if (params.limit) {
    queryParams.append('limit', params.limit.toString());
  }
  if (params.offset) {
    queryParams.append('offset', params.offset.toString());
  }

  // Make API request
  const data = await get<DeploymentsListResponse>(
    `/api/deployments?${queryParams}`
  );

  logger.info('List deployments successful', {
    count: data.deployments?.length || 0,
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

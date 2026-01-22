import { get } from '../lib/api-client.js';
import { validate, NoParamsSchema } from '../lib/validation.js';
import { logger } from '../lib/logger.js';

export interface DeploymentStatsResponse {
  totalDeployments: number;
  activeDeployments: number;
  completedToday: number;
  totalTenants: number;
  successRate?: number;
}

/**
 * Get overall deployment statistics
 */
export async function handleGetDeploymentStats(args: unknown) {
  logger.info('Handling get_deployment_stats request');

  // Validate input (no params expected)
  validate(NoParamsSchema, args || {});

  // Make API request
  const data = await get<DeploymentStatsResponse>('/api/stats');

  logger.info('Get deployment stats successful', {
    totalDeployments: data.totalDeployments,
    activeDeployments: data.activeDeployments,
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

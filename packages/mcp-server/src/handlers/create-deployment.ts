import { createDeployment, CreateDeploymentParams } from '@agentsync/core';
import { logger } from '../lib/logger.js';
import { ValidationError } from '../lib/errors.js';

/**
 * Create a new deployment using shared deployment tools
 */
export async function handleCreateDeployment(args: unknown) {
  logger.info('Handling create_deployment request', { args });

  // Manual validation since we need special handling
  const params = args as CreateDeploymentParams;

  if (!params.agentId || typeof params.agentId !== 'string') {
    throw new ValidationError('agentId is required and must be a string');
  }

  if (!Array.isArray(params.tenantIds) || params.tenantIds.length === 0) {
    throw new ValidationError(
      'tenantIds is required and must be a non-empty array'
    );
  }

  // Use shared deployment tool
  const data = await createDeployment(params);

  logger.info('Deployment created', {
    deploymentId: data.deploymentId,
    tenantCount: data.tenantCount,
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

import { get } from '../lib/api-client.js';
import { validate, NoParamsSchema } from '../lib/validation.js';
import { logger } from '../lib/logger.js';

export interface TenantsListResponse {
  tenants: Array<{
    tenantId: string;
    name: string;
    environmentUrl: string;
    deployedAgents?: string[];
  }>;
}

/**
 * List all customer tenants
 */
export async function handleListTenants(args: unknown) {
  logger.info('Handling list_tenants request');

  // Validate input (no params expected)
  validate(NoParamsSchema, args || {});

  // Make API request
  const data = await get<TenantsListResponse>('/api/tenants');

  logger.info('List tenants successful', {
    count: data.tenants?.length || 0,
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

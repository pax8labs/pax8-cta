import { get } from '../lib/api-client.js';
import { validate, NoParamsSchema } from '../lib/validation.js';
import { logger } from '../lib/logger.js';

export interface AgentsListResponse {
  agents: Array<{
    uniqueName: string;
    friendlyName: string;
    version: string;
    deployedTo?: string[];
  }>;
}

/**
 * List all available Copilot agents
 */
export async function handleListAgents(args: unknown) {
  logger.info('Handling list_agents request');

  // Validate input (no params expected)
  validate(NoParamsSchema, args || {});

  // Make API request
  const data = await get<AgentsListResponse>('/api/agents');

  logger.info('List agents successful', {
    count: data.agents?.length || 0,
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

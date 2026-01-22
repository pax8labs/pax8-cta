import { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * MCP tool definitions
 * Each tool is exposed to AI assistants with its schema and description
 */
export const tools: Tool[] = [
  {
    name: 'list_deployments',
    description:
      'List recent deployments with optional status filtering. Returns deployment history with agent names, tenants, statuses, and timestamps.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['pending', 'in_progress', 'completed', 'failed', 'cancelled'],
          description: 'Filter deployments by status (optional)',
        },
        limit: {
          type: 'number',
          description:
            'Maximum number of deployments to return (default: 10, max: 100)',
          default: 10,
        },
      },
    },
  },
  {
    name: 'get_deployment_status',
    description:
      'Get detailed status of a specific deployment including progress, tenant results, and error messages if any.',
    inputSchema: {
      type: 'object',
      properties: {
        deploymentId: {
          type: 'string',
          description: 'The deployment ID (e.g., batch-abc123)',
        },
      },
      required: ['deploymentId'],
    },
  },
  {
    name: 'list_agents',
    description:
      'List all available Copilot agents with their deployment information. Shows which agents are available for deployment and where they are currently deployed.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'list_tenants',
    description:
      'List all customer tenants with their metadata and currently deployed agents. Shows which tenants are available as deployment targets.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'analyze_deployment_risk',
    description:
      'Analyze deployment risk before executing a deployment. Checks for GDAP permissions, connection issues, tenant health, recurring failures, and historical success rates. Returns risk assessment with severity levels, affected tenants, recommendations, and whether deployment can proceed. Use this before create_deployment to prevent failures.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: {
          type: 'string',
          description:
            'The unique name of the agent to deploy (e.g., ProductQADemo_v3)',
        },
        tenantIds: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Array of tenant IDs to deploy to (e.g., ["55555555-5555-5555-5555-555555555555"])',
        },
      },
      required: ['agentId', 'tenantIds'],
    },
  },
  {
    name: 'create_deployment',
    description:
      'Create a new deployment to deploy an agent to one or more tenants. This initiates the deployment process which includes authentication, validation, export, upload, import, configuration, and verification steps. Consider using analyze_deployment_risk first to check for potential issues.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: {
          type: 'string',
          description:
            'The unique name of the agent to deploy (e.g., ProductQADemo_v3)',
        },
        tenantIds: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Array of tenant IDs to deploy to (e.g., ["55555555-5555-5555-5555-555555555555"])',
        },
      },
      required: ['agentId', 'tenantIds'],
    },
  },
  {
    name: 'monitor_deployment',
    description:
      'Monitor a deployment in real-time and wait for it to complete. Returns final status after deployment finishes or times out.',
    inputSchema: {
      type: 'object',
      properties: {
        deploymentId: {
          type: 'string',
          description: 'The deployment ID to monitor',
        },
        maxWaitSeconds: {
          type: 'number',
          description: 'Maximum seconds to wait for completion (default: 60)',
          default: 60,
        },
      },
      required: ['deploymentId'],
    },
  },
  {
    name: 'get_deployment_stats',
    description:
      'Get overall deployment statistics including total deployments, success/failure rates, and recent activity.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'retry_deployment',
    description:
      'Retry a failed deployment. This creates a new deployment attempt for the same agent and tenants.',
    inputSchema: {
      type: 'object',
      properties: {
        deploymentId: {
          type: 'string',
          description: 'The deployment ID to retry',
        },
      },
      required: ['deploymentId'],
    },
  },
];

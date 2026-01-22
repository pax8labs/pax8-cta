/**
 * Tool definitions for the AI assistant
 * These tools allow the assistant to take actions on behalf of the user
 */

/**
 * Convert Anthropic tool definitions to Gemini function calling format
 * Gemini expects: [{ functionDeclarations: [tool1, tool2, ...] }]
 */
export function convertToolsForGemini(tools: any[]): any[] {
  return [{
    functionDeclarations: tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    }))
  }]
}

export const ASSISTANT_TOOLS = [
  {
    name: 'create_deployment',
    description: 'Deploy an agent/solution to one or more tenants. CRITICAL: You must look up agent and tenant IDs from the system context lists before calling this tool.',
    input_schema: {
      type: 'object',
      properties: {
        agent_name: {
          type: 'string',
          description: 'The agent ID (e.g., "product-demo", "faq-bot"). MUST be the id field from Available Agents list, NOT the display name. Look it up first!',
        },
        tenant_identifiers: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of tenant IDs (UUIDs). MUST be the id field from Available Tenants list, NOT the display name. Look them up first!',
        },
        strategy: {
          type: 'string',
          enum: ['all_at_once', 'phased'],
          description: 'Deployment strategy',
        },
      },
      required: ['agent_name', 'tenant_identifiers'],
    },
  },
  {
    name: 'retry_deployment',
    description: 'Retry a failed deployment',
    input_schema: {
      type: 'object',
      properties: {
        deployment_id: {
          type: 'string',
          description: 'The ID of the deployment to retry',
        },
      },
      required: ['deployment_id'],
    },
  },
  {
    name: 'cancel_deployment',
    description: 'Cancel an in-progress deployment',
    input_schema: {
      type: 'object',
      properties: {
        deployment_id: {
          type: 'string',
          description: 'The ID of the deployment to cancel',
        },
      },
      required: ['deployment_id'],
    },
  },
  {
    name: 'get_deployment_details',
    description: 'Get detailed information about a specific deployment',
    input_schema: {
      type: 'object',
      properties: {
        deployment_id: {
          type: 'string',
          description: 'The ID of the deployment',
        },
      },
      required: ['deployment_id'],
    },
  },
  {
    name: 'get_tenant_health',
    description: 'Get health status for one or more tenants',
    input_schema: {
      type: 'object',
      properties: {
        tenant_identifiers: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of tenant names or IDs. Omit for all tenants.',
        },
      },
    },
  },
  {
    name: 'list_agents',
    description: 'List all available agents/solutions',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'list_tenants',
    description: 'List all configured tenants',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'search',
    description: 'Search for deployments, tenants, or agents by name',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query',
        },
        type: {
          type: 'string',
          enum: ['deployment', 'tenant', 'agent'],
          description: 'What to search for',
        },
      },
      required: ['query'],
    },
  },
]

/**
 * Execute a tool call and return the result
 */
export async function executeTool(toolName: string, toolInput: any): Promise<any> {
  switch (toolName) {
    case 'create_deployment':
      return {
        status: 'requires_confirmation',
        action: 'deploy',
        agentName: toolInput.agent_name,
        tenantIds: toolInput.tenant_identifiers,
        strategy: toolInput.strategy || 'all_at_once',
      }

    case 'retry_deployment':
      return {
        status: 'requires_confirmation',
        action: 'retry',
        deploymentId: toolInput.deployment_id,
      }

    case 'cancel_deployment':
      return {
        status: 'requires_confirmation',
        action: 'cancel',
        deploymentId: toolInput.deployment_id,
      }

    case 'get_deployment_details':
      // Fetch deployment details via API
      const response = await fetch(`/api/deployments/${toolInput.deployment_id}`)
      if (!response.ok) throw new Error('Deployment not found')
      return await response.json()

    case 'get_tenant_health':
      // Fetch tenant health data
      const healthResponse = await fetch('/api/tenants')
      if (!healthResponse.ok) throw new Error('Failed to fetch tenant health')
      const tenants = await healthResponse.json()

      if (toolInput.tenant_identifiers) {
        return tenants.filter((t: any) =>
          toolInput.tenant_identifiers.some((id: string) =>
            t.id === id || t.name.toLowerCase().includes(id.toLowerCase())
          )
        )
      }
      return tenants

    case 'list_agents':
      const agentsResponse = await fetch('/api/agents')
      if (!agentsResponse.ok) throw new Error('Failed to fetch agents')
      return await agentsResponse.json()

    case 'list_tenants':
      const tenantsResponse = await fetch('/api/tenants')
      if (!tenantsResponse.ok) throw new Error('Failed to fetch tenants')
      return await tenantsResponse.json()

    case 'search':
      // Implement search logic
      return { results: [], query: toolInput.query, type: toolInput.type }

    default:
      throw new Error(`Unknown tool: ${toolName}`)
  }
}

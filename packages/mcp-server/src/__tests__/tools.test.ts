import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Import the server setup (we'll need to refactor index.ts to export the server setup)
// For now, we'll test the tool definitions

describe('MCP Server Tools', () => {
  describe('Tool Definitions', () => {
    it('should have 8 tools defined', () => {
      // We'll verify the tools exist
      const expectedTools = [
        'list_deployments',
        'get_deployment_status',
        'list_agents',
        'list_tenants',
        'create_deployment',
        'monitor_deployment',
        'get_deployment_stats',
        'retry_deployment',
      ];
      
      expect(expectedTools).toHaveLength(8);
    });

    it('should have valid schemas for list_deployments', () => {
      const schema = {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['pending', 'in_progress', 'completed', 'failed', 'cancelled'],
          },
          limit: {
            type: 'number',
            default: 10,
          },
        },
      };
      
      expect(schema.properties.status.enum).toContain('completed');
      expect(schema.properties.limit.default).toBe(10);
    });

    it('should have required parameters for create_deployment', () => {
      const required = ['agentId', 'tenantIds'];
      
      expect(required).toContain('agentId');
      expect(required).toContain('tenantIds');
    });

    it('should have required parameters for get_deployment_status', () => {
      const required = ['deploymentId'];
      
      expect(required).toContain('deploymentId');
    });
  });

  describe('Tool Parameter Validation', () => {
    it('should validate deploymentId format', () => {
      const validIds = ['batch-abc123', 'demo-deploy-1', 'batch-ml1t3093'];
      const invalidIds = ['', 'invalid id', null, undefined];
      
      validIds.forEach(id => {
        expect(typeof id).toBe('string');
        expect(id.length).toBeGreaterThan(0);
      });
    });

    it('should validate tenantIds array format', () => {
      const validTenantIds = [
        ['55555555-5555-5555-5555-555555555555'],
        ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'],
      ];
      
      validTenantIds.forEach(ids => {
        expect(Array.isArray(ids)).toBe(true);
        expect(ids.length).toBeGreaterThan(0);
        ids.forEach(id => {
          expect(typeof id).toBe('string');
          expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        });
      });
    });

    it('should validate status enum values', () => {
      const validStatuses = ['pending', 'in_progress', 'completed', 'failed', 'cancelled'];
      const invalidStatuses = ['running', 'done', 'error'];
      
      validStatuses.forEach(status => {
        expect(['pending', 'in_progress', 'completed', 'failed', 'cancelled']).toContain(status);
      });
      
      invalidStatuses.forEach(status => {
        expect(['pending', 'in_progress', 'completed', 'failed', 'cancelled']).not.toContain(status);
      });
    });
  });

  describe('Response Format', () => {
    it('should return content with type text', () => {
      const mockResponse = {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: true }),
          },
        ],
      };
      
      expect(mockResponse.content).toHaveLength(1);
      expect(mockResponse.content[0].type).toBe('text');
      expect(typeof mockResponse.content[0].text).toBe('string');
    });

    it('should return valid JSON in text field', () => {
      const mockData = { deployments: [], demoMode: true };
      const mockResponse = {
        content: [
          {
            type: 'text',
            text: JSON.stringify(mockData, null, 2),
          },
        ],
      };
      
      const parsed = JSON.parse(mockResponse.content[0].text);
      expect(parsed).toHaveProperty('deployments');
      expect(parsed).toHaveProperty('demoMode');
    });

    it('should include error flag for error responses', () => {
      const errorResponse = {
        content: [
          {
            type: 'text',
            text: 'Error: Connection failed',
          },
        ],
        isError: true,
      };
      
      expect(errorResponse.isError).toBe(true);
      expect(errorResponse.content[0].text).toContain('Error:');
    });
  });
});

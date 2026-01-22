import { describe, it, expect } from 'vitest';
import { tools } from '../../tools/definitions.js';

describe('Tool Definitions', () => {
  it('should have exactly 8 tools defined', () => {
    expect(tools).toHaveLength(8);
  });

  it('should have all expected tool names', () => {
    const toolNames = tools.map(t => t.name);
    expect(toolNames).toContain('list_deployments');
    expect(toolNames).toContain('get_deployment_status');
    expect(toolNames).toContain('list_agents');
    expect(toolNames).toContain('list_tenants');
    expect(toolNames).toContain('create_deployment');
    expect(toolNames).toContain('monitor_deployment');
    expect(toolNames).toContain('get_deployment_stats');
    expect(toolNames).toContain('retry_deployment');
  });

  it('should have description for each tool', () => {
    tools.forEach(tool => {
      expect(tool.description).toBeTruthy();
      if (tool.description) {
        expect(tool.description.length).toBeGreaterThan(10);
      }
    });
  });

  it('should have input schema for each tool', () => {
    tools.forEach(tool => {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
    });
  });

  it('should have list_deployments with correct parameters', () => {
    const tool = tools.find(t => t.name === 'list_deployments');
    expect(tool).toBeDefined();
    expect(tool?.inputSchema.properties).toHaveProperty('status');
    expect(tool?.inputSchema.properties).toHaveProperty('limit');
  });

  it('should have get_deployment_status with required deploymentId', () => {
    const tool = tools.find(t => t.name === 'get_deployment_status');
    expect(tool).toBeDefined();
    expect(tool?.inputSchema.required).toContain('deploymentId');
  });

  it('should have create_deployment with required parameters', () => {
    const tool = tools.find(t => t.name === 'create_deployment');
    expect(tool).toBeDefined();
    expect(tool?.inputSchema.required).toContain('agentId');
    expect(tool?.inputSchema.required).toContain('tenantIds');
  });

  it('should have monitor_deployment with required deploymentId', () => {
    const tool = tools.find(t => t.name === 'monitor_deployment');
    expect(tool).toBeDefined();
    expect(tool?.inputSchema.required).toContain('deploymentId');
    expect(tool?.inputSchema.properties).toHaveProperty('maxWaitSeconds');
  });

  it('should have retry_deployment with required deploymentId', () => {
    const tool = tools.find(t => t.name === 'retry_deployment');
    expect(tool).toBeDefined();
    expect(tool?.inputSchema.required).toContain('deploymentId');
  });

  it('should have tools with no parameters', () => {
    const noParamTools = ['list_agents', 'list_tenants', 'get_deployment_stats'];

    noParamTools.forEach(toolName => {
      const tool = tools.find(t => t.name === toolName);
      expect(tool).toBeDefined();
      expect(Object.keys(tool?.inputSchema.properties || {})).toHaveLength(0);
    });
  });
});

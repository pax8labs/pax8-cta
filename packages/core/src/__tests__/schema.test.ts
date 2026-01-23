import { describe, it, expect } from 'vitest';
import {
  parseDuration,
  getEffectiveConnectionMappings,
  getEffectiveEnvironmentVariables,
  getEffectiveRollbackSettings,
  TenantConfigSchema,
} from '../config/schema.js';

describe('parseDuration', () => {
  it('should parse milliseconds', () => {
    expect(parseDuration('100ms')).toBe(100);
    expect(parseDuration('1ms')).toBe(1);
  });

  it('should parse seconds', () => {
    expect(parseDuration('30s')).toBe(30000);
    expect(parseDuration('1s')).toBe(1000);
  });

  it('should parse minutes', () => {
    expect(parseDuration('5m')).toBe(300000);
    expect(parseDuration('1m')).toBe(60000);
  });

  it('should parse hours', () => {
    expect(parseDuration('2h')).toBe(7200000);
    expect(parseDuration('1h')).toBe(3600000);
  });

  it('should parse days', () => {
    expect(parseDuration('1d')).toBe(86400000);
    expect(parseDuration('7d')).toBe(604800000);
  });

  it('should throw for invalid format', () => {
    expect(() => parseDuration('invalid')).toThrow('Invalid duration format');
    expect(() => parseDuration('5')).toThrow('Invalid duration format');
    expect(() => parseDuration('5x')).toThrow('Invalid duration format');
  });
});

describe('getEffectiveConnectionMappings', () => {
  it('should return global mappings when tenant has none', () => {
    const config = {
      version: '2.0',
      partner: { tenantId: '00000000-0000-0000-0000-000000000001', clientId: '00000000-0000-0000-0000-000000000002' },
      source: { tenantId: '00000000-0000-0000-0000-000000000003', environmentUrl: 'https://source.crm.dynamics.com' },
      tenants: [],
      settings: {
        defaultConnectionMappings: [
          { sourceLogicalName: 'cr_sharepoint', targetConnectionId: 'global-sp-123' },
        ],
      },
    };

    const tenant = {
      name: 'Test Tenant',
      tenantId: '00000000-0000-0000-0000-000000000004',
      environmentUrl: 'https://test.crm.dynamics.com',
      tags: [],
      enabled: true,
    };

    const result = getEffectiveConnectionMappings(config, tenant);
    expect(result).toHaveLength(1);
    expect(result[0].targetConnectionId).toBe('global-sp-123');
  });

  it('should override global mappings with tenant-specific', () => {
    const config = {
      version: '2.0',
      partner: { tenantId: '00000000-0000-0000-0000-000000000001', clientId: '00000000-0000-0000-0000-000000000002' },
      source: { tenantId: '00000000-0000-0000-0000-000000000003', environmentUrl: 'https://source.crm.dynamics.com' },
      tenants: [],
      settings: {
        defaultConnectionMappings: [
          { sourceLogicalName: 'cr_sharepoint', targetConnectionId: 'global-sp-123' },
          { sourceLogicalName: 'cr_outlook', targetConnectionId: 'global-ol-456' },
        ],
      },
    };

    const tenant = {
      name: 'Test Tenant',
      tenantId: '00000000-0000-0000-0000-000000000004',
      environmentUrl: 'https://test.crm.dynamics.com',
      tags: [],
      enabled: true,
      connectionMappings: [
        { sourceLogicalName: 'cr_sharepoint', targetConnectionId: 'tenant-sp-789' },
      ],
    };

    const result = getEffectiveConnectionMappings(config, tenant);
    expect(result).toHaveLength(2);

    const spMapping = result.find(m => m.sourceLogicalName === 'cr_sharepoint');
    const olMapping = result.find(m => m.sourceLogicalName === 'cr_outlook');

    expect(spMapping?.targetConnectionId).toBe('tenant-sp-789');
    expect(olMapping?.targetConnectionId).toBe('global-ol-456');
  });
});

describe('getEffectiveEnvironmentVariables', () => {
  it('should merge global and tenant variables', () => {
    const config = {
      version: '2.0',
      partner: { tenantId: '00000000-0000-0000-0000-000000000001', clientId: '00000000-0000-0000-0000-000000000002' },
      source: { tenantId: '00000000-0000-0000-0000-000000000003', environmentUrl: 'https://source.crm.dynamics.com' },
      tenants: [],
      settings: {
        defaultEnvironmentVariables: [
          { schemaName: 'cr_Environment', value: 'Production', type: 'String' as const },
        ],
      },
    };

    const tenant = {
      name: 'Test Tenant',
      tenantId: '00000000-0000-0000-0000-000000000004',
      environmentUrl: 'https://test.crm.dynamics.com',
      tags: [],
      enabled: true,
      environmentVariables: [
        { schemaName: 'cr_SupportEmail', value: 'support@test.com', type: 'String' as const },
      ],
    };

    const result = getEffectiveEnvironmentVariables(config, tenant);
    expect(result).toHaveLength(2);
  });

  it('should allow tenant to override global variables', () => {
    const config = {
      version: '2.0',
      partner: { tenantId: '00000000-0000-0000-0000-000000000001', clientId: '00000000-0000-0000-0000-000000000002' },
      source: { tenantId: '00000000-0000-0000-0000-000000000003', environmentUrl: 'https://source.crm.dynamics.com' },
      tenants: [],
      settings: {
        defaultEnvironmentVariables: [
          { schemaName: 'cr_MaxRetries', value: 3, type: 'Number' as const },
        ],
      },
    };

    const tenant = {
      name: 'Test Tenant',
      tenantId: '00000000-0000-0000-0000-000000000004',
      environmentUrl: 'https://test.crm.dynamics.com',
      tags: [],
      enabled: true,
      environmentVariables: [
        { schemaName: 'cr_MaxRetries', value: 5, type: 'Number' as const },
      ],
    };

    const result = getEffectiveEnvironmentVariables(config, tenant);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(5);
  });
});

describe('getEffectiveRollbackSettings', () => {
  it('should return default settings when none configured', () => {
    const config = {
      version: '2.0',
      partner: { tenantId: '00000000-0000-0000-0000-000000000001', clientId: '00000000-0000-0000-0000-000000000002' },
      source: { tenantId: '00000000-0000-0000-0000-000000000003', environmentUrl: 'https://source.crm.dynamics.com' },
      tenants: [],
    };

    const tenant = {
      name: 'Test Tenant',
      tenantId: '00000000-0000-0000-0000-000000000004',
      environmentUrl: 'https://test.crm.dynamics.com',
      tags: [],
      enabled: true,
    };

    const result = getEffectiveRollbackSettings(config, tenant);
    expect(result.enabled).toBe(true);
    expect(result.keepVersions).toBe(3);
  });

  it('should merge global and tenant rollback settings', () => {
    const config = {
      version: '2.0',
      partner: { tenantId: '00000000-0000-0000-0000-000000000001', clientId: '00000000-0000-0000-0000-000000000002' },
      source: { tenantId: '00000000-0000-0000-0000-000000000003', environmentUrl: 'https://source.crm.dynamics.com' },
      tenants: [],
      settings: {
        rollback: {
          enabled: true,
          keepVersions: 5,
          autoRollbackOnFailure: false,
          rollbackTimeout: '10m',
        },
      },
    };

    const tenant = {
      name: 'Test Tenant',
      tenantId: '00000000-0000-0000-0000-000000000004',
      environmentUrl: 'https://test.crm.dynamics.com',
      tags: [],
      enabled: true,
      rollback: {
        keepVersions: 10,
      },
    };

    const result = getEffectiveRollbackSettings(config, tenant);
    expect(result.enabled).toBe(true);
    expect(result.keepVersions).toBe(10);
  });
});

describe('TenantConfigSchema', () => {
  it('should validate a minimal tenant config', () => {
    const tenant = {
      name: 'Test Tenant',
      tenantId: '00000000-0000-0000-0000-000000000001',
      environmentUrl: 'https://test.crm.dynamics.com',
    };

    const result = TenantConfigSchema.safeParse(tenant);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(true);
      expect(result.data.tags).toEqual([]);
    }
  });

  it('should validate a full tenant config', () => {
    const tenant = {
      name: 'Test Tenant',
      tenantId: '00000000-0000-0000-0000-000000000001',
      environmentUrl: 'https://test.crm.dynamics.com',
      tags: ['enterprise', 'wave1'],
      enabled: true,
      connectionMappings: [
        { sourceLogicalName: 'cr_sharepoint', targetConnectionId: 'sp-123' },
      ],
      environmentVariables: [
        { schemaName: 'cr_Email', value: 'test@test.com', type: 'String' },
      ],
      healthCheck: {
        enabled: true,
        timeout: '30s',
      },
      rollback: {
        enabled: true,
        keepVersions: 5,
      },
    };

    const result = TenantConfigSchema.safeParse(tenant);
    expect(result.success).toBe(true);
  });

  it('should reject invalid tenant config', () => {
    const tenant = {
      name: 'Test Tenant',
      tenantId: 'invalid-uuid',
      environmentUrl: 'not-a-url',
    };

    const result = TenantConfigSchema.safeParse(tenant);
    expect(result.success).toBe(false);
  });
});

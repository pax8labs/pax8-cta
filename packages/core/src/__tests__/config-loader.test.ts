import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Config } from '../config/schema.js';

// We need to mock fs modules before importing the loader
// Use vi.hoisted to ensure mocks are hoisted
const mockReadFile = vi.fn();
const mockExistsSync = vi.fn();

vi.mock('node:fs/promises', () => ({
  readFile: mockReadFile,
}));

vi.mock('node:fs', () => ({
  existsSync: mockExistsSync,
}));

// Now import the loader after mocks are set up
const { loadConfig, getClientSecret, filterTenantsByTags, filterTenantsByName, getTenantById, ConfigError } = await import('../config/loader.js');

describe('Config Loader', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset env to a clean state - make a copy
    process.env = { ...originalEnv };
    delete process.env.PARTNER_TENANT_ID;
    delete process.env.PARTNER_CLIENT_ID;
    delete process.env.SOURCE_TENANT_ID;
    delete process.env.SOURCE_ENVIRONMENT_URL;
    delete process.env.TENANTS_JSON;
    delete process.env.PARTNER_CLIENT_SECRET;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('loadConfig', () => {
    describe('from environment variables', () => {
      it('should load config from complete environment variables', async () => {
        process.env.PARTNER_TENANT_ID = '11111111-1111-1111-1111-111111111111';
        process.env.PARTNER_CLIENT_ID = '22222222-2222-2222-2222-222222222222';
        process.env.SOURCE_TENANT_ID = '33333333-3333-3333-3333-333333333333';
        process.env.SOURCE_ENVIRONMENT_URL = 'https://org.crm.dynamics.com';

        const config = await loadConfig('/any/path.yaml');

        expect(config.partner.tenantId).toBe('11111111-1111-1111-1111-111111111111');
        expect(config.partner.clientId).toBe('22222222-2222-2222-2222-222222222222');
        expect(config.source.tenantId).toBe('33333333-3333-3333-3333-333333333333');
        expect(config.source.environmentUrl).toBe('https://org.crm.dynamics.com');
        expect(config.tenants).toEqual([]);
      });

      it('should load tenants from TENANTS_JSON', async () => {
        process.env.PARTNER_TENANT_ID = '11111111-1111-1111-1111-111111111111';
        process.env.PARTNER_CLIENT_ID = '22222222-2222-2222-2222-222222222222';
        process.env.SOURCE_TENANT_ID = '33333333-3333-3333-3333-333333333333';
        process.env.SOURCE_ENVIRONMENT_URL = 'https://org.crm.dynamics.com';
        process.env.TENANTS_JSON = JSON.stringify([
          {
            name: 'Contoso',
            tenantId: '44444444-4444-4444-4444-444444444444',
            environmentUrl: 'https://contoso.crm.dynamics.com',
          },
        ]);

        const config = await loadConfig('/any/path.yaml');

        expect(config.tenants).toHaveLength(1);
        expect(config.tenants[0].name).toBe('Contoso');
      });

      it('should throw on incomplete environment variables', async () => {
        process.env.PARTNER_TENANT_ID = 'partner-tenant-123';
        // Missing other required vars

        await expect(loadConfig('/any/path.yaml')).rejects.toThrow(
          'Incomplete environment configuration'
        );
      });

      it('should throw on invalid TENANTS_JSON', async () => {
        process.env.PARTNER_TENANT_ID = 'partner-tenant-123';
        process.env.PARTNER_CLIENT_ID = 'client-456';
        process.env.SOURCE_TENANT_ID = 'source-tenant-789';
        process.env.SOURCE_ENVIRONMENT_URL = 'https://org.crm.dynamics.com';
        process.env.TENANTS_JSON = 'not valid json';

        await expect(loadConfig('/any/path.yaml')).rejects.toThrow(
          'Invalid TENANTS_JSON'
        );
      });
    });

    describe('from config file', () => {
      const validYamlConfig = `
version: "2.0"
partner:
  tenantId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
  clientId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
source:
  tenantId: "cccccccc-cccc-cccc-cccc-cccccccccccc"
  environmentUrl: "https://file-org.crm.dynamics.com"
tenants:
  - name: "Fabrikam"
    tenantId: "dddddddd-dddd-dddd-dddd-dddddddddddd"
    environmentUrl: "https://fabrikam.crm.dynamics.com"
    tags:
      - enterprise
`;

      it('should load config from YAML file when env vars not set', async () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFile.mockResolvedValue(validYamlConfig);

        const config = await loadConfig('/path/to/config.yaml');

        expect(config.partner.tenantId).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
        expect(config.tenants).toHaveLength(1);
        expect(config.tenants[0].name).toBe('Fabrikam');
      });

      it('should throw if config file does not exist', async () => {
        mockExistsSync.mockReturnValue(false);

        await expect(loadConfig('/nonexistent/config.yaml')).rejects.toThrow(
          'Config file not found'
        );
      });

      it('should throw if file cannot be read', async () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFile.mockRejectedValue(new Error('Permission denied'));

        await expect(loadConfig('/path/to/config.yaml')).rejects.toThrow(
          'Failed to read config file'
        );
      });

      it('should throw if YAML is invalid', async () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFile.mockResolvedValue('invalid: yaml: content: [');

        await expect(loadConfig('/path/to/config.yaml')).rejects.toThrow(
          'Failed to parse YAML'
        );
      });

      it('should throw if config schema validation fails', async () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFile.mockResolvedValue(`
version: "2.0"
partner:
  tenantId: "valid-id"
  # Missing clientId
source:
  tenantId: "source-id"
  environmentUrl: "https://org.crm.dynamics.com"
tenants: []
`);

        await expect(loadConfig('/path/to/config.yaml')).rejects.toThrow(
          'Invalid configuration'
        );
      });
    });

    describe('priority', () => {
      it('should prefer environment variables over config file', async () => {
        // Set env vars with valid UUIDs
        process.env.PARTNER_TENANT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
        process.env.PARTNER_CLIENT_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
        process.env.SOURCE_TENANT_ID = '00000000-0000-0000-0000-000000000001';
        process.env.SOURCE_ENVIRONMENT_URL = 'https://env.crm.dynamics.com';

        // Set up mock file that shouldn't be read
        mockExistsSync.mockReturnValue(true);
        mockReadFile.mockResolvedValue('should not be read');

        const config = await loadConfig('/path/to/config.yaml');

        expect(config.partner.tenantId).toBe('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
        expect(mockReadFile).not.toHaveBeenCalled();
      });
    });
  });

  describe('getClientSecret', () => {
    it('should return secret from default env var', () => {
      process.env.PARTNER_CLIENT_SECRET = 'super-secret-123';

      const secret = getClientSecret();

      expect(secret).toBe('super-secret-123');
    });

    it('should return secret from custom env var', () => {
      process.env.CUSTOM_SECRET = 'custom-secret-456';

      const secret = getClientSecret('CUSTOM_SECRET');

      expect(secret).toBe('custom-secret-456');
    });

    it('should throw if secret not set', () => {
      expect(() => getClientSecret()).toThrow('Missing client secret');
    });

    it('should include env var name in error message', () => {
      expect(() => getClientSecret('MY_SECRET')).toThrow('MY_SECRET');
    });
  });

  describe('filterTenantsByTags', () => {
    const mockConfig: Config = {
      version: '2.0',
      partner: { tenantId: 'p1', clientId: 'c1' },
      source: { tenantId: 's1', environmentUrl: 'https://src.crm.dynamics.com' },
      tenants: [
        { name: 'Tenant A', tenantId: 'a', environmentUrl: 'https://a.crm.dynamics.com', tags: ['enterprise', 'priority'], enabled: true },
        { name: 'Tenant B', tenantId: 'b', environmentUrl: 'https://b.crm.dynamics.com', tags: ['smb'], enabled: true },
        { name: 'Tenant C', tenantId: 'c', environmentUrl: 'https://c.crm.dynamics.com', tags: ['enterprise'], enabled: false },
        { name: 'Tenant D', tenantId: 'd', environmentUrl: 'https://d.crm.dynamics.com', enabled: true },
      ],
    };

    it('should filter tenants by single tag', () => {
      const result = filterTenantsByTags(mockConfig, ['enterprise']);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Tenant A');
    });

    it('should filter tenants by multiple tags (OR logic)', () => {
      const result = filterTenantsByTags(mockConfig, ['enterprise', 'smb']);

      expect(result).toHaveLength(2);
      expect(result.map(t => t.name)).toContain('Tenant A');
      expect(result.map(t => t.name)).toContain('Tenant B');
    });

    it('should return all enabled tenants when no tags specified', () => {
      const result = filterTenantsByTags(mockConfig, []);

      expect(result).toHaveLength(3);
      expect(result.map(t => t.name)).not.toContain('Tenant C');
    });

    it('should exclude disabled tenants', () => {
      const result = filterTenantsByTags(mockConfig, ['enterprise']);

      expect(result.map(t => t.name)).not.toContain('Tenant C');
    });

    it('should return empty array if no tenants match', () => {
      const result = filterTenantsByTags(mockConfig, ['nonexistent']);

      expect(result).toHaveLength(0);
    });
  });

  describe('filterTenantsByName', () => {
    const mockConfig: Config = {
      version: '2.0',
      partner: { tenantId: 'p1', clientId: 'c1' },
      source: { tenantId: 's1', environmentUrl: 'https://src.crm.dynamics.com' },
      tenants: [
        { name: 'Contoso Corp', tenantId: 'a', environmentUrl: 'https://a.crm.dynamics.com', enabled: true },
        { name: 'Fabrikam Inc', tenantId: 'b', environmentUrl: 'https://b.crm.dynamics.com', enabled: true },
        { name: 'Contoso Labs', tenantId: 'c', environmentUrl: 'https://c.crm.dynamics.com', enabled: false },
      ],
    };

    it('should filter by partial name match', () => {
      const result = filterTenantsByName(mockConfig, 'Contoso');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Contoso Corp');
    });

    it('should be case-insensitive', () => {
      const result = filterTenantsByName(mockConfig, 'FABRIKAM');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Fabrikam Inc');
    });

    it('should exclude disabled tenants', () => {
      const result = filterTenantsByName(mockConfig, 'Labs');

      expect(result).toHaveLength(0);
    });

    it('should return empty array if no match', () => {
      const result = filterTenantsByName(mockConfig, 'NonExistent');

      expect(result).toHaveLength(0);
    });
  });

  describe('getTenantById', () => {
    const mockConfig: Config = {
      version: '2.0',
      partner: { tenantId: 'p1', clientId: 'c1' },
      source: { tenantId: 's1', environmentUrl: 'https://src.crm.dynamics.com' },
      tenants: [
        { name: 'Tenant A', tenantId: 'tenant-a-123', environmentUrl: 'https://a.crm.dynamics.com', enabled: true },
        { name: 'Tenant B', tenantId: 'tenant-b-456', environmentUrl: 'https://b.crm.dynamics.com', enabled: true },
      ],
    };

    it('should find tenant by exact ID', () => {
      const result = getTenantById(mockConfig, 'tenant-a-123');

      expect(result).toBeDefined();
      expect(result?.name).toBe('Tenant A');
    });

    it('should return undefined for non-existent ID', () => {
      const result = getTenantById(mockConfig, 'non-existent');

      expect(result).toBeUndefined();
    });

    it('should find tenant even if disabled', () => {
      const configWithDisabled: Config = {
        ...mockConfig,
        tenants: [
          { name: 'Disabled', tenantId: 'disabled-123', environmentUrl: 'https://d.crm.dynamics.com', enabled: false },
        ],
      };

      const result = getTenantById(configWithDisabled, 'disabled-123');

      expect(result).toBeDefined();
      expect(result?.name).toBe('Disabled');
    });
  });

  describe('ConfigError', () => {
    it('should have correct name', () => {
      const error = new ConfigError('Test error');
      expect(error.name).toBe('ConfigError');
    });

    it('should store cause', () => {
      const cause = new Error('Original error');
      const error = new ConfigError('Wrapped error', cause);

      expect(error.cause).toBe(cause);
    });
  });
});

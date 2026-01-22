import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleListTenants } from '../../handlers/list-tenants.js';
import * as apiClient from '../../lib/api-client.js';
import { mockTenantsResponse } from '../helpers/mocks.js';

vi.mock('../../lib/api-client.js');
vi.mock('../../lib/logger.js');

describe('handleListTenants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should list all tenants', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(mockTenantsResponse);

    const result = await handleListTenants({});

    expect(apiClient.get).toHaveBeenCalledWith('/api/tenants');
    expect(result.content[0].text).toBe(JSON.stringify(mockTenantsResponse, null, 2));
  });

  it('should reject unexpected parameters', async () => {
    await expect(handleListTenants({ unexpected: 'param' })).rejects.toThrow(/Validation failed/);
  });

  it('should handle API errors', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('API Error'));

    await expect(handleListTenants({})).rejects.toThrow('API Error');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleListDeployments } from '../../handlers/list-deployments.js';
import * as apiClient from '../../lib/api-client.js';
import { mockDeploymentsResponse } from '../helpers/mocks.js';

vi.mock('../../lib/api-client.js');
vi.mock('../../lib/logger.js');

describe('handleListDeployments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should list all deployments with default params', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(mockDeploymentsResponse);

    const result = await handleListDeployments({});

    expect(apiClient.get).toHaveBeenCalledWith('/api/deployments?');
    expect(result.content[0].text).toBe(JSON.stringify(mockDeploymentsResponse, null, 2));
  });

  it('should filter deployments by status', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      deployments: [mockDeploymentsResponse.deployments[1]],
      total: 1,
    });

    const result = await handleListDeployments({ status: 'failed' });

    expect(apiClient.get).toHaveBeenCalledWith('/api/deployments?status=failed');
    expect(result.content[0].type).toBe('text');
  });

  it('should apply limit parameter', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(mockDeploymentsResponse);

    await handleListDeployments({ limit: 5 });

    expect(apiClient.get).toHaveBeenCalledWith('/api/deployments?limit=5');
  });

  it('should apply offset parameter', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(mockDeploymentsResponse);

    await handleListDeployments({ offset: 10 });

    expect(apiClient.get).toHaveBeenCalledWith('/api/deployments?offset=10');
  });

  it('should throw validation error for invalid status', async () => {
    await expect(handleListDeployments({ status: 'invalid' })).rejects.toThrow(/Validation failed/);
  });

  it('should throw validation error for invalid limit', async () => {
    await expect(handleListDeployments({ limit: 0 })).rejects.toThrow(/Validation failed/);
    await expect(handleListDeployments({ limit: 101 })).rejects.toThrow(/Validation failed/);
  });

  it('should handle API errors', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('API Error'));

    await expect(handleListDeployments({})).rejects.toThrow('API Error');
  });
});

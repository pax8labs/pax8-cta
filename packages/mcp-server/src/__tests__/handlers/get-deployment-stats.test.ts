import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleGetDeploymentStats } from '../../handlers/get-deployment-stats.js';
import * as apiClient from '../../lib/api-client.js';
import { mockStatsResponse } from '../helpers/mocks.js';

vi.mock('../../lib/api-client.js');
vi.mock('../../lib/logger.js');

describe('handleGetDeploymentStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should get deployment statistics', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(mockStatsResponse);

    const result = await handleGetDeploymentStats({});

    expect(apiClient.get).toHaveBeenCalledWith('/api/stats');
    expect(result.content[0].text).toBe(JSON.stringify(mockStatsResponse, null, 2));
  });

  it('should reject unexpected parameters', async () => {
    await expect(handleGetDeploymentStats({ unexpected: 'param' })).rejects.toThrow(/Validation failed/);
  });

  it('should handle API errors', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('API Error'));

    await expect(handleGetDeploymentStats({})).rejects.toThrow('API Error');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleRetryDeployment } from '../../handlers/retry-deployment.js';
import * as apiClient from '../../lib/api-client.js';

vi.mock('../../lib/api-client.js');
vi.mock('../../lib/logger.js');

describe('handleRetryDeployment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should retry deployment', async () => {
    const mockResponse = {
      deploymentId: 'batch-new-123',
      status: 'pending',
      message: 'Deployment retry initiated',
    };

    vi.mocked(apiClient.post).mockResolvedValue(mockResponse);

    const result = await handleRetryDeployment({ deploymentId: 'batch-old-123' });

    expect(apiClient.post).toHaveBeenCalledWith('/api/deployments/batch-old-123/retry', {});
    expect(result.content[0].text).toBe(JSON.stringify(mockResponse, null, 2));
  });

  it('should throw validation error for missing deploymentId', async () => {
    await expect(handleRetryDeployment({})).rejects.toThrow(/Validation failed/);
  });

  it('should throw validation error for invalid deploymentId format', async () => {
    await expect(handleRetryDeployment({ deploymentId: 'invalid@id' })).rejects.toThrow(/Validation failed/);
  });

  it('should handle API errors', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new Error('Cannot retry completed deployment'));

    await expect(handleRetryDeployment({ deploymentId: 'batch-123' })).rejects.toThrow('Cannot retry completed deployment');
  });
});

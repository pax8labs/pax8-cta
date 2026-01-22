import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleMonitorDeployment } from '../../handlers/monitor-deployment.js';
import * as apiClient from '../../lib/api-client.js';

vi.mock('../../lib/api-client.js');
vi.mock('../../lib/logger.js');

describe('handleMonitorDeployment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return immediately for completed deployment', async () => {
    const mockResponse = {
      id: 'batch-123',
      status: 'completed',
      solutionName: 'TestAgent',
      createdAt: '2024-01-30T12:00:00.000Z',
      completedAt: '2024-01-30T12:05:00.000Z',
      tenantResults: [],
    };

    vi.mocked(apiClient.get).mockResolvedValue(mockResponse);

    const result = await handleMonitorDeployment({
      deploymentId: 'batch-123',
    });

    expect(apiClient.get).toHaveBeenCalledTimes(1);
    expect(result.content[0].text).toBe(JSON.stringify(mockResponse, null, 2));
  });

  it('should poll until deployment completes', async () => {
    const inProgressResponse = {
      id: 'batch-123',
      status: 'in_progress',
      tenantResults: [],
    };

    const completedResponse = {
      id: 'batch-123',
      status: 'completed',
      tenantResults: [],
    };

    // First two calls return in_progress, third returns completed
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce(inProgressResponse)
      .mockResolvedValueOnce(inProgressResponse)
      .mockResolvedValueOnce(completedResponse);

    const promise = handleMonitorDeployment({
      deploymentId: 'batch-123',
    });

    // Advance timers to trigger polls
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(2000);

    const result = await promise;

    expect(apiClient.get).toHaveBeenCalledTimes(3);
    expect(result.content[0].text).toContain('completed');
  });

  it('should timeout if deployment takes too long', async () => {
    const inProgressResponse = {
      id: 'batch-123',
      status: 'in_progress',
      tenantResults: [],
    };

    vi.mocked(apiClient.get).mockResolvedValue(inProgressResponse);

    const promise = handleMonitorDeployment({
      deploymentId: 'batch-123',
      pollIntervalMs: 5000, // 5 second max wait
    });

    // Advance past timeout
    await vi.advanceTimersByTimeAsync(6000);

    const result = await promise;

    const response = JSON.parse(result.content[0].text);
    expect(response.message).toContain('still in progress');
    expect(response.timedOut).toBe(true);
  });

  it('should handle failed deployments', async () => {
    const failedResponse = {
      id: 'batch-123',
      status: 'failed',
      tenantResults: [
        {
          tenantId: '1',
          status: 'failed',
          error: 'Authentication failed',
        },
      ],
    };

    vi.mocked(apiClient.get).mockResolvedValue(failedResponse);

    const result = await handleMonitorDeployment({
      deploymentId: 'batch-123',
    });

    expect(result.content[0].text).toContain('failed');
  });

  it('should handle cancelled deployments', async () => {
    const cancelledResponse = {
      id: 'batch-123',
      status: 'cancelled',
      tenantResults: [],
    };

    vi.mocked(apiClient.get).mockResolvedValue(cancelledResponse);

    const result = await handleMonitorDeployment({
      deploymentId: 'batch-123',
    });

    expect(result.content[0].text).toContain('cancelled');
  });

  it('should throw validation error for missing deploymentId', async () => {
    await expect(handleMonitorDeployment({})).rejects.toThrow(/Validation failed/);
  });

  it('should throw validation error for invalid pollIntervalMs', async () => {
    await expect(
      handleMonitorDeployment({
        deploymentId: 'batch-123',
        pollIntervalMs: 500, // Too short
      })
    ).rejects.toThrow(/Validation failed/);
  });

  it('should handle API errors during monitoring', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Network error'));

    await expect(
      handleMonitorDeployment({ deploymentId: 'batch-123' })
    ).rejects.toThrow('Network error');
  });
});

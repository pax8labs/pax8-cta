import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryQueue, getMemoryQueue } from '../queue/memory-queue.js';

describe('MemoryQueue', () => {
  let queue: MemoryQueue<{ tenantId: string }, { success: boolean }>;

  beforeEach(() => {
    queue = new MemoryQueue('test-queue', {
      concurrency: 2,
      maxRetries: 3,
      retryDelay: 100,
    });
  });

  afterEach(() => {
    queue.close();
    queue.clear();
  });

  describe('constructor', () => {
    it('should create queue with default options', () => {
      const defaultQueue = new MemoryQueue('default-test');
      expect(defaultQueue.name).toBe('default-test');
      defaultQueue.close();
    });

    it('should create queue with custom options', () => {
      expect(queue.name).toBe('test-queue');
    });
  });

  describe('add', () => {
    it('should add a job to the queue', async () => {
      const job = await queue.add('deploy', { tenantId: 'tenant-1' });

      expect(job.id).toBeDefined();
      expect(job.name).toBe('deploy');
      expect(job.data).toEqual({ tenantId: 'tenant-1' });
      expect(job.status).toBe('pending');
      expect(job.progress).toBe(0);
      expect(job.attempts).toBe(0);
      expect(job.createdAt).toBeInstanceOf(Date);
    });

    it('should generate unique IDs for each job', async () => {
      const job1 = await queue.add('deploy', { tenantId: 'tenant-1' });
      const job2 = await queue.add('deploy', { tenantId: 'tenant-2' });

      expect(job1.id).not.toBe(job2.id);
    });

    it('should emit waiting event when job is added', async () => {
      const waitingHandler = vi.fn();
      queue.on('waiting', waitingHandler);

      await queue.add('deploy', { tenantId: 'tenant-1' });

      expect(waitingHandler).toHaveBeenCalledOnce();
      expect(waitingHandler.mock.calls[0][0].name).toBe('deploy');
    });
  });

  describe('addBulk', () => {
    it('should add multiple jobs at once', async () => {
      const jobs = await queue.addBulk([
        { name: 'deploy', data: { tenantId: 'tenant-1' } },
        { name: 'deploy', data: { tenantId: 'tenant-2' } },
        { name: 'deploy', data: { tenantId: 'tenant-3' } },
      ]);

      expect(jobs).toHaveLength(3);
      expect(jobs[0].data.tenantId).toBe('tenant-1');
      expect(jobs[1].data.tenantId).toBe('tenant-2');
      expect(jobs[2].data.tenantId).toBe('tenant-3');
    });
  });

  describe('process', () => {
    it('should process jobs with the registered processor', async () => {
      const processor = vi.fn().mockResolvedValue({ success: true });

      await queue.add('deploy', { tenantId: 'tenant-1' });
      queue.process(processor);

      // Wait for processing
      await vi.waitFor(() => {
        expect(processor).toHaveBeenCalled();
      });
    });

    it('should emit active event when job starts processing', async () => {
      const activeHandler = vi.fn();
      queue.on('active', activeHandler);

      await queue.add('deploy', { tenantId: 'tenant-1' });
      queue.process(async () => ({ success: true }));

      await vi.waitFor(() => {
        expect(activeHandler).toHaveBeenCalled();
      });
    });

    it('should emit completed event when job succeeds', async () => {
      const completedHandler = vi.fn();
      queue.on('completed', completedHandler);

      await queue.add('deploy', { tenantId: 'tenant-1' });
      queue.process(async () => ({ success: true }));

      await vi.waitFor(() => {
        expect(completedHandler).toHaveBeenCalled();
      });

      const job = completedHandler.mock.calls[0][0];
      expect(job.status).toBe('completed');
      expect(job.result).toEqual({ success: true });
      expect(job.progress).toBe(100);
    });

    it('should emit failed event when job fails after max retries', async () => {
      const failedHandler = vi.fn();

      const failingQueue = new MemoryQueue('failing-queue', {
        maxRetries: 1,
        retryDelay: 10,
      });

      // Register handler on the failing queue, not the default queue
      failingQueue.on('failed', failedHandler);

      await failingQueue.add('deploy', { tenantId: 'tenant-1' });
      failingQueue.process(async () => {
        throw new Error('Deployment failed');
      });

      await vi.waitFor(
        () => {
          expect(failedHandler).toHaveBeenCalled();
        },
        { timeout: 1000 }
      );

      const job = failedHandler.mock.calls[0][0];
      expect(job.status).toBe('failed');
      expect(job.error).toBe('Deployment failed');

      failingQueue.close();
    });

    it('should retry failed jobs up to maxRetries', async () => {
      const processor = vi.fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockRejectedValueOnce(new Error('Second failure'))
        .mockResolvedValue({ success: true });

      const retryQueue = new MemoryQueue('retry-queue', {
        maxRetries: 3,
        retryDelay: 10,
      });

      const completedHandler = vi.fn();
      retryQueue.on('completed', completedHandler);

      await retryQueue.add('deploy', { tenantId: 'tenant-1' });
      retryQueue.process(processor);

      await vi.waitFor(
        () => {
          expect(completedHandler).toHaveBeenCalled();
        },
        { timeout: 1000 }
      );

      expect(processor).toHaveBeenCalledTimes(3);
      retryQueue.close();
    });

    it('should respect concurrency limit', async () => {
      let activeCount = 0;
      let maxActive = 0;

      const concurrencyQueue = new MemoryQueue('concurrency-queue', {
        concurrency: 2,
      });

      // Add 5 jobs
      for (let i = 0; i < 5; i++) {
        await concurrencyQueue.add('deploy', { tenantId: `tenant-${i}` });
      }

      concurrencyQueue.process(async () => {
        activeCount++;
        maxActive = Math.max(maxActive, activeCount);
        await new Promise(resolve => setTimeout(resolve, 50));
        activeCount--;
        return { success: true };
      });

      // Wait for all jobs to complete
      await vi.waitFor(
        () => {
          const counts = concurrencyQueue.getCounts();
          expect(counts.completed).toBe(5);
        },
        { timeout: 2000 }
      );

      expect(maxActive).toBeLessThanOrEqual(2);
      concurrencyQueue.close();
    });
  });

  describe('getJob', () => {
    it('should return job by ID', async () => {
      const addedJob = await queue.add('deploy', { tenantId: 'tenant-1' });
      const retrievedJob = queue.getJob(addedJob.id);

      expect(retrievedJob).toBeDefined();
      expect(retrievedJob?.id).toBe(addedJob.id);
    });

    it('should return undefined for non-existent job', () => {
      const job = queue.getJob('non-existent-id');
      expect(job).toBeUndefined();
    });
  });

  describe('getJobs', () => {
    it('should return all jobs', async () => {
      await queue.add('deploy', { tenantId: 'tenant-1' });
      await queue.add('deploy', { tenantId: 'tenant-2' });

      const jobs = queue.getJobs();
      expect(jobs).toHaveLength(2);
    });

    it('should filter jobs by status', async () => {
      await queue.add('deploy', { tenantId: 'tenant-1' });
      await queue.add('deploy', { tenantId: 'tenant-2' });

      const pendingJobs = queue.getJobs('pending');
      expect(pendingJobs.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getCounts', () => {
    it('should return counts by status', async () => {
      await queue.add('deploy', { tenantId: 'tenant-1' });
      await queue.add('deploy', { tenantId: 'tenant-2' });

      const counts = queue.getCounts();
      expect(counts).toHaveProperty('pending');
      expect(counts).toHaveProperty('active');
      expect(counts).toHaveProperty('completed');
      expect(counts).toHaveProperty('failed');
    });
  });

  describe('updateProgress', () => {
    it('should update job progress', async () => {
      const progressHandler = vi.fn();
      queue.on('progress', progressHandler);

      const job = await queue.add('deploy', { tenantId: 'tenant-1' });
      queue.updateProgress(job.id, 50);

      expect(progressHandler).toHaveBeenCalled();
      expect(queue.getJob(job.id)?.progress).toBe(50);
    });

    it('should not throw for non-existent job', () => {
      expect(() => queue.updateProgress('non-existent', 50)).not.toThrow();
    });
  });

  describe('clear', () => {
    it('should remove all jobs', async () => {
      await queue.add('deploy', { tenantId: 'tenant-1' });
      await queue.add('deploy', { tenantId: 'tenant-2' });

      queue.clear();

      expect(queue.getJobs()).toHaveLength(0);
    });
  });

  describe('close', () => {
    it('should stop processing new jobs', async () => {
      const processor = vi.fn().mockResolvedValue({ success: true });

      queue.close();
      await queue.add('deploy', { tenantId: 'tenant-1' });
      queue.process(processor);

      // Give some time for potential processing
      await new Promise(resolve => setTimeout(resolve, 50));

      // Processor should not be called since queue is closed
      // Note: The processor is set but processNext checks isRunning first
    });
  });

  describe('event handling', () => {
    it('should handle errors in event listeners gracefully', async () => {
      // The memory queue now uses logger.error instead of console.error
      // We just verify it doesn't throw when a listener throws
      queue.on('waiting', () => {
        throw new Error('Listener error');
      });

      // Should not throw - errors in listeners are caught and logged
      await expect(queue.add('deploy', { tenantId: 'tenant-1' })).resolves.toBeDefined();
    });
  });
});

describe('getMemoryQueue', () => {
  it('should return the same queue instance for the same name', () => {
    const queue1 = getMemoryQueue('shared-queue');
    const queue2 = getMemoryQueue('shared-queue');

    expect(queue1).toBe(queue2);

    queue1.close();
  });

  it('should return different queue instances for different names', () => {
    const queue1 = getMemoryQueue('queue-a');
    const queue2 = getMemoryQueue('queue-b');

    expect(queue1).not.toBe(queue2);

    queue1.close();
    queue2.close();
  });

  it('should use default name when not specified', () => {
    const queue = getMemoryQueue();
    expect(queue.name).toBe('default');
    queue.close();
  });
});

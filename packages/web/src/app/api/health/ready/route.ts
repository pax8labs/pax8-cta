import { NextResponse } from 'next/server';
import Redis from 'ioredis';
import { getDatabase } from '@/lib/db';
import { DeploymentQueueManager } from '@agentsync/worker';

export const dynamic = 'force-dynamic';

interface ReadinessCheck {
  name: string;
  status: 'healthy' | 'unhealthy';
  latency?: number;
  error?: string;
  details?: Record<string, any>;
}

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export async function GET() {
  const checks: ReadinessCheck[] = [];
  let allHealthy = true;

  // Check Redis connectivity
  const redisCheck = await checkRedis();
  checks.push(redisCheck);
  if (redisCheck.status === 'unhealthy') {
    allHealthy = false;
  }

  // Check database connectivity
  const dbCheck = await checkDatabase();
  checks.push(dbCheck);
  if (dbCheck.status === 'unhealthy') {
    allHealthy = false;
  }

  // Check worker availability
  const workerCheck = await checkWorkers();
  checks.push(workerCheck);
  if (workerCheck.status === 'unhealthy') {
    allHealthy = false;
  }

  return NextResponse.json(
    {
      status: allHealthy ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: allHealthy ? 200 : 503 }
  );
}

async function checkRedis(): Promise<ReadinessCheck> {
  const start = Date.now();

  try {
    const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 1,
      connectTimeout: 5000,
      lazyConnect: true,
    });

    await redis.connect();
    await redis.ping();
    await redis.quit();

    return {
      name: 'redis',
      status: 'healthy',
      latency: Date.now() - start,
    };
  } catch (error) {
    return {
      name: 'redis',
      status: 'unhealthy',
      latency: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function checkDatabase(): Promise<ReadinessCheck> {
  const start = Date.now();

  try {
    const db = getDatabase();

    // Test read capability with a simple query
    const result = db.prepare('SELECT 1 as health_check').get() as { health_check: number };

    if (result.health_check !== 1) {
      throw new Error('Database returned unexpected result');
    }

    // Test write capability with a transaction (verifies not read-only)
    db.prepare('BEGIN').run();
    db.prepare('ROLLBACK').run();

    return {
      name: 'database',
      status: 'healthy',
      latency: Date.now() - start,
    };
  } catch (error) {
    return {
      name: 'database',
      status: 'unhealthy',
      latency: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function checkWorkers(): Promise<ReadinessCheck> {
  const start = Date.now();
  let queueManager: DeploymentQueueManager | null = null;

  try {
    queueManager = new DeploymentQueueManager(REDIS_URL);
    const workerInfo = await queueManager.getWorkerInfo();
    await queueManager.close();

    // System is unhealthy if no workers are running
    if (workerInfo.activeWorkers === 0) {
      return {
        name: 'workers',
        status: 'unhealthy',
        latency: Date.now() - start,
        error: 'No active workers found',
        details: {
          activeWorkers: 0,
          waitingJobs: workerInfo.waitingJobs,
        },
      };
    }

    return {
      name: 'workers',
      status: 'healthy',
      latency: Date.now() - start,
      details: {
        activeWorkers: workerInfo.activeWorkers,
        activeJobs: workerInfo.activeJobs,
        waitingJobs: workerInfo.waitingJobs,
      },
    };
  } catch (error) {
    // Clean up connection on error
    if (queueManager) {
      try {
        await queueManager.close();
      } catch {
        // Ignore cleanup errors
      }
    }

    return {
      name: 'workers',
      status: 'unhealthy',
      latency: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

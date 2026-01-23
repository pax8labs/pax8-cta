import { NextResponse } from 'next/server';
import Redis from 'ioredis';

export const dynamic = 'force-dynamic';

interface ReadinessCheck {
  name: string;
  status: 'healthy' | 'unhealthy';
  latency?: number;
  error?: string;
}

export async function GET() {
  const checks: ReadinessCheck[] = [];
  let allHealthy = true;

  // Check Redis connectivity
  const redisCheck = await checkRedis();
  checks.push(redisCheck);
  if (redisCheck.status === 'unhealthy') {
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

import { NextRequest, NextResponse } from 'next/server';
import { DeploymentQueueManager } from '@agentsync/worker';
import { isDemoMode, generateMockDeployment, DeploymentJob } from '@agentsync/core';

// Note: Next.js App Router doesn't support WebSocket directly.
// Using Server-Sent Events (SSE) for real-time updates.

export const dynamic = 'force-dynamic';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const POLL_INTERVAL = 2000; // 2 seconds

interface SSEMessage {
  type: 'connected' | 'status' | 'progress' | 'completed' | 'error' | 'heartbeat';
  deploymentId: string;
  timestamp: string;
  data?: DeploymentJob | { progress: number; message: string } | { error: string };
}

/**
 * Server-Sent Events endpoint for real-time deployment updates
 * GET /api/ws?deploymentId=xxx
 */
export async function GET(request: NextRequest) {
  const deploymentId = request.nextUrl.searchParams.get('deploymentId');

  if (!deploymentId) {
    return NextResponse.json({ error: 'deploymentId is required' }, { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let queueManager: DeploymentQueueManager | null = null;
      let lastStatus: string | null = null;
      let lastCompletedCount = 0;

      const sendMessage = (message: SSEMessage) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(message)}\n\n`));
        } catch {
          // Controller may be closed
        }
      };

      // Send initial connection message
      sendMessage({
        type: 'connected',
        deploymentId,
        timestamp: new Date().toISOString(),
      });

      // Initialize queue manager for non-demo mode
      if (!isDemoMode()) {
        try {
          queueManager = new DeploymentQueueManager(REDIS_URL);
        } catch (error) {
          sendMessage({
            type: 'error',
            deploymentId,
            timestamp: new Date().toISOString(),
            data: { error: 'Failed to connect to Redis' },
          });
        }
      }

      // Poll for updates
      const intervalId = setInterval(async () => {
        try {
          let deployment: DeploymentJob | null = null;

          if (isDemoMode()) {
            // Generate evolving demo deployment status
            const elapsed = Date.now() % 60000;
            const progress = Math.min(100, Math.floor(elapsed / 600));
            const isComplete = progress >= 100;

            deployment = generateMockDeployment({
              id: deploymentId,
              status: isComplete ? 'completed' : 'in_progress',
            });

            // Simulate progress in demo mode
            if (!isComplete) {
              sendMessage({
                type: 'progress',
                deploymentId,
                timestamp: new Date().toISOString(),
                data: {
                  progress,
                  message: `Deploying to tenants... ${progress}%`,
                },
              });
            }
          } else if (queueManager) {
            deployment = await queueManager.getDeploymentStatus(deploymentId);
          }

          if (deployment) {
            const currentCompletedCount = deployment.tenantResults.filter(
              r => r.status === 'completed' || r.status === 'failed'
            ).length;

            // Only send update if status changed or new tenants completed
            if (deployment.status !== lastStatus || currentCompletedCount !== lastCompletedCount) {
              lastStatus = deployment.status;
              lastCompletedCount = currentCompletedCount;

              sendMessage({
                type: deployment.status === 'completed' || deployment.status === 'failed'
                  ? 'completed'
                  : 'status',
                deploymentId,
                timestamp: new Date().toISOString(),
                data: deployment,
              });

              // If deployment is complete, we can stop polling
              if (deployment.status === 'completed' || deployment.status === 'failed') {
                clearInterval(intervalId);
                if (queueManager) {
                  await queueManager.close();
                }
                controller.close();
                return;
              }
            }
          } else {
            // Send heartbeat if no deployment found
            sendMessage({
              type: 'heartbeat',
              deploymentId,
              timestamp: new Date().toISOString(),
            });
          }
        } catch (error) {
          console.error('SSE polling error:', error);
          sendMessage({
            type: 'error',
            deploymentId,
            timestamp: new Date().toISOString(),
            data: { error: error instanceof Error ? error.message : 'Unknown error' },
          });
        }
      }, POLL_INTERVAL);

      // Cleanup on client disconnect
      request.signal.addEventListener('abort', async () => {
        clearInterval(intervalId);
        if (queueManager) {
          try {
            await queueManager.close();
          } catch {
            // Ignore cleanup errors
          }
        }
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}

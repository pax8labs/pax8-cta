/**
 * Redis/Queue Error Handler
 * Centralized error handling for DeploymentQueueManager operations
 */

import { NextResponse } from 'next/server'

/**
 * Check if an error is related to Redis connection failures
 */
export function isRedisConnectionError(error: unknown): boolean {
  const errorMessage = error instanceof Error ? error.message : String(error)
  return (
    errorMessage.includes('ECONNREFUSED') ||
    errorMessage.includes('ENOTFOUND') ||
    errorMessage.includes('Redis') ||
    errorMessage.includes('Connection refused') ||
    (error as any)?.code === 'ECONNREFUSED'
  )
}

/**
 * Create a standardized 503 response for queue unavailability
 */
export function createQueueUnavailableResponse(error: unknown): NextResponse {
  const errorMessage = error instanceof Error ? error.message : String(error)

  return NextResponse.json(
    {
      error: 'Deployment queue unavailable. Please try again in a few moments.',
      code: 'QUEUE_UNAVAILABLE',
      details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
    },
    { status: 503 }
  )
}

/**
 * Safely close a queue manager, ignoring errors
 */
export async function safelyCloseQueueManager(
  queueManager: { close: () => Promise<void> } | null
): Promise<void> {
  if (!queueManager) return

  try {
    await queueManager.close()
  } catch {
    // Ignore close errors - connection likely already dead
  }
}

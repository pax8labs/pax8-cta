/**
 * Copyright 2024 Pax8 Labs
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Redis/Queue Error Handler
 * Centralized error handling for DeploymentQueueManager operations
 */

import { NextResponse } from "next/server";

/**
 * Check if an error is related to Redis connection failures
 */
export function isRedisConnectionError(error: unknown): boolean {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return (
    errorMessage.includes("ECONNREFUSED") ||
    errorMessage.includes("ENOTFOUND") ||
    errorMessage.includes("Redis") ||
    errorMessage.includes("Connection refused") ||
    (error as any)?.code === "ECONNREFUSED"
  );
}

/**
 * Create a standardized 503 response for queue unavailability
 */
export function createQueueUnavailableResponse(error: unknown): NextResponse {
  const errorMessage = error instanceof Error ? error.message : String(error);

  return NextResponse.json(
    {
      error: "Deployment queue unavailable. Please try again in a few moments.",
      code: "QUEUE_UNAVAILABLE",
      details: process.env.NODE_ENV === "development" ? errorMessage : undefined,
    },
    { status: 503 }
  );
}

/**
 * Safely close a queue manager, ignoring errors
 */
export async function safelyCloseQueueManager(
  queueManager: { close: () => Promise<void> } | null
): Promise<void> {
  if (!queueManager) return;

  try {
    await queueManager.close();
  } catch {
    // Ignore close errors - connection likely already dead
  }
}

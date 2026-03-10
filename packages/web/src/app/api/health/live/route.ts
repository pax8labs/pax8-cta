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

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Liveness health check endpoint
 *
 * Used by Kubernetes/orchestrators to determine if the application is alive
 * and should continue running. This check should ONLY fail if the app needs
 * to be restarted (e.g., deadlock, catastrophic failure).
 *
 * Unlike the readiness check (/api/health/ready), this does NOT check:
 * - Redis connectivity (temporary network issues shouldn't trigger restart)
 * - Database connectivity (temporary issues shouldn't trigger restart)
 * - Worker availability (workers might be down but web should stay up)
 *
 * This endpoint only verifies the Node.js process is responsive and
 * can handle requests.
 */
export async function GET() {
  try {
    // Basic liveness check - if we can respond, we're alive
    // Check Node.js event loop is responsive
    const startTime = Date.now();

    // Verify process can schedule async operations
    await new Promise((resolve) => setImmediate(resolve));

    const responseTime = Date.now() - startTime;

    // If event loop is severely delayed (>1s), might indicate deadlock
    if (responseTime > 1000) {
      return NextResponse.json(
        {
          status: "unhealthy",
          reason: "Event loop severely delayed",
          responseTime,
          timestamp: new Date().toISOString(),
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      status: "alive",
      uptime: process.uptime(),
      memoryUsage: {
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
      },
      responseTime,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    // If we can't even respond to this simple check, we're not alive
    return NextResponse.json(
      {
        status: "dead",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}

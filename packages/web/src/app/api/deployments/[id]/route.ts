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

import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { DeploymentQueueManager } from "@agentsync/worker";
import { isDemoMode } from "@agentsync/core";
import { resolveDeployment } from "@/lib/demo-store";
import { requireAuth, logAuthFailure } from "@/lib/api-middleware";
import { notFound, internalError } from "@/lib/errors";
import {
  isRedisConnectionError,
  createQueueUnavailableResponse,
  safelyCloseQueueManager,
} from "@/lib/queue-error-handler";
import { createLogger } from "@/lib/logger";

const logger = createLogger("deployment-detail");

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  // Require authentication to view deployment details
  const session = await requireAuth();
  if (session instanceof NextResponse) {
    logAuthFailure(undefined, `/api/deployments/${params.id}`, "unauthorized");
    return session;
  }

  try {
    // Use demo data if DEMO_MODE is enabled
    if (isDemoMode()) {
      // Resolve deployment from store or generate for historical demo IDs
      const deployment = resolveDeployment(params.id);

      if (!deployment) {
        return notFound("deployment", params.id);
      }

      return NextResponse.json({
        demoMode: true,
        ...deployment,
      });
    }

    // Handle Redis connection failures gracefully
    let queueManager: DeploymentQueueManager | null = null;
    try {
      queueManager = new DeploymentQueueManager(REDIS_URL);

      const deployment = await queueManager.getDeploymentStatus(params.id);

      await queueManager.close();

      if (!deployment) {
        return notFound("deployment", params.id);
      }

      return NextResponse.json({
        demoMode: false,
        ...deployment,
      });
    } catch (error) {
      // Ensure queue manager is closed even on error
      await safelyCloseQueueManager(queueManager);

      // Check if this is a Redis connection error
      if (isRedisConnectionError(error)) {
        logger.error("Redis connection failed", { error, deploymentId: params.id });
        return createQueueUnavailableResponse(error);
      }

      // Re-throw non-Redis errors to outer catch
      throw error;
    }
  } catch (error) {
    logger.error("Deployment detail error", error as Error);
    return internalError(
      "Failed to load deployment",
      process.env.NODE_ENV === "development" && error instanceof Error
        ? { error: error.message }
        : undefined
    );
  }
}

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
import { loadConfig, SchedulerService } from "@agentsync/core";
import { DeploymentQueueManager } from "@agentsync/worker";
import { resolve } from "path";
import { requireAuth, requireRoles, logAuthFailure } from "@/lib/api-middleware";
import { AppRoles } from "@/lib/auth";
import { invalidRequest, internalError } from "@/lib/errors";
import {
  isRedisConnectionError,
  createQueueUnavailableResponse,
  safelyCloseQueueManager,
} from "@/lib/queue-error-handler";
import { createLogger } from "@/lib/logger";

const logger = createLogger("schedules");

export const dynamic = "force-dynamic";

const CONFIG_PATH = process.env.CONFIG_PATH || "./config/tenants.yaml";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

/**
 * GET /api/schedules - Get scheduled deployment info
 * Requires authentication
 */
export async function GET() {
  // Require authentication to view schedules
  const session = await requireAuth();
  if (session instanceof NextResponse) {
    logAuthFailure(undefined, "/api/schedules", "unauthorized");
    return session;
  }

  try {
    const config = await loadConfig(resolve(CONFIG_PATH));
    const scheduler = new SchedulerService();

    // Get registered schedules from Redis if available
    let registeredSchedules: Array<{
      id: string;
      name: string;
      cron: string;
      timezone: string;
      nextRun: string | null;
    }> = [];

    let queueManager: DeploymentQueueManager | null = null;
    try {
      queueManager = new DeploymentQueueManager(REDIS_URL);
      const schedules = await queueManager.listScheduledDeployments();
      registeredSchedules = schedules.map((s) => ({
        id: s.id,
        name: s.name,
        cron: s.cron,
        timezone: s.timezone,
        nextRun: s.nextRun?.toISOString() || null,
      }));
      await queueManager.close();
    } catch (error) {
      // Ensure queue manager is closed even on error
      await safelyCloseQueueManager(queueManager);

      // Log Redis connection errors
      if (isRedisConnectionError(error)) {
        logger.warn("Redis not available for scheduled deployments list", { error });
      }
      // Redis may not be available (e.g., in Vercel) - continue without registered schedules
    }

    if (!config.settings?.schedule) {
      return NextResponse.json({
        enabled: false,
        message: "No schedule configured",
        registeredSchedules,
      });
    }

    const schedule = config.settings.schedule;
    const nextRuns = scheduler.getNextRuns(schedule, 5);
    const isInWindow = scheduler.isWithinMaintenanceWindow(schedule);
    const cronDescription = schedule.cron ? scheduler.describeCron(schedule.cron) : null;

    return NextResponse.json({
      enabled: true,
      cron: schedule.cron,
      cronDescription,
      timezone: schedule.timezone || "UTC",
      maintenanceWindow: schedule.maintenanceWindow,
      isCurrentlyInWindow: isInWindow,
      nextRuns: nextRuns.map((d) => d.toISOString()),
      registeredSchedules,
    });
  } catch (error) {
    logger.error("Schedules error", error as Error);
    return internalError(
      "Failed to load schedule configuration",
      process.env.NODE_ENV === "development" && error instanceof Error
        ? { error: error.message }
        : undefined
    );
  }
}

/**
 * POST /api/schedules - Register schedules with the worker queue
 * Body: { solutionPath: string, solutionName: string }
 *
 * This endpoint syncs schedules from config to BullMQ repeatable jobs.
 * Should be called after config changes or on worker startup.
 * Requires Admin or Deployer role
 */
export async function POST(request: NextRequest) {
  // Require Admin or Deployer role to create schedules
  const session = await requireRoles([AppRoles.ADMIN, AppRoles.DEPLOYER]);
  if (session instanceof NextResponse) {
    logAuthFailure(undefined, "/api/schedules", "forbidden", { action: "create_schedule" });
    return session;
  }
  try {
    const body = await request.json();
    const { solutionPath, solutionName } = body;

    if (!solutionPath || !solutionName) {
      return invalidRequest("solutionPath and solutionName are required");
    }

    const config = await loadConfig(resolve(CONFIG_PATH));

    // Connect to Redis and register schedules - handle Redis connection failures gracefully
    let queueManager: DeploymentQueueManager | null = null;
    try {
      queueManager = new DeploymentQueueManager(REDIS_URL);

      const result = await queueManager.registerScheduledDeploymentsFromConfig(
        config,
        resolve(solutionPath),
        solutionName
      );

      // Get the list of registered schedules
      const registeredSchedules = await queueManager.listScheduledDeployments();

      await queueManager.close();

      return NextResponse.json({
        success: true,
        registered: result.registered,
        errors: result.errors,
        schedules: registeredSchedules.map((s) => ({
          id: s.id,
          name: s.name,
          cron: s.cron,
          timezone: s.timezone,
          nextRun: s.nextRun?.toISOString() || null,
        })),
      });
    } catch (error) {
      // Ensure queue manager is closed even on error
      await safelyCloseQueueManager(queueManager);

      // Check if this is a Redis connection error
      if (isRedisConnectionError(error)) {
        logger.error("Redis connection failed during schedule registration", { error });
        return createQueueUnavailableResponse(error);
      }

      // Re-throw non-Redis errors to outer catch
      throw error;
    }
  } catch (error) {
    logger.error("Register schedules error", error as Error);
    return internalError(
      "Failed to register schedules",
      process.env.NODE_ENV === "development" && error instanceof Error
        ? { error: error.message }
        : undefined
    );
  }
}

/**
 * DELETE /api/schedules - Remove all registered schedules
 * Requires Admin role
 */
export async function DELETE() {
  // Require Admin role to delete schedules
  const session = await requireRoles([AppRoles.ADMIN]);
  if (session instanceof NextResponse) {
    logAuthFailure(undefined, "/api/schedules", "forbidden", { action: "delete_schedules" });
    return session;
  }

  try {
    // Handle Redis connection failures gracefully
    let queueManager: DeploymentQueueManager | null = null;
    try {
      queueManager = new DeploymentQueueManager(REDIS_URL);

      const removed = await queueManager.removeAllScheduledDeployments();

      await queueManager.close();

      return NextResponse.json({
        success: true,
        removed,
      });
    } catch (error) {
      // Ensure queue manager is closed even on error
      await safelyCloseQueueManager(queueManager);

      // Check if this is a Redis connection error
      if (isRedisConnectionError(error)) {
        logger.error("Redis connection failed during schedule removal", { error });
        return createQueueUnavailableResponse(error);
      }

      // Re-throw non-Redis errors to outer catch
      throw error;
    }
  } catch (error) {
    logger.error("Remove schedules error", error as Error);
    return internalError(
      "Failed to remove schedules",
      process.env.NODE_ENV === "development" && error instanceof Error
        ? { error: error.message }
        : undefined
    );
  }
}

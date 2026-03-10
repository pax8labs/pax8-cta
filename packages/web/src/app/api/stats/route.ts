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
import {
  loadConfig,
  isDemoMode,
  DEMO_CONFIG,
  generateMockDeploymentHistory,
  DEPLOYMENT_STATUS_CATEGORIES,
} from "@agentsync/core";
import { DeploymentQueueManager } from "@agentsync/worker";
import { resolve } from "path";
import { demoDeployments } from "@/lib/demo-store";
import { requireAuth, logAuthFailure } from "@/lib/api-middleware";
import { getDatabase } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { internalError } from "@/lib/errors";
import {
  isRedisConnectionError,
  createQueueUnavailableResponse,
  safelyCloseQueueManager,
} from "@/lib/queue-error-handler";

const logger = createLogger("StatsAPI");

export const dynamic = "force-dynamic";

const CONFIG_PATH = process.env.CONFIG_PATH || "./config/tenants.yaml";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

/**
 * Get health check statistics from database
 */
function getHealthStats(): { versionDriftCount: number; dependencyIssuesCount: number } {
  try {
    const db = getDatabase();

    // Get latest health check per tenant
    const results = db
      .prepare(
        `
      SELECT
        tenant_id,
        version_drift,
        dependencies_healthy
      FROM health_check_results
      WHERE id IN (
        SELECT MAX(id)
        FROM health_check_results
        GROUP BY tenant_id
      )
    `
      )
      .all() as Array<{
      tenant_id: string;
      version_drift: number;
      dependencies_healthy: number;
    }>;

    logger.debug("Found tenant health records", { count: results.length });

    const versionDriftCount = results.filter((r) => r.version_drift === 1).length;
    const dependencyIssuesCount = results.filter((r) => r.dependencies_healthy === 0).length;

    logger.debug("Health stats calculated", { versionDriftCount, dependencyIssuesCount });

    return { versionDriftCount, dependencyIssuesCount };
  } catch (error) {
    console.error("[getHealthStats] ERROR:", error);
    return { versionDriftCount: 0, dependencyIssuesCount: 0 };
  }
}

export async function GET() {
  // Require authentication to view stats
  const session = await requireAuth();
  if (session instanceof NextResponse) {
    logAuthFailure(undefined, "/api/stats", "unauthorized");
    return session;
  }

  try {
    // Use demo data if DEMO_MODE is enabled
    if (isDemoMode()) {
      const totalTenants = DEMO_CONFIG.tenants.length;
      const enabledTenants = DEMO_CONFIG.tenants.filter((t) => t.enabled !== false).length;

      // Get live deployments from the store
      const liveDeployments = Array.from(demoDeployments.values());
      const liveIds = new Set(liveDeployments.map((d) => d.id));

      // Generate mock history to include in stats (same logic as /api/deployments)
      // Use 100 to match the limit used on the deployments page
      // Adjust mock history count based on live deployments to ensure consistent total
      const historyCount = Math.max(0, 100 - liveDeployments.length);
      const mockHistory = generateMockDeploymentHistory(historyCount).filter(
        (h) => !liveIds.has(h.id)
      );

      // Combine all deployments for stat calculation, sorted and limited to 100
      const allDeployments = [...liveDeployments, ...mockHistory]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 100);

      // Extract unique tenant-agent records (same logic as deployments page)
      // This ensures dashboard stats match the deployments page counts
      const seen = new Set<string>();
      const records: Array<{ status: string; updatedAt: string }> = [];

      // Sort newest first to keep most recent record per tenant-agent pair
      const sorted = [...allDeployments].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      for (const deployment of sorted) {
        for (const result of deployment.tenantResults || []) {
          const key = `${result.tenantId}-${deployment.solutionName}`;
          if (!seen.has(key)) {
            seen.add(key);
            records.push({
              status: result.status,
              updatedAt: result.completedAt || result.startedAt || deployment.createdAt,
            });
          }
        }
      }

      // Calculate today's date at midnight
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayTimestamp = today.getTime();

      // Calculate stats using centralized status categories from @agentsync/core
      let activeDeployments = 0;
      let completedToday = 0;

      for (const record of records) {
        // Active = completed or in_progress (uses DEPLOYMENT_STATUS_CATEGORIES.ACTIVE)
        if ((DEPLOYMENT_STATUS_CATEGORIES.ACTIVE as readonly string[]).includes(record.status)) {
          activeDeployments++;
        }

        // Completed today
        if (record.status === "completed") {
          const updatedAt = new Date(record.updatedAt).getTime();
          if (updatedAt >= todayTimestamp) {
            completedToday++;
          }
        }
      }

      // Count batches with any failures (matches Issues filter on deployments page)
      // This counts batches, not unique tenant-agent pairs, because the Issues tab shows batches
      const FAILED_STATUSES = DEPLOYMENT_STATUS_CATEGORIES.FAILED as readonly string[];
      const batchesWithFailures = allDeployments.filter((d) =>
        d.tenantResults?.some((r) => FAILED_STATUSES.includes(r.status))
      ).length;

      // Get health check stats
      const healthStats = getHealthStats();

      return NextResponse.json({
        demoMode: true,
        totalTenants,
        enabledTenants,
        activeDeployments,
        completedToday,
        batchesWithFailures,
        scheduledDeployments: 0,
        pendingApprovals: 0,
        versionDriftCount: healthStats.versionDriftCount,
        dependencyIssuesCount: healthStats.dependencyIssuesCount,
      });
    }

    // Load tenant count from config
    let totalTenants = 0;
    try {
      const config = await loadConfig(resolve(CONFIG_PATH));
      totalTenants = config.tenants.filter((t) => t.enabled).length;
    } catch {
      // Config might not exist yet
    }

    // Get deployment stats from queue - handle Redis connection failures gracefully
    let queueManager: DeploymentQueueManager | null = null;
    try {
      queueManager = new DeploymentQueueManager(REDIS_URL);

      // Get all jobs to calculate stats
      const jobs = await queueManager
        .getTenantDeploymentQueue()
        .getJobs(["completed", "failed", "active", "waiting"]);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayTimestamp = today.getTime();

      // Group jobs by deployment ID
      const deploymentIds = new Set(jobs.map((j) => j.data.deploymentId));

      let activeDeployments = 0;
      let completedToday = 0;
      let batchesWithFailures = 0;

      for (const deploymentId of deploymentIds) {
        const deployment = await queueManager.getDeploymentStatus(deploymentId);
        if (!deployment) continue;

        if (deployment.status === "in_progress" || deployment.status === "pending") {
          activeDeployments++;
        }

        if (
          deployment.status === "completed" &&
          new Date(deployment.updatedAt).getTime() >= todayTimestamp
        ) {
          completedToday++;
        }

        // Count batches that have any failed tenant results
        const FAILED_STATUSES = DEPLOYMENT_STATUS_CATEGORIES.FAILED as readonly string[];
        if (deployment.tenantResults?.some((r) => FAILED_STATUSES.includes(r.status))) {
          batchesWithFailures++;
        }
      }

      // Get scheduled deployments count
      const scheduledDeployments = (await queueManager.listScheduledDeployments()).length;

      await queueManager.close();

      return NextResponse.json({
        demoMode: false,
        totalTenants,
        activeDeployments,
        completedToday,
        batchesWithFailures,
        scheduledDeployments,
      });
    } catch (error) {
      // Ensure queue manager is closed even on error
      await safelyCloseQueueManager(queueManager);

      // Check if this is a Redis connection error
      if (isRedisConnectionError(error)) {
        logger.error("Redis connection failed", { error });
        return createQueueUnavailableResponse(error);
      }

      // Re-throw non-Redis errors to outer catch
      throw error;
    }
  } catch (error) {
    logger.error("Stats error", error as Error);
    return internalError(
      "Failed to load stats",
      process.env.NODE_ENV === "development" && error instanceof Error
        ? { error: error.message }
        : undefined
    );
  }
}

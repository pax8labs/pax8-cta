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

import chalk from "chalk";
import Table from "cli-table3";
import { generateMockDeploymentHistory, DeploymentJob, DeploymentStatus } from "@agentsync/core";
import { isDemoModeEnabled } from "../demo.js";
import {
  formatStatus,
  formatTimeAgo,
  formatDuration,
  truncate,
  truncateId,
} from "../../lib/formatters.js";

// ============================================================================
// Data fetching
// ============================================================================

export async function getDeployments(_options: {
  status?: string;
  tenant?: string;
  agent?: string;
  limit?: string;
  since?: string;
}): Promise<DeploymentJob[]> {
  if (isDemoModeEnabled()) {
    console.log(chalk.yellow("\n⚠️  DEMO MODE - Using mock data\n"));
    // Generate more deployments for demo
    return generateMockDeploymentHistory(50);
  }

  // Production mode - would call API or read from queue
  // For now, show message about requiring API
  throw new Error(
    "Production mode requires API connection.\n" +
      "Start the web dashboard (see README for setup) or enable demo mode with 'agentsync demo on'"
  );
}

export async function getDeploymentById(id: string): Promise<DeploymentJob | null> {
  if (isDemoModeEnabled()) {
    const history = generateMockDeploymentHistory(50);
    return history.find((d) => d.id === id) || null;
  }

  // Production mode - would call API
  throw new Error(
    "Production mode requires API connection.\n" +
      "Start the web dashboard (see README for setup) or enable demo mode with 'agentsync demo on'"
  );
}

// ============================================================================
// Filtering
// ============================================================================

export function filterDeployments(
  deployments: DeploymentJob[],
  options: {
    status?: string;
    tenant?: string;
    agent?: string;
    since?: string;
  }
): DeploymentJob[] {
  let filtered = [...deployments];

  // Filter by status
  if (options.status) {
    const status = options.status.toLowerCase() as DeploymentStatus;
    filtered = filtered.filter((d) => d.status === status);
  }

  // Filter by agent/solution name
  if (options.agent) {
    const agentName = options.agent.toLowerCase();
    filtered = filtered.filter((d) => d.solutionName.toLowerCase().includes(agentName));
  }

  // Filter by tenant (check tenant results)
  if (options.tenant) {
    const tenantQuery = options.tenant.toLowerCase();
    filtered = filtered.filter((d) =>
      d.tenantResults?.some(
        (t) =>
          t.tenantName.toLowerCase().includes(tenantQuery) ||
          t.tenantId.toLowerCase().includes(tenantQuery)
      )
    );
  }

  // Filter by date
  if (options.since) {
    const sinceDate = parseDateFilter(options.since);
    if (sinceDate) {
      filtered = filtered.filter((d) => new Date(d.createdAt) >= sinceDate);
    }
  }

  // Sort by created date (newest first)
  filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return filtered;
}

export function parseDateFilter(value: string): Date | null {
  // Try relative format (7d, 24h, 30m)
  const relativeMatch = value.match(/^(\d+)([dhm])$/);
  if (relativeMatch) {
    const amount = parseInt(relativeMatch[1], 10);
    const unit = relativeMatch[2];
    const now = new Date();

    switch (unit) {
      case "d":
        return new Date(now.getTime() - amount * 24 * 60 * 60 * 1000);
      case "h":
        return new Date(now.getTime() - amount * 60 * 60 * 1000);
      case "m":
        return new Date(now.getTime() - amount * 60 * 1000);
    }
  }

  // Try ISO format
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

// ============================================================================
// Output formatting
// ============================================================================

export function outputJson(
  deployments: DeploymentJob[],
  total: number,
  limit: number,
  offset: number
): void {
  const output = {
    deployments: deployments.map((d) => ({
      id: d.id,
      solutionName: d.solutionName,
      solutionVersion: d.solutionVersion,
      status: d.status,
      totalTenants: d.totalTenants,
      completedTenants: d.completedTenants,
      failedTenants: d.failedTenants,
      triggeredBy: d.triggeredBy,
      createdAt: d.createdAt,
      completedAt: d.completedAt,
    })),
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + deployments.length < total,
    },
  };

  console.log(JSON.stringify(output, null, 2));
}

export function outputTable(
  deployments: DeploymentJob[],
  total: number,
  limit: number,
  offset: number
): void {
  if (deployments.length === 0) {
    console.log(chalk.yellow("No deployments found matching your criteria."));
    return;
  }

  const table = new Table({
    head: ["ID", "Agent", "Version", "Status", "Progress", "Triggered", "Created"],
    style: { head: ["cyan"] },
  });

  deployments.forEach((d) => {
    const progress = `${d.completedTenants}/${d.totalTenants}`;
    const progressWithFailed =
      d.failedTenants > 0 ? `${progress} (${chalk.red(d.failedTenants + " failed")})` : progress;

    table.push([
      chalk.cyan(truncateId(d.id)),
      d.solutionName,
      d.solutionVersion || "-",
      formatStatus(d.status),
      progressWithFailed,
      d.triggeredBy || "-",
      formatTimeAgo(d.createdAt),
    ]);
  });

  console.log(table.toString());
  console.log();

  // Pagination info
  const showing = `Showing ${offset + 1}-${offset + deployments.length} of ${total}`;
  console.log(chalk.gray(showing));

  if (offset + deployments.length < total) {
    console.log(chalk.gray(`Use --offset ${offset + limit} to see more`));
  }
}

export function outputDeploymentDetails(deployment: DeploymentJob): void {
  console.log(chalk.bold("📦 Deployment Details"));
  console.log("─".repeat(60));
  console.log(`  ID:           ${chalk.cyan(deployment.id)}`);
  console.log(`  Agent:        ${deployment.solutionName}`);
  console.log(`  Version:      ${deployment.solutionVersion || "-"}`);
  console.log(`  Status:       ${formatStatus(deployment.status)}`);
  console.log(`  Progress:     ${deployment.completedTenants}/${deployment.totalTenants} tenants`);
  if (deployment.failedTenants > 0) {
    console.log(`  Failed:       ${chalk.red(deployment.failedTenants.toString())}`);
  }
  console.log(`  Triggered by: ${deployment.triggeredBy || "-"}`);
  console.log(`  Created:      ${formatTimeAgo(deployment.createdAt)}`);
  if (deployment.completedAt) {
    console.log(`  Completed:    ${formatTimeAgo(deployment.completedAt)}`);
  }
  if (deployment.durationMs) {
    console.log(`  Duration:     ${formatDuration(deployment.durationMs)}`);
  }
  console.log();

  // Tenant results
  if (deployment.tenantResults && deployment.tenantResults.length > 0) {
    console.log(chalk.bold("Tenant Results"));
    console.log("─".repeat(60));

    const table = new Table({
      head: ["Tenant", "Status", "Duration", "Error"],
      style: { head: ["cyan"] },
      colWidths: [22, 14, 10, 30],
      wordWrap: true,
    });

    deployment.tenantResults
      .sort((a, b) => {
        const order: Record<string, number> = {
          in_progress: 0,
          pending: 1,
          completed: 2,
          failed: 3,
        };
        return (order[a.status] ?? 5) - (order[b.status] ?? 5);
      })
      .forEach((result) => {
        const duration =
          result.startedAt && result.completedAt
            ? formatDuration(
                new Date(result.completedAt).getTime() - new Date(result.startedAt).getTime()
              )
            : "-";

        table.push([
          truncate(result.tenantName, 20),
          formatStatus(result.status),
          duration,
          result.error ? chalk.red(truncate(result.error, 27)) : "-",
        ]);
      });

    console.log(table.toString());
  }
}

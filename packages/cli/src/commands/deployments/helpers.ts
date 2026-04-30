/**
 * Copyright 2024 Pax8, Inc.
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

import { resolve } from "node:path";
import chalk from "chalk";
import Table from "cli-table3";
import {
  generateMockDeploymentHistory,
  DeploymentJob,
  loadConfig,
  TokenManager,
  DataverseClient,
  SolutionOperations,
  type SolutionHistoryRecord,
} from "@agentsync/core";
import { isDemo } from "../../lib/command-wrapper.js";
import { formatCommandExample } from "../../lib/spinner.js";
import { getClientSecretWithFallback } from "../../lib/credentials.js";
import {
  formatStatus,
  formatTimeAgo,
  formatDuration,
  truncate,
  truncateId,
} from "../../lib/formatters.js";

// ============================================================================
// Unified history record (works for both real and demo data)
// ============================================================================

export interface HistoryEntry {
  id: string;
  solutionName: string;
  solutionVersion: string;
  operation: string; // "Import", "Uninstall", "Export"
  status: string; // "completed", "failed", "in_progress"
  success: boolean;
  startTime: string;
  endTime: string | null;
  durationSeconds: number | null;
  isManaged: boolean;
  error: string | null;
  environment: string; // tenant name or environment URL
  publisher: string | null;
}

const OPERATION_NAMES: Record<number, string> = {
  0: "Import",
  1: "Uninstall",
  2: "Export",
  3: "Publish",
};

function mapHistoryRecord(record: SolutionHistoryRecord, environmentName: string): HistoryEntry {
  return {
    id: record.msdyn_solutionhistoryid,
    solutionName: record.msdyn_name,
    solutionVersion: record.msdyn_solutionversion || "-",
    operation: OPERATION_NAMES[record.msdyn_operation] || `Op:${record.msdyn_operation}`,
    status:
      record.msdyn_status === 1 ? (record.msdyn_result ? "completed" : "failed") : "in_progress",
    success: record.msdyn_result,
    startTime: record.msdyn_starttime,
    endTime: record.msdyn_endtime,
    durationSeconds: record.msdyn_totaltime,
    isManaged: record.msdyn_ismanaged,
    error: record.msdyn_exceptionmessage,
    environment: environmentName,
    publisher: record.msdyn_publishername,
  };
}

// ============================================================================
// Data fetching
// ============================================================================

export interface GetHistoryOptions {
  config?: string;
  tenant?: string;
  agent?: string;
  status?: string;
  limit?: string;
  since?: string;
  json?: boolean;
}

export async function getDeploymentHistory(options: GetHistoryOptions): Promise<HistoryEntry[]> {
  const configPath = resolve(process.cwd(), options.config || "./config/tenants.yaml");
  const config = await loadConfig(configPath);
  const clientSecret = await getClientSecretWithFallback();

  // Determine which environments to query
  const environments: Array<{ name: string; environmentUrl: string; tenantId: string }> = [];

  if (options.tenant) {
    const tenant = config.tenants.find(
      (t) =>
        t.name.toLowerCase() === options.tenant!.toLowerCase() ||
        t.tenantId.toLowerCase() === options.tenant!.toLowerCase()
    );
    if (tenant) {
      environments.push({
        name: tenant.name,
        environmentUrl: tenant.environmentUrl,
        tenantId: tenant.tenantId,
      });
    }
  } else {
    // Query all enabled tenants + source
    if (config.source?.environmentUrl) {
      environments.push({
        name: "source",
        environmentUrl: config.source.environmentUrl,
        tenantId: config.source.tenantId || config.partner.tenantId,
      });
    }
    for (const t of config.tenants.filter((t) => t.enabled)) {
      environments.push({
        name: t.name,
        environmentUrl: t.environmentUrl,
        tenantId: t.tenantId,
      });
    }
  }

  if (environments.length === 0) {
    return [];
  }

  const limit = parseInt(options.limit || "50", 10);
  const allEntries: HistoryEntry[] = [];

  // Query each environment in parallel
  const results = await Promise.allSettled(
    environments.map(async (env) => {
      const tokenManager = new TokenManager({
        tenantId: env.tenantId,
        clientId: config.partner.clientId,
        clientSecret,
      });

      const dataverseClient = new DataverseClient({
        environmentUrl: env.environmentUrl,
        tokenManager,
      });

      const solutionOps = new SolutionOperations(dataverseClient);
      const records = await solutionOps.getSolutionHistory({
        solutionName: options.agent,
        operation: "import",
        limit,
      });

      return records.map((r) => mapHistoryRecord(r, env.name));
    })
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      allEntries.push(...result.value);
    }
    // Silently skip environments that fail (auth issues, etc.)
  }

  // Sort by start time descending
  allEntries.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

  return allEntries;
}

export async function getDeploymentHistoryById(
  id: string,
  options: GetHistoryOptions
): Promise<HistoryEntry | null> {
  const entries = await getDeploymentHistory({ ...options, limit: "200" });
  return entries.find((e) => e.id === id) || null;
}

// ============================================================================
// Legacy demo-mode functions (kept for demo mode compatibility)
// ============================================================================

export async function getDeployments(_options: GetHistoryOptions): Promise<DeploymentJob[]> {
  if (isDemo()) {
    console.error(chalk.yellow("\n⚠️  DEMO MODE - Using mock data\n"));
    return generateMockDeploymentHistory(50);
  }

  // Not used in production anymore — getDeploymentHistory is used instead
  throw new Error("Use getDeploymentHistory for production mode");
}

export async function getDeploymentById(id: string): Promise<DeploymentJob | null> {
  if (isDemo()) {
    const history = generateMockDeploymentHistory(50);
    return history.find((d) => d.id === id) || null;
  }

  throw new Error("Use getDeploymentHistoryById for production mode");
}

// ============================================================================
// Filtering
// ============================================================================

export function filterHistory(
  entries: HistoryEntry[],
  options: { status?: string; since?: string }
): HistoryEntry[] {
  let filtered = [...entries];

  if (options.status) {
    const status = options.status.toLowerCase();
    filtered = filtered.filter((e) => e.status === status);
  }

  if (options.since) {
    const sinceDate = parseDateFilter(options.since);
    if (sinceDate) {
      filtered = filtered.filter((e) => new Date(e.startTime) >= sinceDate);
    }
  }

  return filtered;
}

export function filterDeployments(
  deployments: DeploymentJob[],
  options: { status?: string; tenant?: string; agent?: string; since?: string }
): DeploymentJob[] {
  let filtered = [...deployments];

  if (options.status) {
    filtered = filtered.filter((d) => d.status === options.status!.toLowerCase());
  }
  if (options.agent) {
    const name = options.agent.toLowerCase();
    filtered = filtered.filter((d) => d.solutionName.toLowerCase().includes(name));
  }
  if (options.tenant) {
    const q = options.tenant.toLowerCase();
    filtered = filtered.filter((d) =>
      d.tenantResults?.some(
        (t) => t.tenantName.toLowerCase().includes(q) || t.tenantId.toLowerCase().includes(q)
      )
    );
  }
  if (options.since) {
    const sinceDate = parseDateFilter(options.since);
    if (sinceDate) {
      filtered = filtered.filter((d) => new Date(d.createdAt) >= sinceDate);
    }
  }

  filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return filtered;
}

export function parseDateFilter(value: string): Date | null {
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
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

// ============================================================================
// Output formatting — history entries (real data)
// ============================================================================

export function outputHistoryJson(
  entries: HistoryEntry[],
  total: number,
  limit: number,
  offset: number
): void {
  console.log(
    JSON.stringify(
      {
        deployments: entries,
        pagination: { total, limit, offset, hasMore: offset + entries.length < total },
      },
      null,
      2
    )
  );
}

export function outputHistoryTable(
  entries: HistoryEntry[],
  total: number,
  limit: number,
  offset: number
): void {
  if (entries.length === 0) {
    console.log(chalk.yellow("No solution history found."));
    console.log(
      chalk.gray("Deploy a solution first: " + formatCommandExample("deploy TestDeploy --all"))
    );
    return;
  }

  const table = new Table({
    head: ["Solution", "Version", "Operation", "Status", "Duration", "Environment", "When"],
    style: { head: ["cyan"] },
  });

  entries.forEach((e) => {
    const statusStr =
      e.status === "completed"
        ? chalk.green("Success")
        : e.status === "failed"
          ? chalk.red("Failed")
          : chalk.yellow("In Progress");

    const duration = e.durationSeconds != null ? formatDuration(e.durationSeconds * 1000) : "-";

    table.push([
      truncate(e.solutionName, 25),
      e.solutionVersion,
      e.operation,
      statusStr,
      duration,
      truncate(e.environment, 20),
      formatTimeAgo(e.startTime),
    ]);
  });

  console.log(table.toString());
  console.log();

  const showing = `Showing ${offset + 1}-${offset + entries.length} of ${total}`;
  console.log(chalk.gray(showing));

  if (offset + entries.length < total) {
    console.log(chalk.gray(`Use --offset ${offset + limit} to see more`));
  }
}

export function outputHistoryDetails(entry: HistoryEntry): void {
  console.log(chalk.bold("Solution History Details"));
  console.log("─".repeat(60));
  console.log(`  Solution:      ${entry.solutionName}`);
  console.log(`  Version:       ${entry.solutionVersion}`);
  console.log(`  Operation:     ${entry.operation}`);
  console.log(`  Status:        ${entry.success ? chalk.green("Success") : chalk.red("Failed")}`);
  console.log(`  Environment:   ${entry.environment}`);
  console.log(`  Managed:       ${entry.isManaged ? "Yes" : "No"}`);
  if (entry.publisher) {
    console.log(`  Publisher:     ${entry.publisher}`);
  }
  console.log(`  Started:       ${new Date(entry.startTime).toLocaleString()}`);
  if (entry.endTime) {
    console.log(`  Ended:         ${new Date(entry.endTime).toLocaleString()}`);
  }
  if (entry.durationSeconds != null) {
    console.log(`  Duration:      ${formatDuration(entry.durationSeconds * 1000)}`);
  }
  if (entry.error) {
    console.log();
    console.log(chalk.red(`  Error: ${entry.error}`));
  }
  console.log();
}

// ============================================================================
// Legacy output formatting — DeploymentJob (demo mode)
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
    pagination: { total, limit, offset, hasMore: offset + deployments.length < total },
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

  const showing = `Showing ${offset + 1}-${offset + deployments.length} of ${total}`;
  console.log(chalk.gray(showing));
  if (offset + deployments.length < total) {
    console.log(chalk.gray(`Use --offset ${offset + limit} to see more`));
  }
}

export function outputDeploymentDetails(deployment: DeploymentJob): void {
  console.log(chalk.bold("Deployment Details"));
  console.log("─".repeat(60));
  console.log(`  ID:           ${chalk.cyan(deployment.id)}`);
  console.log(`  Solution:     ${deployment.solutionName}`);
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

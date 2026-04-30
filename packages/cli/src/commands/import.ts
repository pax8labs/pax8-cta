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

import { Command } from "commander";
import { resolve, join } from "node:path";
import { existsSync, readdirSync, statSync } from "node:fs";
import chalk from "chalk";
import { createSpinner, formatCommandExample } from "../lib/spinner.js";
import {
  loadConfig,
  findTenant,
  TokenManager,
  DataverseClient,
  SolutionOperations,
} from "@agentsync/core";
import { getClientSecretWithFallback } from "../lib/credentials.js";
import { CliError, handleCommandError } from "../lib/errors.js";

export const importCommand = new Command("import")
  .description("Import a solution zip file into a single tenant environment")
  .argument("[solution]", "Path to solution zip file")
  .option("-s, --solution <path>", "Path to solution zip (alternative to argument)")
  .option("--agentPackage <path>", "Alias for --solution")
  .requiredOption("-t, --tenant <name>", "Target tenant name or ID")
  .option("--destination <id>", "Alias for --tenant")
  .option("-c, --config <path>", "Path to config file", "./config/tenants.yaml")
  .option("--no-overwrite", "Do not overwrite existing customizations")
  .option("--no-publish", "Do not activate workflows after import")
  .addHelpText(
    "after",
    `
Examples:
  agentsync import ./TestDeploy.zip -t AgentSync-Test2      Import to a specific tenant
  agentsync import ./TestDeploy.zip -t AgentSync-Test2 --no-publish
`
  )
  .action(async (solutionArg: string | undefined, options) => {
    if (solutionArg && !options.solution) options.solution = solutionArg;
    const spinner = createSpinner("Loading configuration...").start();

    try {
      // Load config
      const configPath = resolve(process.cwd(), options.config);
      const config = await loadConfig(configPath);

      // Find target tenant (destination) by ID, name, or environment URL
      const destinationId = options.destination || options.tenant;
      const destination = findTenant(config, destinationId);
      if (!destination) {
        throw new CliError(
          `Destination '${destinationId}' not found in manifest. Run '${formatCommandExample("tenants list")}' to see available tenants.`
        );
      }
      spinner.succeed(`Manifest loaded - Destination: ${destination.name}`);

      // Get client secret
      spinner.start("Establishing shipping route...");
      const clientSecret = await getClientSecretWithFallback();

      // Create token manager for the customer tenant
      const tokenManager = new TokenManager({
        tenantId: destination.tenantId,
        clientId: config.partner.clientId,
        clientSecret,
      });

      const dataverseClient = new DataverseClient({
        environmentUrl: destination.environmentUrl,
        tokenManager,
      });

      const solutionOps = new SolutionOperations(dataverseClient);
      spinner.succeed(`Route established to ${destination.name}`);

      // Import solution (deliver agent package)
      const agentPackagePath = resolveAgentPackage(options.agentPackage || options.solution);
      spinner.start(`Delivering agent package to ${destination.name}...`);

      const importJobId = await solutionOps.importSolutionAsync(agentPackagePath, {
        overwriteUnmanagedCustomizations: options.overwrite !== false,
        publishWorkflows: options.publish !== false,
      });

      spinner.text = `Delivery in progress (Tracking: ${importJobId}), unloading...`;

      // Wait for import with progress
      const result = await solutionOps.waitForImport(importJobId, {
        pollIntervalMs: 3000,
        timeoutMs: 300000,
        onProgress: (progress) => {
          spinner.text = `Unloading at ${destination.name}... ${progress}%`;
        },
      });

      if (result.success) {
        spinner.succeed(
          chalk.green(`📦 Agent package delivered successfully to ${destination.name}`)
        );
      } else {
        const errorMsg =
          result.error || "Unknown error - check solution compatibility and permissions";
        throw new CliError(`Delivery failed: ${errorMsg}`);
      }
    } catch (error) {
      handleCommandError(error, spinner, "Delivery failed");
    }
  });

/**
 * Resolve a solution argument to an actual file path.
 * If the argument looks like an explicit path (contains / or .zip), resolve it directly.
 * Otherwise, treat it as a solution name and search "agent packages/" for the
 * most recent matching zip.
 */
function resolveAgentPackage(input: string): string {
  // If it looks like an explicit file path, resolve directly (let downstream handle missing)
  if (input.includes("/") || input.includes("\\") || input.endsWith(".zip")) {
    return resolve(input);
  }

  // Check if the exact name exists as a file (unlikely but handle it)
  const direct = resolve(input);
  if (existsSync(direct)) return direct;

  // Treat as solution name — search "agent packages/" for matching zips
  const agentPackagesDir = resolve(process.cwd(), "agent packages");
  if (existsSync(agentPackagesDir)) {
    const matches = readdirSync(agentPackagesDir)
      .filter((f) => f.startsWith(input) && f.endsWith(".zip"))
      .map((f) => ({
        name: f,
        path: join(agentPackagesDir, f),
        mtime: statSync(join(agentPackagesDir, f)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime);

    if (matches.length > 0) {
      return matches[0].path;
    }
  }

  throw new CliError(
    `Solution '${input}' not found.\nNo matching zips in 'agent packages/'.\nTip: Export first with '${formatCommandExample(`export ${input}`)}', then retry.`
  );
}

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

import { Command } from "commander";
import { resolve } from "node:path";
import chalk from "chalk";
import ora from "ora";
import {
  loadConfig,
  findTenant,
  TokenManager,
  DataverseClient,
  SolutionOperations,
} from "@agentsync/core";
import { getClientSecretWithFallback } from "../lib/credentials.js";

export const importCommand = new Command("import")
  .alias("deliver")
  .description("Import an agent package to a single tenant (for testing)")
  .requiredOption("-s, --solution <path>", "Path to agent package (solution zip)")
  .option("--agentPackage <path>", "Alias for --solution")
  .requiredOption("-t, --tenant <id>", "Destination tenant ID")
  .option("--destination <id>", "Alias for --tenant")
  .option("-c, --config <path>", "Path to manifest file", "./config/tenants.yaml")
  .option("--no-overwrite", "Do not overwrite existing customizations")
  .option("--no-publish", "Do not activate workflows after delivery")
  .action(async (options) => {
    const spinner = ora("Loading shipping manifest...").start();

    try {
      // Load config
      const configPath = resolve(process.cwd(), options.config);
      const config = await loadConfig(configPath);

      // Find target tenant (destination) by ID, name, or environment URL
      const destinationId = options.destination || options.tenant;
      const destination = findTenant(config, destinationId);
      if (!destination) {
        throw new Error(`Destination '${destinationId}' not found in manifest`);
      }
      spinner.succeed(`Manifest loaded - Destination: ${destination.name}`);

      // Get client secret
      spinner.start("Establishing shipping route...");
      const clientSecret = await getClientSecretWithFallback("PARTNER_CLIENT_SECRET");

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
      const agentPackagePath = resolve(options.agentPackage || options.solution);
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
        spinner.fail(chalk.red(`Delivery failed: ${errorMsg}`));
        process.exit(1);
      }
    } catch (error) {
      spinner.fail(chalk.red("Delivery failed"));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

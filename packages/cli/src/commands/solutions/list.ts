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
import Table from "cli-table3";
import {
  loadConfig,
  getClientSecret,
  TokenManager,
  DataverseClient,
  SolutionOperations,
  isDemoMode as isDemoModeCore,
  DEMO_SOLUTIONS,
} from "@agentsync/core";
import { isDemoModeEnabled } from "../demo.js";

export const listCommand = new Command("list")
  .alias("ls")
  .description("List solutions in an environment")
  .option("-c, --config <path>", "Path to manifest file", "./config/tenants.yaml")
  .option("-t, --tenant <name>", "Tenant name or ID to query (defaults to source environment)")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const spinner = ora("Loading manifest...").start();

    try {
      // Check for demo mode
      if (isDemoModeEnabled() || isDemoModeCore()) {
        spinner.succeed(`Found ${DEMO_SOLUTIONS.length} solutions in demo environment`);
        console.log(chalk.yellow("\n⚠️  DEMO MODE - Using mock data\n"));

        const solutions = DEMO_SOLUTIONS;

        // JSON output
        if (options.json) {
          console.log(
            JSON.stringify(
              {
                solutions: solutions.map((s) => ({
                  uniqueName: s.uniqueName,
                  friendlyName: s.friendlyName,
                  version: s.version,
                  isManaged: s.isManaged,
                })),
                total: solutions.length,
              },
              null,
              2
            )
          );
          return;
        }

        console.log();

        const table = new Table({
          head: ["Solution", "Version", "Type", "Unique Name"],
          style: { head: ["cyan"] },
        });

        solutions.forEach((solution) => {
          table.push([
            solution.friendlyName,
            solution.version,
            solution.isManaged ? "Managed" : "Unmanaged",
            solution.uniqueName,
          ]);
        });

        console.log(table.toString());
        console.log();
        console.log(chalk.gray(`Total: ${solutions.length} solutions`));
        return;
      }

      // Load config
      const configPath = resolve(process.cwd(), options.config);
      const config = await loadConfig(configPath);
      spinner.succeed("Manifest loaded");

      // Get client secret
      spinner.start("Authenticating...");
      const clientSecret = getClientSecret();

      const tokenManager = new TokenManager({
        tenantId: config.partner.tenantId,
        clientId: config.partner.clientId,
        clientSecret,
      });

      // Determine which environment to query
      let environmentUrl: string;
      let environmentName: string;

      if (options.tenant) {
        // Find tenant by name or ID
        const tenant = config.tenants.find(
          (t) =>
            t.name.toLowerCase() === options.tenant.toLowerCase() ||
            t.tenantId.toLowerCase() === options.tenant.toLowerCase()
        );

        if (!tenant) {
          spinner.fail(chalk.red(`Tenant '${options.tenant}' not found in manifest`));
          process.exit(1);
        }

        environmentUrl = tenant.environmentUrl;
        environmentName = tenant.name;
      } else {
        // Use source environment
        environmentUrl = config.source.environmentUrl;
        environmentName = "source";
      }

      const dataverseClient = new DataverseClient({
        environmentUrl,
        tokenManager,
      });

      const solutionOps = new SolutionOperations(dataverseClient);
      spinner.succeed(`Connected to ${environmentName} environment`);

      // List solutions
      spinner.start("Querying solutions...");
      const solutions = await solutionOps.listSolutions();
      spinner.succeed(`Found ${solutions.length} solutions`);

      // JSON output
      if (options.json) {
        console.log(
          JSON.stringify(
            {
              environment: environmentName,
              solutions: solutions.map((s) => ({
                solutionId: s.solutionid,
                uniqueName: s.uniquename,
                friendlyName: s.friendlyname,
                version: s.version,
                isManaged: s.ismanaged,
              })),
              total: solutions.length,
            },
            null,
            2
          )
        );
        return;
      }

      console.log();

      const table = new Table({
        head: ["Solution", "Version", "Type", "Unique Name"],
        style: { head: ["cyan"] },
      });

      solutions.forEach((solution) => {
        table.push([
          solution.friendlyname,
          solution.version,
          solution.ismanaged ? "Managed" : "Unmanaged",
          solution.uniquename,
        ]);
      });

      console.log(table.toString());
      console.log();
      console.log(
        chalk.gray(`Total: ${solutions.length} solutions in ${environmentName} environment`)
      );
    } catch (error) {
      spinner.fail(chalk.red("Failed to list solutions"));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

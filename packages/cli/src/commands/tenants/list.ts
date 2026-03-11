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
import { loadConfig, isDemoMode as isDemoModeCore, DEMO_TENANTS } from "@agentsync/core";
import { isDemoModeEnabled } from "../demo.js";

export const listCommand = new Command("list")
  .alias("ls")
  .description("List all destinations in your fleet")
  .option("-c, --config <path>", "Path to manifest file", "./config/tenants.yaml")
  .option("-t, --tag <tags...>", "Filter by tags")
  .option("-s, --search <query>", "Search by name, ID, or environment URL")
  .option("--status <status>", "Filter by status (enabled|disabled|all)", "all")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const spinner = ora("Loading fleet manifest...").start();

    try {
      // Check for demo mode (CLI config or environment variable)
      if (isDemoModeEnabled() || isDemoModeCore()) {
        spinner.succeed(`Loaded ${DEMO_TENANTS.length} destinations from demo fleet`);
        console.log(chalk.yellow("\n⚠️  DEMO MODE - Using mock data\n"));

        let destinations = [...DEMO_TENANTS];

        // Apply search filter
        if (options.search) {
          const q = options.search.toLowerCase();
          destinations = destinations.filter(
            (t) =>
              t.name.toLowerCase().includes(q) ||
              t.tenantId.toLowerCase().includes(q) ||
              t.environmentUrl.toLowerCase().includes(q)
          );
        }

        // Apply tag filter
        if (options.tag && options.tag.length > 0) {
          destinations = destinations.filter((t) =>
            options.tag.every((tag: string) => t.tags?.includes(tag))
          );
        }

        // Apply status filter
        if (options.status === "enabled") {
          destinations = destinations.filter((t) => t.enabled);
        } else if (options.status === "disabled") {
          destinations = destinations.filter((t) => !t.enabled);
        }

        // JSON output
        if (options.json) {
          console.log(
            JSON.stringify(
              {
                tenants: destinations,
                total: destinations.length,
                active: destinations.filter((t) => t.enabled).length,
              },
              null,
              2
            )
          );
          return;
        }

        console.log();

        const table = new Table({
          head: ["Destination", "Tenant ID", "Port (Environment)", "Tags", "Active"],
          style: { head: ["cyan"] },
        });

        destinations.forEach((tenant) => {
          table.push([
            tenant.name,
            tenant.tenantId.slice(0, 8) + "...",
            tenant.environmentUrl,
            tenant.tags?.join(", ") || "-",
            tenant.enabled ? chalk.green("Yes") : chalk.red("No"),
          ]);
        });

        console.log(table.toString());
        console.log();

        // Show filter info if applicable
        const filterInfo: string[] = [];
        if (options.search) filterInfo.push(`matching "${options.search}"`);
        if (options.tag?.length) filterInfo.push(`with tags: ${options.tag.join(" AND ")}`);
        if (options.status !== "all") filterInfo.push(`status: ${options.status}`);

        if (filterInfo.length > 0) {
          console.log(chalk.gray(`${destinations.length} tenants ${filterInfo.join(", ")}`));
        } else {
          console.log(
            chalk.gray(
              `Fleet size: ${destinations.length} destinations (${DEMO_TENANTS.filter((t) => t.enabled).length} active)`
            )
          );
        }
        return;
      }

      // Real mode - load config
      const configPath = resolve(process.cwd(), options.config);
      const config = await loadConfig(configPath);
      spinner.succeed(`Loaded ${config.tenants.length} destinations from manifest`);

      let destinations = [...config.tenants];

      // Apply search filter
      if (options.search) {
        const q = options.search.toLowerCase();
        destinations = destinations.filter(
          (t) =>
            t.name.toLowerCase().includes(q) ||
            t.tenantId.toLowerCase().includes(q) ||
            t.environmentUrl.toLowerCase().includes(q)
        );
      }

      // Apply tag filter
      if (options.tag && options.tag.length > 0) {
        destinations = destinations.filter((t) =>
          options.tag.every((tag: string) => t.tags?.includes(tag))
        );
      }

      // Apply status filter
      if (options.status === "enabled") {
        destinations = destinations.filter((t) => t.enabled);
      } else if (options.status === "disabled") {
        destinations = destinations.filter((t) => !t.enabled);
      }

      // JSON output
      if (options.json) {
        console.log(
          JSON.stringify(
            {
              tenants: destinations,
              total: destinations.length,
              active: destinations.filter((t) => t.enabled).length,
            },
            null,
            2
          )
        );
        return;
      }

      console.log();

      const table = new Table({
        head: ["Destination", "Tenant ID", "Port (Environment)", "Tags", "Active"],
        style: { head: ["cyan"] },
      });

      destinations.forEach((tenant) => {
        table.push([
          tenant.name,
          tenant.tenantId.slice(0, 8) + "...",
          tenant.environmentUrl,
          tenant.tags?.join(", ") || "-",
          tenant.enabled ? chalk.green("Yes") : chalk.red("No"),
        ]);
      });

      console.log(table.toString());
      console.log();
      console.log(
        chalk.gray(
          `Fleet size: ${destinations.length} destinations (${config.tenants.filter((t) => t.enabled).length} active)`
        )
      );
    } catch (error) {
      spinner.fail(chalk.red("Failed to load fleet manifest"));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

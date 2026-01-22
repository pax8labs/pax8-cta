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
import chalk from "chalk";
import ora from "ora";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createInterface } from "node:readline/promises";

const DEFAULT_CONFIG_PATH = "./config/tenants.yaml";

export const initCommand = new Command("init")
  .description("Initialize AgentSync with guided setup")
  .option("-c, --config <path>", "Path to create manifest file", DEFAULT_CONFIG_PATH)
  .option("--demo", "Set up in demo mode (skip credential prompts)")
  .action(async (options) => {
    console.log(chalk.cyan.bold("\n🚀 AgentSync Setup Wizard\n"));

    if (options.demo) {
      // Demo mode setup
      console.log(chalk.yellow("Setting up in DEMO MODE..."));
      console.log(chalk.gray("You can explore AgentSync features without credentials.\n"));

      const spinner = ora("Enabling demo mode...").start();

      // Enable demo mode
      const { saveCliConfig } = await import("./demo.js");
      saveCliConfig({ demoMode: true });

      spinner.succeed("Demo mode enabled");

      console.log();
      console.log(chalk.green("✓ Setup complete!"));
      console.log();
      console.log(chalk.cyan("Try these commands:"));
      console.log(chalk.gray("  agentsync fleet list          ") + chalk.dim("# View demo fleet"));
      console.log(chalk.gray("  agentsync --help             ") + chalk.dim("# See all commands"));
      console.log();
      console.log(chalk.dim("To switch to production mode later: agentsync demo off"));
      return;
    }

    // Production setup
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      console.log(chalk.white("Let's set up your Partner Center credentials.\n"));

      // Partner Tenant ID
      const partnerTenantId = await rl.question(
        chalk.cyan("Partner Tenant ID: ") + chalk.gray("(from Partner Center)\n> ")
      );

      // Partner Client ID
      const partnerClientId = await rl.question(
        chalk.cyan("\nApp Registration Client ID: ") + chalk.gray("(Azure AD App)\n> ")
      );

      // Client Secret info
      console.log();
      console.log(chalk.yellow("⚠️  Client Secret"));
      console.log(chalk.gray("For security, store your client secret in an environment variable:"));
      console.log(chalk.white("  export AGENTSYNC_CLIENT_SECRET=\"your-secret-here\""));
      console.log();

      // Ask about sample tenants
      const wantSample = await rl.question(
        chalk.cyan("Include sample tenant configuration? ") + chalk.gray("(y/n)\n> ")
      );

      rl.close();

      // Create config
      const spinner = ora("Creating configuration...").start();

      const configPath = resolve(options.config);
      const configDir = dirname(configPath);

      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
      }

      const includeSample = wantSample.toLowerCase() === "y" || wantSample.toLowerCase() === "yes";

      const configContent = `# AgentSync Configuration File

# Partner/MSP Credentials
partner:
  tenantId: "${partnerTenantId}"
  clientId: "${partnerClientId}"
  # Client secret should be in AGENTSYNC_CLIENT_SECRET env var

# Settings
settings:
  approval:
    required: false
    minApprovals: 1
    timeout: "24h"
    approvers:
      - admin@partner.com

# Your Tenants
tenants:${
  includeSample
    ? `
  # Sample tenant - replace with your actual tenants
  - tenantId: "00000000-0000-0000-0000-000000000000"
    name: "Sample Client"
    environmentUrl: "https://sample.crm.dynamics.com"
    enabled: true
    tags:
      - production
      - enterprise`
    : `
  # Add your tenants here:
  # - tenantId: "tenant-guid-here"
  #   name: "Client Name"
  #   environmentUrl: "https://client.crm.dynamics.com"
  #   enabled: true
  #   tags:
  #     - production`
}
`;

      writeFileSync(configPath, configContent);
      spinner.succeed(`Configuration created at ${configPath}`);

      console.log();
      console.log(chalk.green("✓ Setup complete!"));
      console.log();
      console.log(chalk.cyan("Next steps:"));
      console.log(chalk.gray("  1. Set your client secret:"));
      console.log(chalk.white("     export AGENTSYNC_CLIENT_SECRET=\"your-secret\""));
      console.log();
      console.log(chalk.gray("  2. Add your tenant destinations to:"));
      console.log(chalk.white(`     ${configPath}`));
      console.log();
      console.log(chalk.gray("  3. Verify GDAP access:"));
      console.log(chalk.white("     agentsync fleet inspect"));
      console.log();
      console.log(chalk.dim("Or explore in demo mode first: agentsync demo on"));
    } catch (error) {
      console.error(chalk.red("\n✖ Setup failed"));
      if (error instanceof Error) {
        console.error(chalk.red(error.message));
      }
      process.exit(1);
    }
  });

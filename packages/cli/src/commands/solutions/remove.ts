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
import { resolve } from "node:path";
import chalk from "chalk";
import { createSpinner, isQuietMode } from "../../lib/spinner.js";
import {
  DEMO_TENANTS,
  loadConfig,
  TokenManager,
  DataverseClient,
  SolutionOperations,
  type TenantConfig,
} from "@agentsync/core";
import { getClientSecretWithFallback } from "../../lib/credentials.js";
import { question } from "../../lib/input.js";
import { handleCommandError } from "../../lib/errors.js";
import { isDemo } from "../../lib/command-wrapper.js";
import { resolveFormat } from "../../lib/output.js";
import { showDemoBanner } from "../../lib/demo-banner.js";
import { findTenantMatches } from "../tenants/helpers.js";

export const removeCommand = new Command("remove")
  .alias("uninstall")
  .argument("<solution>", "Solution unique name to remove (e.g., TestDeploy)")
  .description("Uninstall a managed solution from a target environment")
  .requiredOption("-t, --tenant <name>", "Target tenant name or ID")
  .option("-c, --config <path>", "Path to config file", "./config/tenants.yaml")
  .option("-y, --yes", "Skip confirmation prompt")
  .option("--json", "Output as JSON")
  .option("--quiet", "Suppress all output (exit code only)")
  .addHelpText(
    "after",
    `
Examples:
  solutions remove TestDeploy -t AgentSync-Test2       Uninstall with confirmation
  solutions remove TestDeploy -t AgentSync-Test2 -y    Uninstall without confirmation
`
  )
  .action(async (solutionName: string, options, cmd) => {
    // Merge global flags (--json, --quiet) registered on root program.
    Object.assign(options, cmd.optsWithGlobals());

    const spinner = createSpinner("Loading configuration...").start();

    try {
      // Issue #385: in demo mode, simulate the removal so the command works
      // without ./config/tenants.yaml or real Dataverse credentials.
      if (isDemo()) {
        await runDemoRemove(spinner, solutionName, options);
        return;
      }

      const configPath = resolve(process.cwd(), options.config);
      const config = await loadConfig(configPath);

      const tenant = config.tenants.find(
        (t) =>
          t.name.toLowerCase() === options.tenant.toLowerCase() ||
          t.tenantId.toLowerCase() === options.tenant.toLowerCase()
      );

      if (!tenant) {
        spinner.fail(chalk.red(`Tenant '${options.tenant}' not found in config`));
        process.exit(1);
      }

      spinner.succeed(`Target: ${tenant.name} (${tenant.environmentUrl})`);

      // Confirm unless --yes
      if (!options.yes) {
        console.log();
        console.log(
          chalk.yellow(
            `  This will uninstall '${solutionName}' and remove all its components from ${tenant.name}.`
          )
        );
        const confirm = await question(chalk.red("  Are you sure? ") + chalk.gray("(yes/no) "));
        if (confirm.toLowerCase() !== "yes" && confirm.toLowerCase() !== "y") {
          console.log(chalk.gray("  Cancelled."));
          return;
        }
      }

      spinner.start("Authenticating...");
      const clientSecret = await getClientSecretWithFallback();
      const tokenManager = new TokenManager({
        tenantId: config.partner.tenantId,
        clientId: config.partner.clientId,
        clientSecret,
      });

      const dataverseClient = new DataverseClient({
        environmentUrl: tenant.environmentUrl,
        tokenManager,
      });

      const solutionOps = new SolutionOperations(dataverseClient);

      spinner.start(`Uninstalling '${solutionName}' from ${tenant.name}...`);
      await solutionOps.deleteSolution(solutionName);
      spinner.succeed(chalk.green(`Uninstalled '${solutionName}' from ${tenant.name}`));
    } catch (error) {
      handleCommandError(error, spinner, "Failed to remove solution");
    }
  });

/**
 * Demo-mode removal — looks up the requested tenant in DEMO_TENANTS and prints
 * what *would* happen. Honors --json (machine-readable envelope) and --quiet
 * (zero output, exit 0).
 */
async function runDemoRemove(
  spinner: ReturnType<typeof createSpinner>,
  solutionName: string,
  options: { tenant: string; yes?: boolean; json?: boolean; quiet?: boolean }
): Promise<void> {
  const fmt = resolveFormat({ json: options.json, quiet: options.quiet });
  // Issue #402: reuse the same case-insensitive substring matching the rest of
  // the CLI uses for `-t <name>`, but also report ambiguous partial matches so
  // users don't get the wrong tenant silently chosen for them.
  const matches = findTenantMatches(DEMO_TENANTS, options.tenant);

  if (matches.length === 0) {
    spinner.fail(
      chalk.red(
        `No tenant matches '${options.tenant}'; run 'agentsync tenants list' to see available tenants.`
      )
    );
    process.exit(1);
  }

  if (matches.length > 1) {
    spinner.fail(chalk.red(`Tenant '${options.tenant}' is ambiguous. Did you mean:`));
    for (const candidate of matches) {
      console.error(chalk.gray(`  - ${candidate.name}`));
    }
    process.exit(1);
  }

  const tenant: TenantConfig = matches[0];

  spinner.succeed(`Target: ${tenant.name} (${tenant.environmentUrl})`);

  // In demo mode we skip the interactive prompt entirely — simulating real I/O
  // doesn't require destructive intent confirmation. Quiet/JSON callers (LLM
  // agents, scripts) wouldn't be able to answer the prompt anyway.
  if (fmt === "json") {
    console.log(
      JSON.stringify(
        {
          demo: true,
          action: "would-remove",
          solution: solutionName,
          tenant: { name: tenant.name, tenantId: tenant.tenantId },
          message: `Would uninstall '${solutionName}' from ${tenant.name}`,
        },
        null,
        2
      )
    );
    return;
  }

  if (fmt === "quiet") {
    return;
  }

  if (!isQuietMode()) {
    showDemoBanner();
  }
  console.log(
    chalk.gray(`  Would uninstall '${solutionName}' from ${tenant.name} (no real changes made).`)
  );
}

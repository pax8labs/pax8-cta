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
import { existsSync } from "node:fs";
import chalk from "chalk";
import { createSpinner } from "../lib/spinner.js";
import {
  loadConfig,
  TenantConfig,
  TokenManager,
  DataverseClient,
  ConfigError,
  GdapClient,
  parseAuthError,
  environmentSetupService,
} from "@agentsync/core";
import { getClientSecretWithFallback } from "../lib/credentials.js";
import { CliError } from "../lib/errors.js";

interface ValidationCheck {
  name: string;
  status: "pass" | "fail" | "warn";
  message: string;
  fix?: string;
}

export const validateCommand = new Command("validate")
  .description("Check that your config, credentials, and environments are working")
  .option("-c, --config <path>", "Path to config file", "./config/tenants.yaml")
  .option("-t, --tenant <name>", "Validate a specific tenant only")
  .option("--skip-source", "Skip source environment check")
  .option("--gdap", "Also check GDAP relationships and Power Platform Admin role")
  .addHelpText(
    "after",
    `
Examples:
  agentsync validate                              Check everything
  agentsync validate --gdap                       Also verify GDAP delegation
  agentsync validate -t AgentSync-Test2           Check a specific tenant
  agentsync validate --skip-source                Check only tenants, not source
`
  )
  .action(async (options) => {
    const checks: ValidationCheck[] = [];
    let hasErrors = false;

    // Check 1: Config file exists and is valid YAML
    const spinner = createSpinner("Validating configuration file...").start();
    const configPath = resolve(process.cwd(), options.config);

    if (!existsSync(configPath)) {
      checks.push({
        name: "Config file",
        status: "fail",
        message: `File not found: ${configPath}`,
        fix: "Run 'agentsync init' to create a configuration file",
      });
      hasErrors = true;
      spinner.fail("Configuration file not found");
      displayResults(checks);
      process.exit(1);
    }

    let config;
    let enabledTenants: TenantConfig[] = [];
    try {
      config = await loadConfig(configPath);
      enabledTenants = config.tenants.filter((t) => t.enabled);

      // Filter to specific tenant if requested
      if (options.tenant) {
        const tenant = enabledTenants.find(
          (t) => t.name.toLowerCase() === options.tenant.toLowerCase()
        );
        if (!tenant) {
          throw new CliError(
            `Tenant '${options.tenant}' not found in configuration or not enabled. Run 'agentsync tenants list' to see available tenants.`
          );
        }
        enabledTenants = [tenant];
      }

      checks.push({
        name: "Config file",
        status: "pass",
        message: `Valid (${enabledTenants.length} tenant${enabledTenants.length === 1 ? "" : "s"} configured)`,
      });
      spinner.succeed("Configuration file valid");
    } catch (error) {
      if (error instanceof CliError) {
        checks.push({
          name: "Config file",
          status: "fail",
          message: error.message,
        });
        hasErrors = true;
        spinner.fail(error.message);
        displayResults(checks);
        process.exit(error.exitCode);
      }

      const errorMsg = error instanceof ConfigError ? error.message : String(error);
      checks.push({
        name: "Config file",
        status: "fail",
        message: `Invalid: ${errorMsg}`,
        fix: "Check the YAML syntax and configuration schema",
      });
      hasErrors = true;
      spinner.fail("Configuration file invalid");
      displayResults(checks);
      process.exit(1);
    }

    // Check 2: Client secret is available
    spinner.text = "Checking client secret...";
    try {
      await getClientSecretWithFallback();
      checks.push({
        name: "Client secret",
        status: "pass",
        message: "Found (environment or keychain)",
      });
      spinner.succeed("Client secret found");
    } catch {
      checks.push({
        name: "Client secret",
        status: "fail",
        message: "Missing PARTNER_CLIENT_SECRET environment variable",
        fix: "Set PARTNER_CLIENT_SECRET environment variable with your app registration secret",
      });
      hasErrors = true;
      spinner.fail("Client secret missing");
      displayResults(checks);
      process.exit(1);
    }

    // Check 3: Validate each enabled tenant
    console.log();
    console.log(chalk.bold(`Validating ${enabledTenants.length} tenant(s)...`));
    console.log();

    for (const tenant of enabledTenants) {
      const tenantSpinner = createSpinner(`Checking ${tenant.name}...`).start();

      try {
        const clientSecret = await getClientSecretWithFallback();
        const tokenManager = new TokenManager({
          tenantId: tenant.tenantId,
          clientId: config.partner.clientId,
          clientSecret,
        });
        const client = new DataverseClient({
          environmentUrl: tenant.environmentUrl,
          tokenManager,
          clientId: config.partner.clientId,
        });
        const result = await environmentSetupService.validateTenant(
          client,
          config.partner.clientId
        );

        if (result.appUserExists && result.hasSystemAdminRole) {
          checks.push({
            name: `${tenant.name}`,
            status: "pass",
            message: "App user configured with System Administrator role",
          });
          tenantSpinner.succeed(chalk.green(`${tenant.name}: Ready`));
        } else if (!result.appUserExists) {
          checks.push({
            name: `${tenant.name}`,
            status: "fail",
            message: "App user not found in environment",
            fix: `Run 'agentsync setup --tenant "${tenant.name}"'`,
          });
          hasErrors = true;
          tenantSpinner.fail(chalk.red(`${tenant.name}: App user missing`));
        } else if (!result.hasSystemAdminRole) {
          checks.push({
            name: `${tenant.name}`,
            status: "fail",
            message: "App user exists but System Administrator role not assigned",
            fix: `Run 'agentsync setup --tenant "${tenant.name}"'`,
          });
          hasErrors = true;
          tenantSpinner.fail(chalk.red(`${tenant.name}: Missing System Administrator role`));
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const parsed = parseAuthError(errorMsg);

        checks.push({
          name: `${tenant.name}`,
          status: "fail",
          message: parsed.message,
          fix: parsed.fix,
        });
        hasErrors = true;
        tenantSpinner.fail(chalk.red(`${tenant.name}: ${parsed.message}`));
      }
    }

    // Check 4: GDAP relationships (if --gdap flag is set)
    if (options.gdap) {
      console.log();
      console.log(chalk.bold("Checking GDAP relationships..."));
      console.log();

      try {
        const clientSecret = await getClientSecretWithFallback();
        const gdapClient = new GdapClient({
          tenantId: config.partner.tenantId,
          clientId: config.partner.clientId,
          clientSecret: clientSecret,
        });

        const gdapSpinner = createSpinner("Fetching GDAP relationships...").start();
        let relationships;
        try {
          relationships = await gdapClient.listDelegatedAdminRelationships();
          gdapSpinner.succeed(
            `Found ${relationships.length} active GDAP relationship${relationships.length === 1 ? "" : "s"}`
          );
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          const parsed = parseAuthError(errorMsg);
          checks.push({
            name: "GDAP relationships",
            status: "fail",
            message: parsed.message,
            fix: parsed.fix,
          });
          hasErrors = true;
          gdapSpinner.fail(`GDAP check failed: ${parsed.message}`);
          relationships = null;
        }

        if (relationships) {
          for (const tenant of enabledTenants) {
            const tenantSpinner = createSpinner(`Checking GDAP for ${tenant.name}...`).start();

            const relationship = relationships.find(
              (rel) => rel.customer.tenantId === tenant.tenantId
            );

            if (!relationship) {
              checks.push({
                name: `GDAP: ${tenant.name}`,
                status: "fail",
                message: "No active GDAP relationship found",
                fix: `Set up a GDAP relationship with tenant ${tenant.tenantId} in Partner Center`,
              });
              hasErrors = true;
              tenantSpinner.fail(chalk.red(`${tenant.name}: No GDAP relationship`));
              continue;
            }

            if (relationship.status !== "active") {
              checks.push({
                name: `GDAP: ${tenant.name}`,
                status: "fail",
                message: `GDAP relationship is ${relationship.status}`,
                fix: `Renew the GDAP relationship in Partner Center (expires: ${relationship.endDateTime})`,
              });
              hasErrors = true;
              tenantSpinner.fail(chalk.red(`${tenant.name}: GDAP ${relationship.status}`));
              continue;
            }

            // Check for Power Platform Administrator role
            const powerPlatformAdminRoleId = "11648597-926c-4cf3-9c36-bcebb0ba8dcc";
            const hasPPAdmin = relationship.accessDetails.unifiedRoles.some(
              (role) => role.roleDefinitionId === powerPlatformAdminRoleId
            );

            if (!hasPPAdmin) {
              checks.push({
                name: `GDAP: ${tenant.name}`,
                status: "fail",
                message: "Missing Power Platform Administrator role",
                fix: "Add Power Platform Administrator role to the GDAP relationship in Partner Center",
              });
              hasErrors = true;
              tenantSpinner.fail(chalk.red(`${tenant.name}: Missing Power Platform Admin role`));
              continue;
            }

            // Check expiration (warn if within 30 days)
            const endDate = new Date(relationship.endDateTime);
            const daysUntilExpiry = Math.floor(
              (endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
            );

            if (daysUntilExpiry <= 30) {
              checks.push({
                name: `GDAP: ${tenant.name}`,
                status: "warn",
                message: `GDAP expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? "" : "s"} (${relationship.endDateTime})`,
                fix: "Renew the GDAP relationship in Partner Center before it expires",
              });
              tenantSpinner.warn(
                chalk.yellow(`${tenant.name}: GDAP expires in ${daysUntilExpiry} days`)
              );
            } else {
              checks.push({
                name: `GDAP: ${tenant.name}`,
                status: "pass",
                message: `Active with Power Platform Admin (expires in ${daysUntilExpiry} days)`,
              });
              tenantSpinner.succeed(
                chalk.green(`${tenant.name}: GDAP valid (${daysUntilExpiry}d remaining)`)
              );
            }
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        checks.push({
          name: "GDAP relationships",
          status: "fail",
          message: errorMsg,
          fix: "Ensure partner credentials are correct and Graph API permissions are granted",
        });
        hasErrors = true;
      }
    }

    // Check 5: Source environment (if configured and not skipped)
    if (!options.skipSource && config.source) {
      console.log();
      const sourceSpinner = createSpinner("Checking source environment...").start();

      try {
        const clientSecret = await getClientSecretWithFallback();
        const tokenManager = new TokenManager({
          tenantId: config.source.tenantId,
          clientId: config.partner.clientId,
          clientSecret: clientSecret,
        });

        const client = new DataverseClient({
          environmentUrl: config.source.environmentUrl,
          tokenManager,
          clientId: config.partner.clientId,
        });

        // Try to query solutions to verify connectivity
        await client.querySolutions();

        checks.push({
          name: "Source environment",
          status: "pass",
          message: "Reachable and authenticated",
        });
        sourceSpinner.succeed("Source environment reachable");
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const parsed = parseAuthError(errorMsg);

        checks.push({
          name: "Source environment",
          status: "fail",
          message: parsed.message,
          fix: parsed.fix,
        });
        hasErrors = true;
        sourceSpinner.fail(`Source environment: ${parsed.message}`);
      }
    } else if (options.skipSource) {
      checks.push({
        name: "Source environment",
        status: "warn",
        message: "Skipped (--skip-source flag)",
      });
    }

    // Display final results
    console.log();
    displayResults(checks);

    if (hasErrors) {
      process.exit(1);
    }
  });

/**
 * Display validation results in a formatted output
 */
function displayResults(checks: ValidationCheck[]): void {
  console.log(chalk.bold("\nValidation Results:"));
  console.log("─".repeat(80));

  for (const check of checks) {
    const icon =
      check.status === "pass"
        ? chalk.green("✓")
        : check.status === "fail"
          ? chalk.red("✗")
          : chalk.yellow("⚠");
    const name = check.name.padEnd(25);
    console.log(`${icon} ${name} ${check.message}`);

    if (check.fix) {
      console.log(chalk.gray(`  Fix: ${check.fix}`));
    }
  }

  console.log();

  // Count errors and warnings
  const errorCount = checks.filter((c) => c.status === "fail").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;

  if (errorCount > 0 || warnCount > 0) {
    console.log(
      chalk.bold("Summary: ") +
        chalk.red(`${errorCount} error${errorCount === 1 ? "" : "s"}`) +
        ", " +
        chalk.yellow(`${warnCount} warning${warnCount === 1 ? "" : "s"}`)
    );
  } else {
    console.log(chalk.green.bold("✓ All validation checks passed!"));
    console.log(chalk.gray("  Your configuration is ready for deployment."));
  }
}

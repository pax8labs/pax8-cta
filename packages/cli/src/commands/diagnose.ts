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
import { createSpinner, formatCommandExample } from "../lib/spinner.js";
import {
  loadConfig,
  TenantConfig,
  TokenManager,
  DataverseClient,
  GdapClient,
  parseAuthError,
  environmentSetupService,
  POWER_PLATFORM_ADMIN_ROLE_ID,
} from "@agentsync/core";
import { getClientSecretWithFallback } from "../lib/credentials.js";
import { promptAndSendReport, type DiagnosticReport } from "../lib/telemetry.js";

interface DiagnosticStep {
  name: string;
  status: "pass" | "fail" | "skip";
  message: string;
  detail?: string;
  durationMs: number;
}

export const diagnoseCommand = new Command("diagnose")
  .description(
    "Run end-to-end diagnostic chain for a tenant (GDAP → token → Dataverse → permissions)"
  )
  .argument("<tenant>", "Tenant name to diagnose")
  .option("-c, --config <path>", "Path to config file", "./config/tenants.yaml")
  .addHelpText(
    "after",
    `
Examples:
  agentsync diagnose "Contoso Corp"     Full diagnostic for a tenant
  agentsync diagnose AgentSync-Test2    Diagnose a specific test tenant
`
  )
  .action(async (tenantName: string, options) => {
    const steps: DiagnosticStep[] = [];
    let stopEarly = false;

    console.log();
    console.log(chalk.bold(`Diagnosing: ${tenantName}`));
    console.log(chalk.gray("Running full GDAP → token → Dataverse → permissions chain"));
    console.log();

    // Step 0: Load config
    const configPath = resolve(process.cwd(), options.config);
    if (!existsSync(configPath)) {
      console.log(chalk.red("✗ Config file not found: " + configPath));
      console.log(
        chalk.gray(`  Run '${formatCommandExample("init")}' to create a configuration file`)
      );
      process.exit(1);
    }

    let config;
    let tenant: TenantConfig;
    try {
      config = await loadConfig(configPath);
      const found = config.tenants.find((t) => t.name.toLowerCase() === tenantName.toLowerCase());
      if (!found) {
        console.log(chalk.red(`✗ Tenant '${tenantName}' not found in config. Available:`));
        for (const t of config.tenants) {
          console.log(chalk.gray(`    ${t.name}${t.enabled ? "" : " (disabled)"}`));
        }
        process.exit(1);
      }
      tenant = found;
    } catch (error) {
      console.log(chalk.red(`✗ Config error: ${error instanceof Error ? error.message : error}`));
      process.exit(1);
    }

    console.log(chalk.gray(`  Tenant ID:       ${tenant.tenantId}`));
    console.log(chalk.gray(`  Environment URL:  ${tenant.environmentUrl}`));
    console.log(chalk.gray(`  Enabled:          ${tenant.enabled}`));
    console.log();

    // Step 1: Client secret
    let clientSecret: string;
    const secretSpinner = createSpinner("Step 1/5: Checking client secret...").start();
    const secretStart = Date.now();
    try {
      clientSecret = await getClientSecretWithFallback();
      steps.push({
        name: "Client secret",
        status: "pass",
        message: "Available",
        durationMs: Date.now() - secretStart,
      });
      secretSpinner.succeed("Step 1/5: Client secret available");
    } catch (error) {
      steps.push({
        name: "Client secret",
        status: "fail",
        message: "PARTNER_CLIENT_SECRET not set",
        detail: "Set PARTNER_CLIENT_SECRET environment variable or use keychain",
        durationMs: Date.now() - secretStart,
      });
      secretSpinner.fail("Step 1/5: Client secret missing");
      stopEarly = true;
      clientSecret = "";
    }

    // Step 2: GDAP relationship
    if (!stopEarly) {
      const gdapSpinner = createSpinner("Step 2/5: Checking GDAP relationship...").start();
      const gdapStart = Date.now();
      try {
        const gdapClient = new GdapClient({
          tenantId: config!.partner.tenantId,
          clientId: config!.partner.clientId,
          clientSecret,
        });

        const relationships = await gdapClient.listDelegatedAdminRelationships();
        const relationship = relationships.find((rel) => rel.customer.tenantId === tenant.tenantId);

        if (!relationship) {
          steps.push({
            name: "GDAP relationship",
            status: "fail",
            message: `No active GDAP relationship found for tenant ${tenant.tenantId}`,
            detail: "Set up a GDAP relationship in Partner Center",
            durationMs: Date.now() - gdapStart,
          });
          gdapSpinner.fail("Step 2/5: No GDAP relationship");
          stopEarly = true;
        } else if (relationship.status !== "active") {
          steps.push({
            name: "GDAP relationship",
            status: "fail",
            message: `GDAP relationship status: ${relationship.status}`,
            detail: `Renew in Partner Center (expires: ${relationship.endDateTime})`,
            durationMs: Date.now() - gdapStart,
          });
          gdapSpinner.fail(`Step 2/5: GDAP ${relationship.status}`);
          stopEarly = true;
        } else {
          // Check Power Platform Admin role
          const hasPPAdmin = relationship.accessDetails.unifiedRoles.some(
            (role) => role.roleDefinitionId === POWER_PLATFORM_ADMIN_ROLE_ID
          );

          const endDate = new Date(relationship.endDateTime);
          const daysLeft = Math.floor((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

          if (!hasPPAdmin) {
            steps.push({
              name: "GDAP relationship",
              status: "fail",
              message: "Active but missing Power Platform Administrator role",
              detail: "Add the role in Partner Center GDAP settings",
              durationMs: Date.now() - gdapStart,
            });
            gdapSpinner.fail("Step 2/5: Missing Power Platform Admin role");
            stopEarly = true;
          } else {
            const expiryNote =
              daysLeft <= 30 ? ` (expires in ${daysLeft}d!)` : ` (${daysLeft}d remaining)`;
            steps.push({
              name: "GDAP relationship",
              status: "pass",
              message: `Active with Power Platform Admin role${expiryNote}`,
              durationMs: Date.now() - gdapStart,
            });
            gdapSpinner.succeed(`Step 2/5: GDAP valid${expiryNote}`);
          }
        }
      } catch (error) {
        const parsed = parseAuthError(error instanceof Error ? error.message : String(error));
        steps.push({
          name: "GDAP relationship",
          status: "fail",
          message: parsed.message,
          detail: parsed.fix,
          durationMs: Date.now() - gdapStart,
        });
        gdapSpinner.fail(`Step 2/5: ${parsed.message}`);
        // Don't stop early — GDAP check requires Graph permissions which
        // the partner app might not have. Token acquisition below uses
        // client credentials directly against the customer tenant.
      }
    }

    // Step 3: Token acquisition for customer tenant
    let tokenManager: TokenManager | null = null;
    if (!stopEarly) {
      const tokenSpinner = createSpinner("Step 3/5: Acquiring cross-tenant token...").start();
      const tokenStart = Date.now();
      try {
        tokenManager = new TokenManager({
          tenantId: tenant.tenantId,
          clientId: config!.partner.clientId,
          clientSecret,
        });
        await tokenManager.getDataverseToken(tenant.environmentUrl);
        steps.push({
          name: "Token acquisition",
          status: "pass",
          message: "Dataverse token acquired for customer tenant",
          durationMs: Date.now() - tokenStart,
        });
        tokenSpinner.succeed(`Step 3/5: Token acquired (${Date.now() - tokenStart}ms)`);
      } catch (error) {
        const parsed = parseAuthError(error instanceof Error ? error.message : String(error));
        steps.push({
          name: "Token acquisition",
          status: "fail",
          message: parsed.message,
          detail: parsed.fix,
          durationMs: Date.now() - tokenStart,
        });
        tokenSpinner.fail(`Step 3/5: ${parsed.message}`);
        stopEarly = true;
      }
    }

    // Step 4: Dataverse connectivity (WhoAmI)
    let client: DataverseClient | null = null;
    if (!stopEarly && tokenManager) {
      const dvSpinner = createSpinner(
        "Step 4/5: Testing Dataverse connectivity (WhoAmI)..."
      ).start();
      const dvStart = Date.now();
      try {
        client = new DataverseClient({
          environmentUrl: tenant.environmentUrl,
          tokenManager,
          clientId: config!.partner.clientId,
        });
        const whoAmI = await client.get<{ UserId: string; OrganizationId: string }>("/WhoAmI");
        steps.push({
          name: "Dataverse connectivity",
          status: "pass",
          message: `Connected (Org: ${whoAmI.OrganizationId})`,
          durationMs: Date.now() - dvStart,
        });
        dvSpinner.succeed(`Step 4/5: Dataverse reachable (${Date.now() - dvStart}ms)`);
      } catch (error) {
        const parsed = parseAuthError(error instanceof Error ? error.message : String(error));
        steps.push({
          name: "Dataverse connectivity",
          status: "fail",
          message: parsed.message,
          detail: parsed.fix,
          durationMs: Date.now() - dvStart,
        });
        dvSpinner.fail(`Step 4/5: ${parsed.message}`);
        stopEarly = true;
      }
    }

    // Step 5: App user & permissions
    if (!stopEarly && client) {
      const permSpinner = createSpinner("Step 5/5: Checking app user & permissions...").start();
      const permStart = Date.now();
      try {
        const result = await environmentSetupService.validateTenant(
          client,
          config!.partner.clientId
        );

        if (result.appUserExists && result.hasSystemAdminRole) {
          steps.push({
            name: "App user & permissions",
            status: "pass",
            message: "App user exists with System Administrator role",
            durationMs: Date.now() - permStart,
          });
          permSpinner.succeed(`Step 5/5: Permissions valid (${Date.now() - permStart}ms)`);
        } else if (!result.appUserExists) {
          steps.push({
            name: "App user & permissions",
            status: "fail",
            message: "App user not registered in environment",
            detail: `Run '${formatCommandExample(`setup --tenant "${tenant.name}"`)}' to create it`,
            durationMs: Date.now() - permStart,
          });
          permSpinner.fail("Step 5/5: App user missing");
        } else {
          steps.push({
            name: "App user & permissions",
            status: "fail",
            message: "App user exists but missing System Administrator role",
            detail: `Run '${formatCommandExample(`setup --tenant "${tenant.name}"`)}' to fix`,
            durationMs: Date.now() - permStart,
          });
          permSpinner.fail("Step 5/5: Missing System Administrator role");
        }
      } catch (error) {
        const parsed = parseAuthError(error instanceof Error ? error.message : String(error));
        steps.push({
          name: "App user & permissions",
          status: "fail",
          message: parsed.message,
          detail: parsed.fix,
          durationMs: Date.now() - permStart,
        });
        permSpinner.fail(`Step 5/5: ${parsed.message}`);
      }
    }

    // Fill in skipped steps
    const allStepNames = [
      "Client secret",
      "GDAP relationship",
      "Token acquisition",
      "Dataverse connectivity",
      "App user & permissions",
    ];
    for (const name of allStepNames) {
      if (!steps.find((s) => s.name === name)) {
        steps.push({
          name,
          status: "skip",
          message: "Skipped (earlier step failed)",
          durationMs: 0,
        });
      }
    }

    // Summary
    console.log();
    console.log(chalk.bold("Diagnostic Results:"));
    console.log("─".repeat(80));

    for (const step of steps) {
      const icon =
        step.status === "pass"
          ? chalk.green("✓")
          : step.status === "fail"
            ? chalk.red("✗")
            : chalk.gray("○");
      const duration = step.durationMs > 0 ? chalk.gray(` (${step.durationMs}ms)`) : "";
      console.log(`${icon} ${step.name.padEnd(25)} ${step.message}${duration}`);
      if (step.detail) {
        console.log(chalk.gray(`  Fix: ${step.detail}`));
      }
    }

    console.log();

    const passed = steps.filter((s) => s.status === "pass").length;
    const failed = steps.filter((s) => s.status === "fail").length;
    const skipped = steps.filter((s) => s.status === "skip").length;

    if (failed === 0) {
      console.log(
        chalk.green.bold(`✓ All ${passed} checks passed — tenant is ready for deployment`)
      );
    } else {
      console.log(
        chalk.bold("Summary: ") +
          chalk.green(`${passed} passed`) +
          ", " +
          chalk.red(`${failed} failed`) +
          (skipped > 0 ? ", " + chalk.gray(`${skipped} skipped`) : "")
      );
      console.log();
      console.log(
        chalk.yellow(
          "Fix the first failing step and re-run: " +
            chalk.bold(formatCommandExample(`diagnose "${tenant.name}"`))
        )
      );

      // Offer to send diagnostic report
      const failedStep = steps.find((s) => s.status === "fail");
      const totalDuration = steps.reduce((sum, s) => sum + s.durationMs, 0);
      const report: DiagnosticReport = {
        event: "cli_diagnose_result",
        command: "diagnose",
        errorCode: failedStep?.name.replace(/\s+/g, "_").toUpperCase(),
        errorMessage: failedStep?.message,
        tenantId: tenant.tenantId,
        failedStep: failedStep?.name,
        steps: steps.map((s) => ({
          name: s.name,
          status: s.status,
          durationMs: s.durationMs,
        })),
        durationMs: totalDuration,
      };
      await promptAndSendReport(report);

      process.exit(1);
    }
  });

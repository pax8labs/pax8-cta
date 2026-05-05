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
import chalk from "chalk";
import { createSpinner, isQuietMode, type Spinner } from "../../lib/spinner.js";
import { GdapClient, type TenantConfig } from "@agentsync/core";
import { getClientSecretWithFallback } from "../../lib/credentials.js";
import { handleCommandError } from "../../lib/errors.js";
import { withResolvedDestinations } from "../../lib/command-wrapper.js";

export const inspectCommand = new Command("inspect")
  .alias("validate")
  .description("Validate connectivity and permissions for each tenant")
  .option("-c, --config <path>", "Path to config file", "./config/tenants.yaml")
  .option("-t, --tag <tags...>", "Filter by tags")
  .addHelpText(
    "after",
    `
Examples:
  tenants inspect                           Validate all enabled tenants
  tenants inspect -t production             Validate only tenants tagged "production"
`
  )
  .action(async (options) => {
    const spinner = createSpinner("Loading fleet manifest...").start();

    try {
      // Issue #385: route through withResolvedDestinations so demo mode
      // doesn't try to load ./config/tenants.yaml (would throw
      // ERROR_CONFIG_NOT_FOUND). In demo mode we synthesize GDAP/connectivity
      // status from each tenant's riskProfile metadata.
      await withResolvedDestinations<void>(
        options,
        (destinations) => runDemoInspection(spinner, destinations),
        ({ config, destinations }) => runRealInspection(spinner, destinations, config.partner)
      );
    } catch (error) {
      handleCommandError(error, spinner, "Inspection failed");
    }
  });

interface InspectionResult {
  name: string;
  tenantId: string;
  sameTenant: boolean;
  hasRelationship: boolean;
  hasPowerPlatformAccess: boolean;
  error?: string;
}

function printReport(results: InspectionResult[]): void {
  console.log();
  console.log(chalk.bold("📋 Inspection Report"));
  console.log("─".repeat(60));

  const sameTenantRoutes = results.filter((r) => r.sameTenant).length;
  const clearRoutes = results.filter((r) => r.hasPowerPlatformAccess && !r.sameTenant).length;
  const missingClearance = results.filter(
    (r) => r.hasRelationship && !r.hasPowerPlatformAccess && !r.sameTenant
  ).length;
  const noRoute = results.filter((r) => !r.hasRelationship && !r.error && !r.sameTenant).length;
  const errors = results.filter((r) => r.error).length;

  if (sameTenantRoutes > 0) {
    console.log(`  ${chalk.green("✓")} Same-Tenant Auth:     ${sameTenantRoutes}`);
  }
  console.log(`  ${chalk.green("✓")} Routes Clear:         ${clearRoutes}`);
  console.log(`  ${chalk.yellow("⚠")} Missing Clearance:    ${missingClearance}`);
  console.log(`  ${chalk.red("✗")} No Route:             ${noRoute}`);
  console.log(`  ${chalk.red("✗")} Inspection Errors:    ${errors}`);
  console.log();

  const passingRoutes = clearRoutes + sameTenantRoutes;
  if (passingRoutes === results.length) {
    console.log(chalk.green("✅ All tenants inspected and ready for deployment!"));
  } else {
    console.log(
      chalk.yellow(`⚠️  ${results.length - passingRoutes} tenant(s) have connectivity issues.`)
    );
  }
}

/**
 * Demo inspection — uses each demo tenant's riskProfile/gdapStatus metadata
 * to synthesize a plausible inspection report without any network I/O.
 */
function runDemoInspection(spinner: Spinner, destinations: TenantConfig[]): void {
  spinner.succeed(`Loaded ${destinations.length} destinations to inspect`);

  if (!isQuietMode()) {
    console.error(chalk.yellow("\n⚠️  DEMO MODE - Using mock data\n"));
  }

  console.log();
  console.log(chalk.bold("🔍 Inspecting Tenant Connectivity"));
  console.log("─".repeat(60));

  const results: InspectionResult[] = destinations.map((tenant) => {
    // Pull the demo metadata that drives the synthetic report. The shape
    // matches DemoTenantMetadata in core/src/mock/demo-data.ts.
    const meta = (tenant.metadata ?? {}) as {
      riskProfile?: string;
      gdapStatus?: string;
    };

    // "valid" GDAP → route clear; anything else → degraded in some way.
    const hasRelationship = meta.gdapStatus !== undefined && meta.gdapStatus !== "expired";
    const hasPowerPlatformAccess =
      meta.gdapStatus === "valid" || meta.gdapStatus === "expiring_soon";

    if (hasPowerPlatformAccess) {
      console.log(`✔ ${tenant.name}: ${chalk.green("Route clear ✓")}`);
    } else if (hasRelationship) {
      console.log(
        `⚠ ${tenant.name}: ${chalk.yellow("Missing customs clearance (Power Platform Admin role)")}`
      );
    } else {
      console.log(`✖ ${tenant.name}: ${chalk.red("No GDAP relationship configured")}`);
    }

    return {
      name: tenant.name,
      tenantId: tenant.tenantId,
      sameTenant: false,
      hasRelationship,
      hasPowerPlatformAccess,
    };
  });

  printReport(results);
}

async function runRealInspection(
  spinner: Spinner,
  destinations: TenantConfig[],
  partner: { tenantId: string; clientId: string }
): Promise<void> {
  spinner.succeed(`Loaded ${destinations.length} destinations to inspect`);

  // Get client secret
  const clientSecret = await getClientSecretWithFallback();

  // Create GDAP client
  const gdapClient = new GdapClient({
    tenantId: partner.tenantId,
    clientId: partner.clientId,
    clientSecret,
  });

  console.log();
  console.log(chalk.bold("🔍 Inspecting Tenant Connectivity"));
  console.log("─".repeat(60));

  const results: InspectionResult[] = [];

  for (const tenant of destinations) {
    spinner.start(`Inspecting route to ${tenant.name}...`);

    // Same-tenant auth: GDAP is not required when the destination tenant
    // is the partner's own tenant.
    if (tenant.tenantId === partner.tenantId) {
      results.push({
        name: tenant.name,
        tenantId: tenant.tenantId,
        sameTenant: true,
        hasRelationship: true,
        hasPowerPlatformAccess: true,
      });
      spinner.succeed(`${tenant.name}: ${chalk.green("Same-tenant auth (GDAP not required)")}`);
      continue;
    }

    try {
      const hasRelationship = await gdapClient.hasActiveRelationship(tenant.tenantId);
      const hasPowerPlatformAccess = hasRelationship
        ? await gdapClient.validatePowerPlatformAccess(tenant.tenantId)
        : false;

      results.push({
        name: tenant.name,
        tenantId: tenant.tenantId,
        sameTenant: false,
        hasRelationship,
        hasPowerPlatformAccess,
      });

      if (hasPowerPlatformAccess) {
        spinner.succeed(`${tenant.name}: ${chalk.green("Route clear ✓")}`);
      } else if (hasRelationship) {
        spinner.warn(
          `${tenant.name}: ${chalk.yellow("Missing customs clearance (Power Platform Admin role)")}`
        );
      } else {
        spinner.fail(`${tenant.name}: ${chalk.red("No GDAP relationship configured")}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      results.push({
        name: tenant.name,
        tenantId: tenant.tenantId,
        sameTenant: false,
        hasRelationship: false,
        hasPowerPlatformAccess: false,
        error: errorMsg,
      });
      spinner.fail(`${tenant.name}: ${chalk.red(errorMsg)}`);
    }
  }

  printReport(results);
}

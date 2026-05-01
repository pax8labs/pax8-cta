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
import { randomUUID } from "node:crypto";
import { existsSync, unlinkSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import chalk from "chalk";
import { createSpinner, formatCommandExample } from "../lib/spinner.js";
import Table from "cli-table3";
import {
  type Config,
  TenantConfig,
  TokenManager,
  DataverseClient,
  SolutionOperations,
  UrlTemplater,
  WaveService,
  DeploymentService,
  getEffectiveConnectionMappings,
  getEffectiveEnvironmentVariables,
  resolveTenantUrls,
  type TenantUrlValues,
  type DetectedUrl,
  environmentSetupService,
  detectSolutionMode,
} from "@agentsync/core";
import { withResolvedDestinations, type LoadedConfig } from "../lib/command-wrapper.js";
import { getClientSecretWithFallback } from "../lib/credentials.js";
import { handleCommandError } from "../lib/errors.js";
import { isPirateMode, pirate, pirateSuccessQuip, pirateFailureQuip } from "../lib/theme.js";

export const deployCommand = new Command("deploy")
  .description("Export a solution from source and import it to target tenants")
  .argument("[solution]", "Solution name (e.g., TestDeploy) or path to zip file")
  .option("-s, --solution <name|path>", "Solution name or path to zip (alternative to argument)")
  .option("--agentPackage <path>", "Alias for --solution")
  .option("-c, --config <path>", "Path to config file", "./config/tenants.yaml")
  .option("-t, --tag <tags...>", "Deploy only to tenants with these tags")
  .option("--tenant <tenants...>", "Deploy only to specific tenant names or IDs")
  .option("--tenants <tenants...>", "Alias for --tenant")
  .option("--all", "Deploy to all configured tenants (default)")
  .option("--dry-run", "Preview what would happen without deploying")
  .option("--skip-validation", "Skip auth and environment checks during dry run")
  .option("--json", "Output dry-run plan as JSON")
  .option("--managed", "Export as managed solution (default)")
  .option("--unmanaged", "Export as unmanaged solution")
  .option("--keep-package", "Keep exported zip after deployment")
  .option("--package-dir <path>", "Directory for exported zip (default: temp)")
  .option("--no-auto-setup", "Skip automatic application user setup")
  .option("--direct", "Deploy sequentially (default mode)")
  .option("--skip-url-replace", "Skip automatic tenant URL replacement in solution")
  .addHelpText(
    "after",
    `
Examples:
  agentsync deploy TestDeploy --all                Deploy to all tenants
  agentsync deploy TestDeploy --tag production     Deploy to production tenants only
  agentsync deploy TestDeploy --all --dry-run      Preview without deploying
  agentsync deploy ./TestDeploy.zip --all          Deploy a pre-exported zip file
  agentsync deploy TestDeploy --all --skip-url-replace  Skip URL replacement
`
  )
  .action(async (solutionArg: string | undefined, options) => {
    const mergedTenantFilters = [...(options.tenant ?? []), ...(options.tenants ?? [])];
    if (mergedTenantFilters.length > 0) {
      options.tenant = Array.from(new Set(mergedTenantFilters));
    }

    if (solutionArg && !options.solution) options.solution = solutionArg;
    if (!options.solution) {
      console.error(chalk.red("Error: solution name or path required."));
      console.error(chalk.gray("  Example: " + formatCommandExample("deploy TestDeploy --all")));
      process.exit(2);
    }

    if (options.json && !options.dryRun) {
      console.error(chalk.red("Error: --json is only supported with --dry-run."));
      process.exit(2);
    }

    // Default to --all if no tag filter
    if (!options.all && (!options.tag || options.tag.length === 0)) {
      options.all = true;
    }
    const spinner = createSpinner("Loading configuration...").start();

    // Declare these outside try block so they're accessible in catch
    let agentPackagePath: string;
    let tempPackagePath: string | null = null;

    try {
      // Validate options
      if (!options.all && (!options.tag || options.tag.length === 0)) {
        spinner.fail(chalk.red("Must specify --all or --tag to select destinations"));
        process.exit(1);
      }

      // Determine if this is a solution name or file path
      const solutionArg = options.agentPackage || options.solution;
      // Treat as file path if it ends with .zip (regardless of existence - we'll validate later)
      const isFilePath = solutionArg.endsWith(".zip");

      const resolvedContext = await withResolvedDestinations<{
        config: LoadedConfig;
        destinations: TenantConfig[];
      } | null>(
        options,
        async (resolvedDestinations) => {
          const destinations = filterDestinationsByTenantSelections(
            resolvedDestinations,
            options.tenant
          );

          if (destinations.length === 0) {
            spinner.fail(chalk.red("No destinations matched the selection criteria"));
            process.exit(1);
          }

          spinner.succeed("Demo fleet manifest loaded");
          console.error(chalk.yellow("\n⚠️  DEMO MODE - Showing preview\n"));

          if (options.dryRun) {
            await runDryRunPreview({
              solutionInput: solutionArg,
              isFilePath,
              options,
              destinations,
              demoMode: true,
            });
            return null;
          }

          // In demo mode, show export simulation if solution name provided
          if (!isFilePath) {
            console.log(chalk.bold("📤 Export Simulation:"));
            console.log(`  Solution:      ${chalk.green(solutionArg)}`);
            console.log(`  Version:       1.0.0.2 (demo)`);
            console.log(`  Type:          ${options.unmanaged ? "Unmanaged" : "Managed"}`);
            console.log();
          }

          // Display destinations
          console.log(chalk.bold(`📦 Shipping Destinations (${destinations.length}):`));
          console.log();

          const table = new Table({
            head: ["Destination", "Tenant ID", "Port", "Tags"],
            style: { head: ["cyan"] },
          });

          destinations.forEach((tenant) => {
            table.push([
              tenant.name,
              tenant.tenantId.slice(0, 8) + "...",
              new URL(tenant.environmentUrl).hostname,
              tenant.tags?.join(", ") || "-",
            ]);
          });

          console.log(table.toString());
          console.log();

          const demoShipmentId = `dep-demo-${Date.now().toString(36)}`;

          console.log(chalk.green("✓ Shipment dispatched successfully (demo)"));
          console.log();
          console.log(chalk.bold("📋 Shipment Details:"));
          console.log(`  Tracking #:    ${chalk.cyan(demoShipmentId)}`);
          console.log(`  Package:       ${isFilePath ? solutionArg : `${solutionArg} (exported)`}`);
          console.log(`  Destinations:  ${destinations.length}`);
          console.log();
          console.log(
            chalk.gray(
              `Use '${formatCommandExample(`track --shipment ${demoShipmentId}`)}' to track progress`
            )
          );
          console.log(chalk.yellow("\nNote: In demo mode, no actual deployment occurs"));
          return null;
        },
        async (context) => {
          spinner.succeed("Manifest loaded");
          return context;
        }
      );

      if (!resolvedContext) {
        return;
      }
      const { config } = resolvedContext;
      const destinations = filterDestinationsByTenantSelections(
        resolvedContext.destinations,
        options.tenant
      );

      if (destinations.length === 0) {
        spinner.fail(chalk.red("No destinations matched the selection criteria"));
        process.exit(1);
      }

      if (options.dryRun) {
        await runDryRunPreview({
          solutionInput: solutionArg,
          isFilePath,
          options,
          destinations,
          config,
        });
        return;
      }

      // If solution name provided, export it first
      if (!isFilePath) {
        // Validate source environment is configured
        if (!config.source || !config.source.environmentUrl) {
          spinner.fail(chalk.red("Source environment not configured"));
          console.error(
            chalk.red(
              "\nTo deploy from solution name, configure a source environment in your config file:"
            )
          );
          console.error(chalk.gray("  source:"));
          console.error(chalk.gray("    tenantId: <tenant-id>"));
          console.error(chalk.gray("    environmentUrl: <environment-url>"));
          console.error(
            chalk.gray("\nOr set environment variables: SOURCE_TENANT_ID, SOURCE_ENVIRONMENT_URL")
          );
          process.exit(1);
        }

        // Get client secret once for reuse
        const clientSecret = await getClientSecretWithFallback();

        // Auto-detect solution mode if not explicitly specified
        let managed = !options.unmanaged;
        if (!options.managed && !options.unmanaged) {
          spinner.start("Detecting solution mode in target environments...");

          const modeCheck = await detectSolutionMode(
            solutionArg,
            destinations,
            config.partner.clientId,
            clientSecret
          );

          if (modeCheck.hasConflict) {
            spinner.warn(chalk.yellow("Mixed solution modes detected in targets"));
            console.log();
            console.log(chalk.yellow("⚠ Warning: Solution exists with different modes:"));
            if (modeCheck.managedCount > 0) {
              console.log(chalk.gray(`  ${modeCheck.managedCount} target(s) have it as managed`));
            }
            if (modeCheck.unmanagedCount > 0) {
              console.log(
                chalk.gray(`  ${modeCheck.unmanagedCount} target(s) have it as unmanaged`)
              );
            }
            if (modeCheck.notInstalledCount > 0) {
              console.log(
                chalk.gray(`  ${modeCheck.notInstalledCount} target(s) don't have it installed`)
              );
            }
            console.log();
            console.log(chalk.gray("Use --managed or --unmanaged to specify which mode to use."));
            console.log(chalk.gray("Targets with mismatched mode will fail to import."));
            console.log();
            // Default to majority mode
            managed = modeCheck.managedCount >= modeCheck.unmanagedCount;
            console.log(
              chalk.cyan(`Proceeding with ${managed ? "managed" : "unmanaged"} mode (majority)`)
            );
            console.log();
          } else if (modeCheck.unmanagedCount > 0) {
            // All existing installations are unmanaged
            managed = false;
            spinner.succeed(
              `Auto-detected: exporting as unmanaged (matches ${modeCheck.unmanagedCount} target(s))`
            );
          } else if (modeCheck.managedCount > 0) {
            // All existing installations are managed
            managed = true;
            spinner.succeed(
              `Auto-detected: exporting as managed (matches ${modeCheck.managedCount} target(s))`
            );
          } else {
            // Not installed anywhere - use default (managed)
            spinner.succeed("Solution not installed in targets - using managed mode (default)");
          }
        }

        spinner.start(`Exporting solution '${solutionArg}' from source...`);

        try {
          // Authenticate and create client for source
          const tokenManager = new TokenManager({
            tenantId: config.partner.tenantId,
            clientId: config.partner.clientId,
            clientSecret,
          });

          const dataverseClient = new DataverseClient({
            environmentUrl: config.source.environmentUrl,
            tokenManager,
          });

          const solutionOps = new SolutionOperations(dataverseClient);

          // Export with detected/specified mode
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
          const suffix = managed ? "managed" : "unmanaged";

          // Determine output directory
          const outputDir = options.packageDir ? resolve(options.packageDir) : tmpdir();
          const outputPath = join(outputDir, `${solutionArg}_${timestamp}_${suffix}.zip`);

          // Export solution
          const metadata = await solutionOps.exportSolution(solutionArg, {
            managed,
            outputPath,
          });

          spinner.succeed(
            `Exported ${chalk.green(metadata.friendlyName)} v${metadata.version} (${suffix})`
          );

          agentPackagePath = outputPath;
          if (!options.keepPackage) {
            tempPackagePath = outputPath;
          }

          console.log();
        } catch (error) {
          handleCommandError(error, spinner, "Export failed");
        }
      } else {
        agentPackagePath = resolve(solutionArg);

        // Validate file exists (skip in dry-run mode where we just want to preview)
        if (!options.dryRun && !existsSync(agentPackagePath)) {
          spinner.fail(chalk.red(`Package not found: ${agentPackagePath}`));
          process.exit(1);
        }
      }

      // Display destinations
      console.log();
      console.log(chalk.bold(`Shipping Destinations (${destinations.length}):`));

      const table = new Table({
        head: ["Destination", "Tenant ID", "Port", "Tags"],
        style: { head: ["cyan"] },
      });

      destinations.forEach((tenant) => {
        table.push([
          tenant.name,
          tenant.tenantId.slice(0, 8) + "...",
          new URL(tenant.environmentUrl).hostname,
          tenant.tags?.join(", ") || "-",
        ]);
      });

      console.log(table.toString());
      console.log();

      // Verify client secret is available
      await getClientSecretWithFallback();

      // Auto-setup app users if needed (unless --no-auto-setup)
      if (options.autoSetup !== false) {
        console.log(chalk.bold("Checking application users..."));
        let setupCount = 0;
        let warningCount = 0;

        const setupClientSecret = await getClientSecretWithFallback();
        for (const tenant of destinations) {
          const prepareSpinner = createSpinner(`Checking ${tenant.name}...`).start();
          const setupTokenManager = new TokenManager({
            tenantId: tenant.tenantId,
            clientId: config.partner.clientId,
            clientSecret: setupClientSecret,
          });
          const setupClient = new DataverseClient({
            environmentUrl: tenant.environmentUrl,
            tokenManager: setupTokenManager,
          });
          const prepared = await environmentSetupService.prepareEnvironment(
            setupClient,
            config.partner.clientId,
            tenant.environmentUrl
          );

          if (prepared.success) {
            prepareSpinner.succeed(chalk.green(`${tenant.name}: ${prepared.message}`));
            if (prepared.message.includes("Created") || prepared.message.includes("Assigned")) {
              setupCount++;
            }
          } else {
            prepareSpinner.warn(chalk.yellow(`${tenant.name}: ${prepared.message}`));
            warningCount++;
          }
        }

        console.log();
        if (setupCount > 0) {
          console.log(chalk.green(`✓ ${setupCount} environment(s) setup completed`));
        }
        if (warningCount > 0) {
          console.log(
            chalk.yellow(`⚠ ${warningCount} environment(s) skipped (see warnings above)`)
          );
        }
        console.log();
      }

      // Deploy directly to each tenant sequentially
      console.log(chalk.bold("Deploying to destinations...\n"));

      const clientSecret = await getClientSecretWithFallback();
      let successCount = 0;
      let failCount = 0;

      // Scan solution for tenant-specific URLs (once, before the loop)
      let detectedUrls: DetectedUrl[] = [];
      if (!options.skipUrlReplace) {
        try {
          const JSZip = (await import("jszip")).default;
          const zipBuffer = readFileSync(agentPackagePath);
          const zip = await JSZip.loadAsync(zipBuffer);
          const templater = new UrlTemplater();
          detectedUrls = await templater.scanSolution(zip);

          if (detectedUrls.length > 0) {
            const sourceTenant = templater.inferSourceTenant(detectedUrls);
            console.log(
              chalk.gray(
                `Found ${detectedUrls.length} tenant-specific URL(s) from source tenant "${sourceTenant}" — will replace per target`
              )
            );
            console.log();
          }
        } catch {
          // JSZip may not be available or ZIP scan failed — skip URL replacement
        }
      }

      for (const tenant of destinations) {
        const tenantSpinner = createSpinner(`Deploying to ${tenant.name}...`).start();

        try {
          const tokenManager = new TokenManager({
            tenantId: tenant.tenantId,
            clientId: config.partner.clientId,
            clientSecret,
          });

          const dataverseClient = new DataverseClient({
            environmentUrl: tenant.environmentUrl,
            tokenManager,
          });

          const solutionOps = new SolutionOperations(dataverseClient);

          // Apply URL replacements if tenant-specific URLs were detected
          let importPath = agentPackagePath;
          if (detectedUrls.length > 0) {
            try {
              const modifiedPath = await applyUrlReplacements(
                agentPackagePath,
                detectedUrls,
                tenant
              );
              if (modifiedPath) {
                importPath = modifiedPath;
              }
            } catch {
              // URL replacement failed — import original solution
            }
          }

          // Start async import
          const importJobId = await solutionOps.importSolutionAsync(importPath, {
            overwriteUnmanagedCustomizations: true,
            publishWorkflows: true,
          });

          // Clean up temp modified ZIP after import starts
          if (importPath !== agentPackagePath && existsSync(importPath)) {
            try {
              unlinkSync(importPath);
            } catch {
              /* ignore */
            }
          }

          // Wait for completion with progress
          const result = await solutionOps.waitForImport(importJobId, {
            pollIntervalMs: 3000,
            timeoutMs: 300000,
            onProgress: (progress) => {
              tenantSpinner.text = `Deploying to ${tenant.name}... ${Math.round(progress)}%`;
            },
          });

          if (result.success) {
            tenantSpinner.succeed(chalk.green(`${tenant.name}: Deployed successfully`));
            successCount++;
          } else {
            tenantSpinner.fail(chalk.red(`${tenant.name}: ${result.error || "Deployment failed"}`));
            failCount++;
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          tenantSpinner.fail(chalk.red(`${tenant.name}: ${errorMsg}`));
          failCount++;
        }
      }

      console.log();
      console.log(chalk.bold(pirate("Deployment Summary:")));
      console.log(`  ${pirate("Total:")}     ${destinations.length}`);
      console.log(`  ${chalk.green(pirate("Success:"))}  ${successCount}`);
      if (failCount > 0) {
        console.log(`  ${chalk.red(pirate("Failed:"))}   ${failCount}`);
      }

      if (isPirateMode()) {
        console.log();
        console.log(chalk.yellow(`  ${failCount > 0 ? pirateFailureQuip() : pirateSuccessQuip()}`));
      }

      if (failCount > 0) {
        process.exit(1);
      }

      // Clean up temp package if needed
      if (tempPackagePath && existsSync(tempPackagePath)) {
        try {
          unlinkSync(tempPackagePath);
        } catch {
          // Ignore cleanup errors
        }
      }
    } catch (error) {
      // Clean up temp package on error
      if (tempPackagePath && existsSync(tempPackagePath)) {
        try {
          unlinkSync(tempPackagePath);
        } catch {
          // Ignore cleanup errors
        }
      }

      handleCommandError(error, spinner, "Shipment failed");
    }
  });

interface DryRunActionOptions {
  json?: boolean;
  skipValidation?: boolean;
  skipUrlReplace?: boolean;
}

interface DryRunContext {
  solutionInput: string;
  isFilePath: boolean;
  options: DryRunActionOptions;
  destinations: TenantConfig[];
  config?: Config;
  demoMode?: boolean;
}

interface DryRunConnectionPreview {
  sourceLogicalName: string;
  targetConnectionId: string;
  resolvedTargetConnectionId: string;
}

interface DryRunVariablePreview {
  schemaName: string;
  value: string | number | boolean;
  resolvedValue: string | number | boolean;
}

interface DryRunUrlResolution {
  template: string;
  resolved: string;
}

interface DryRunValidation {
  status: "pass" | "fail" | "skipped";
  errors: string[];
  warnings: string[];
}

interface DryRunTenantPlan {
  tenantName: string;
  tenantId: string;
  environmentUrl: string;
  waveNumber: number;
  waveName: string;
  connectionMappings: DryRunConnectionPreview[];
  environmentVariables: DryRunVariablePreview[];
  urlResolutions: DryRunUrlResolution[];
  validation: DryRunValidation;
}

interface DryRunWavePlan {
  waveNumber: number;
  name: string;
  maxParallel: number;
  waitAfterCompletionMs?: number;
  continueOnFailure: boolean;
  tenants: DryRunTenantPlan[];
}

interface DryRunPlan {
  dryRun: true;
  generatedAt: string;
  solution: string;
  summary: {
    totalTenants: number;
    totalWaves: number;
    validationEnabled: boolean;
    validationFailedTenants: number;
  };
  waves: DryRunWavePlan[];
}

function filterDestinationsByTenantSelections(
  destinations: TenantConfig[],
  tenantFilters?: string[]
): TenantConfig[] {
  if (!tenantFilters || tenantFilters.length === 0) {
    return destinations;
  }

  const normalizedFilters = tenantFilters.map((filter) => filter.toLowerCase());

  return destinations.filter((tenant) => {
    const tenantName = tenant.name.toLowerCase();
    const tenantId = tenant.tenantId.toLowerCase();
    const environmentUrl = tenant.environmentUrl.toLowerCase();

    return normalizedFilters.some(
      (filter) =>
        tenantName.includes(filter) || tenantId === filter || environmentUrl.includes(filter)
    );
  });
}

async function runDryRunPreview(context: DryRunContext): Promise<void> {
  const plan = await buildDryRunPlan(context);

  if (context.options.json) {
    console.log(JSON.stringify(plan, null, 2));
  } else {
    displayDryRunPlan(plan);
  }

  if (plan.summary.validationFailedTenants > 0) {
    process.exit(1);
  }
}

async function buildDryRunPlan(context: DryRunContext): Promise<DryRunPlan> {
  const templater = new UrlTemplater();
  const detectedTemplatePatterns = await detectTemplatePatternsFromPackage(
    context.solutionInput,
    context.isFilePath,
    context.options.skipUrlReplace === true
  );

  const validationByTenant = new Map<string, DryRunValidation>();

  if (context.demoMode) {
    for (const tenant of context.destinations) {
      validationByTenant.set(tenant.tenantId, {
        status: "skipped",
        errors: [],
        warnings: ["Skipped in demo mode"],
      });
    }
  } else if (context.options.skipValidation) {
    for (const tenant of context.destinations) {
      validationByTenant.set(tenant.tenantId, {
        status: "skipped",
        errors: [],
        warnings: ["Skipped (--skip-validation)"],
      });
    }
  } else if (context.config) {
    let deploymentService: DeploymentService | null = null;
    let bootstrapError: string | null = null;

    try {
      const clientSecret = await getClientSecretWithFallback();
      deploymentService = new DeploymentService({
        tenantId: context.config.partner.tenantId,
        clientId: context.config.partner.clientId,
        clientSecret,
      });
    } catch (error) {
      bootstrapError = error instanceof Error ? error.message : String(error);
    }

    if (bootstrapError) {
      for (const tenant of context.destinations) {
        validationByTenant.set(tenant.tenantId, {
          status: "fail",
          errors: [bootstrapError],
          warnings: [],
        });
      }
    } else if (deploymentService) {
      for (const tenant of context.destinations) {
        const effectiveMappings = getEffectiveConnectionMappings(context.config, tenant);
        const effectiveVariables = getEffectiveEnvironmentVariables(context.config, tenant);
        const validationResult = await deploymentService.validateTenant({
          tenantId: tenant.tenantId,
          tenantName: tenant.name,
          environmentUrl: tenant.environmentUrl,
          connectionMappings: effectiveMappings,
          environmentVariables: effectiveVariables,
          autoSetup: tenant.autoSetup,
        });

        validationByTenant.set(tenant.tenantId, {
          status: validationResult.valid ? "pass" : "fail",
          errors: validationResult.errors,
          warnings: validationResult.warnings,
        });
      }
    }
  }

  const waveService = new WaveService();
  const executionPlan = context.config
    ? waveService.createExecutionPlan(context.config, context.destinations)
    : {
        waves: [
          {
            waveNumber: 1,
            name: "Default",
            tenants: context.destinations,
            continueOnFailure: false,
          },
        ],
        totalTenants: context.destinations.length,
      };

  const waves: DryRunWavePlan[] = executionPlan.waves.map((wave) => {
    const tenants: DryRunTenantPlan[] = wave.tenants.map((tenant) => {
      const tenantUrls = resolveTenantUrls(tenant);
      const connectionMappings = context.config
        ? getEffectiveConnectionMappings(context.config, tenant)
        : tenant.connectionMappings || [];
      const environmentVariables = context.config
        ? getEffectiveEnvironmentVariables(context.config, tenant)
        : tenant.environmentVariables || [];

      const connectionPreviews = connectionMappings.map((mapping) => ({
        sourceLogicalName: mapping.sourceLogicalName,
        targetConnectionId: mapping.targetConnectionId,
        resolvedTargetConnectionId: templater.resolveTemplate(
          mapping.targetConnectionId,
          tenantUrls
        ),
      }));

      const variablePreviews = environmentVariables.map((variable) => ({
        schemaName: variable.schemaName,
        value: variable.value,
        resolvedValue:
          typeof variable.value === "string"
            ? templater.resolveTemplate(variable.value, tenantUrls)
            : variable.value,
      }));

      const templatePatterns = collectTemplatePatterns(
        detectedTemplatePatterns,
        connectionPreviews,
        variablePreviews
      );

      const urlResolutions =
        templatePatterns.length > 0
          ? templatePatterns.map((template) => ({
              template,
              resolved: templater.resolveTemplate(template, tenantUrls),
            }))
          : [
              { template: "{tenant}", resolved: tenantUrls.tenant },
              { template: "{tenant}.sharepoint.com", resolved: tenantUrls.sharepoint },
              { template: "{tenant}.onmicrosoft.com", resolved: tenantUrls.onmicrosoft },
            ];

      return {
        tenantName: tenant.name,
        tenantId: tenant.tenantId,
        environmentUrl: tenant.environmentUrl,
        waveNumber: wave.waveNumber,
        waveName: wave.name,
        connectionMappings: connectionPreviews,
        environmentVariables: variablePreviews,
        urlResolutions,
        validation: validationByTenant.get(tenant.tenantId) || {
          status: "skipped",
          errors: [],
          warnings: ["Validation unavailable"],
        },
      };
    });

    return {
      waveNumber: wave.waveNumber,
      name: wave.name,
      maxParallel: wave.maxParallel ?? 1,
      waitAfterCompletionMs: wave.waitAfterCompletion,
      continueOnFailure: wave.continueOnFailure,
      tenants,
    };
  });

  return {
    dryRun: true,
    generatedAt: new Date().toISOString(),
    solution: context.solutionInput,
    summary: {
      totalTenants: context.destinations.length,
      totalWaves: waves.length,
      validationEnabled: !(context.options.skipValidation || context.demoMode),
      validationFailedTenants: waves.reduce(
        (count, wave) =>
          count + wave.tenants.filter((tenant) => tenant.validation.status === "fail").length,
        0
      ),
    },
    waves,
  };
}

async function detectTemplatePatternsFromPackage(
  solutionInput: string,
  isFilePath: boolean,
  skipUrlReplace: boolean
): Promise<string[]> {
  if (!isFilePath || skipUrlReplace) {
    return [];
  }

  const packagePath = resolve(solutionInput);
  if (!existsSync(packagePath)) {
    return [];
  }

  try {
    const JSZip = (await import("jszip")).default;
    const zipBuffer = readFileSync(packagePath);
    const zip = await JSZip.loadAsync(zipBuffer);
    const templater = new UrlTemplater();
    const detectedUrls = await templater.scanSolution(zip);
    return Array.from(new Set(detectedUrls.map((url) => url.templatePattern)));
  } catch {
    return [];
  }
}

function collectTemplatePatterns(
  detectedPatterns: string[],
  connectionPreviews: DryRunConnectionPreview[],
  variablePreviews: DryRunVariablePreview[]
): string[] {
  const patterns = new Set<string>(detectedPatterns);

  for (const mapping of connectionPreviews) {
    if (mapping.targetConnectionId.includes("{tenant}")) {
      patterns.add(mapping.targetConnectionId);
    }
  }

  for (const variable of variablePreviews) {
    if (typeof variable.value === "string" && variable.value.includes("{tenant}")) {
      patterns.add(variable.value);
    }
  }

  return Array.from(patterns);
}

function displayDryRunPlan(plan: DryRunPlan): void {
  const solutionLabel = plan.solution.endsWith(".zip") ? resolve(plan.solution) : plan.solution;
  const tenantSuffix = plan.summary.totalTenants === 1 ? "" : "s";

  console.log(
    chalk.bold(
      `Dry run: deploy ${chalk.green(solutionLabel)} to ${plan.summary.totalTenants} tenant${tenantSuffix}`
    )
  );
  console.log();

  for (const wave of plan.waves) {
    const waitNote = wave.waitAfterCompletionMs
      ? `, wait after: ${formatDuration(wave.waitAfterCompletionMs)}`
      : "";
    console.log(
      chalk.bold(
        `Wave ${wave.waveNumber} (${wave.name}) - max parallel: ${wave.maxParallel}${waitNote}`
      )
    );

    const table = new Table({
      head: ["Tenant", "Environment", "Connections", "Variables", "URL Templates", "Validation"],
      style: { head: ["cyan"] },
      wordWrap: true,
    });

    for (const tenant of wave.tenants) {
      table.push([
        tenant.tenantName,
        new URL(tenant.environmentUrl).hostname,
        formatConnections(tenant.connectionMappings),
        formatVariables(tenant.environmentVariables),
        formatUrlResolutions(tenant.urlResolutions),
        formatValidation(tenant.validation),
      ]);
    }

    console.log(table.toString());
    console.log();
  }

  if (plan.summary.validationFailedTenants > 0) {
    console.log(
      chalk.red(
        `Validation failed for ${plan.summary.validationFailedTenants} tenant(s). Review errors above before deploying.`
      )
    );
    console.log();
  }

  console.log(chalk.yellow("No changes were made."));
}

function formatConnections(connectionMappings: DryRunConnectionPreview[]): string {
  if (connectionMappings.length === 0) {
    return "-";
  }

  return connectionMappings
    .map((mapping) => {
      if (mapping.targetConnectionId === mapping.resolvedTargetConnectionId) {
        return `${mapping.sourceLogicalName} -> ${mapping.resolvedTargetConnectionId}`;
      }
      return `${mapping.sourceLogicalName} -> ${mapping.resolvedTargetConnectionId} (from ${mapping.targetConnectionId})`;
    })
    .join("\n");
}

function formatVariables(environmentVariables: DryRunVariablePreview[]): string {
  if (environmentVariables.length === 0) {
    return "-";
  }

  return environmentVariables
    .map((variable) => {
      const original = String(variable.value);
      const resolved = String(variable.resolvedValue);
      if (original === resolved) {
        return `${variable.schemaName} -> ${resolved}`;
      }
      return `${variable.schemaName} -> ${resolved} (from ${original})`;
    })
    .join("\n");
}

function formatUrlResolutions(urlResolutions: DryRunUrlResolution[]): string {
  if (urlResolutions.length === 0) {
    return "-";
  }

  return urlResolutions
    .map((resolution) => `${resolution.template} -> ${resolution.resolved}`)
    .join("\n");
}

function formatValidation(validation: DryRunValidation): string {
  if (validation.status === "pass") {
    const warningSuffix =
      validation.warnings.length > 0 ? ` (${validation.warnings.length} warning)` : "";
    return `PASS${warningSuffix}`;
  }

  if (validation.status === "skipped") {
    return "SKIPPED";
  }

  return `FAIL (${validation.errors.length} error)`;
}

function formatDuration(durationMs: number): string {
  if (durationMs % (60 * 60 * 1000) === 0) {
    return `${durationMs / (60 * 60 * 1000)}h`;
  }
  if (durationMs % (60 * 1000) === 0) {
    return `${durationMs / (60 * 1000)}m`;
  }
  if (durationMs % 1000 === 0) {
    return `${durationMs / 1000}s`;
  }
  return `${durationMs}ms`;
}

/**
 * Apply URL replacements to a solution ZIP for a specific target tenant.
 * Returns path to modified ZIP, or null if no replacements were needed.
 */
async function applyUrlReplacements(
  originalZipPath: string,
  detectedUrls: DetectedUrl[],
  tenant: TenantConfig
): Promise<string | null> {
  if (detectedUrls.length === 0) return null;

  const JSZip = (await import("jszip")).default;
  const templater = new UrlTemplater();

  // Extract target tenant identifier from environment URL
  // e.g., https://org54870a4d.crm.dynamics.com → org54870a4d
  const envUrl = new URL(tenant.environmentUrl);
  const targetTenantId = envUrl.hostname.split(".")[0];
  const crmRegion = envUrl.hostname.match(/\.(crm\d*)\.dynamics\.com/)?.[1] || "crm";

  const tenantUrls: TenantUrlValues = {
    tenant: targetTenantId,
    sharepoint: `${targetTenantId}.sharepoint.com`,
    dynamicsCrm: `${targetTenantId}.${crmRegion}.dynamics.com`,
    onmicrosoft: `${targetTenantId}.onmicrosoft.com`,
  };

  // Build replacement map: original URL → resolved URL
  const replacements = new Map<string, string>();
  for (const url of detectedUrls) {
    const resolved = templater.resolveTemplate(url.templatePattern, tenantUrls);
    if (resolved !== url.originalUrl) {
      replacements.set(url.originalUrl, resolved);
    }
  }

  if (replacements.size === 0) return null;

  // Modify the ZIP
  const zipBuffer = readFileSync(originalZipPath);
  const modifiedBuffer = await templater.modifySolution(zipBuffer, replacements, new JSZip());

  // Write to temp file
  const tempPath = join(tmpdir(), `agentsync-deploy-${randomUUID()}.zip`);
  writeFileSync(tempPath, modifiedBuffer);

  return tempPath;
}

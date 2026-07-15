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
import {
  existsSync,
  readdirSync,
  statSync,
  unlinkSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import chalk from "chalk";
import { createSpinner, isQuietMode } from "../lib/spinner.js";
import Table from "cli-table3";
import { output, resolveFormat, type Column, type OutputFormat } from "../lib/output.js";
import { emitEnvelope, nextAction, type NextAction } from "../lib/envelope.js";
import {
  type Config,
  TenantConfig,
  TokenManager,
  DataverseClient,
  SolutionOperations,
  UrlTemplater,
  WaveService,
  DeploymentService,
  DEMO_SOLUTIONS,
  demoDeploymentStore,
  getEffectiveConnectionMappings,
  getEffectiveEnvironmentVariables,
  loadConfig,
  resolveTenantUrls,
  type TenantUrlValues,
  type DetectedUrl,
  environmentSetupService,
  detectSolutionMode,
  getDemoTenantMetadata,
} from "@pax8/cta-core";
import { isDemo, withResolvedDestinations, type LoadedConfig } from "../lib/command-wrapper.js";
import { getClientSecretWithFallback } from "../lib/credentials.js";
import { CliError, handleCommandError } from "../lib/errors.js";
import { isInteractivePrompt, pickFromList, printRunningCommand } from "../lib/picker.js";
import { showDemoBanner } from "../lib/demo-banner.js";

// ---------------------------------------------------------------------------
// Output schema — used by output()/resolveFormat() so --quiet, --json, and
// TTY-default JSON behave consistently with `tenants list` / `deployments list`
// (issue #357). Two structured surfaces flow through the helper:
//   - DestinationRow: the "Shipping Destinations" preview table
//   - DeployResultRow: the live-mode per-tenant deploy outcome / summary
// Demo mode emits a single envelope (`{ deploymentId, solution, destinations[] }`)
// directly via JSON.stringify when --json is requested, so it keeps its
// existing pirate-themed table rendering for the human path while still
// honoring --quiet and pipe-default JSON.
// ---------------------------------------------------------------------------

interface DestinationRow {
  name: string;
  tenantId: string;
  tenantIdShort: string;
  environmentUrl: string;
  hostname: string;
  tags: string;
}

const DESTINATION_COLUMNS: Column<DestinationRow>[] = [
  { key: "name", header: "Destination" },
  { key: "tenantIdShort", header: "Tenant ID" },
  { key: "hostname", header: "Port" },
  { key: "tags", header: "Tags" },
];

interface DeployResultRow {
  tenant: string;
  tenantId: string;
  status: "success" | "failed";
  message: string;
}

const DEPLOY_RESULT_COLUMNS: Column<DeployResultRow>[] = [
  { key: "tenant", header: "Destination" },
  {
    key: "status",
    header: "Status",
    format: (v) => (v === "success" ? chalk.green("Success") : chalk.red("Failed")),
  },
  { key: "message", header: "Message" },
];

function buildDestinationRows(destinations: TenantConfig[]): DestinationRow[] {
  return destinations.map((tenant) => ({
    name: tenant.name,
    tenantId: tenant.tenantId,
    tenantIdShort: tenant.tenantId.slice(0, 8) + "...",
    environmentUrl: tenant.environmentUrl,
    hostname: new URL(tenant.environmentUrl).hostname,
    tags: tenant.tags?.join(", ") || "-",
  }));
}

/**
 * Walk through visible "what real mode does" stages in demo mode so the
 * deploy doesn't feel instantaneous. ~3 seconds total — short enough not to
 * stall a live demo, long enough to read.
 */
async function simulateDemoDeployProgress(tenantNames: string[]): Promise<void> {
  if (isQuietMode() || !process.stdout.isTTY) return;

  const stages: Array<{ label: string; ms: number }> = [
    { label: "Authenticating to Microsoft Graph (GDAP delegation)", ms: 600 },
    {
      label: `Resolving ${tenantNames.length} target environment(s) via Power Platform admin`,
      ms: 500,
    },
    { label: "Importing solution to Dataverse Web API", ms: 900 },
    { label: "Activating workflows and publishing customizations", ms: 700 },
  ];

  for (const stage of stages) {
    const sp = createSpinner(stage.label).start();
    await new Promise((r) => setTimeout(r, stage.ms));
    sp.succeed(stage.label);
  }
  console.log();
}

/**
 * Persist a demo-mode deploy to the in-process `demoDeploymentStore` so
 * `deployments list` / `deployments show <id>` immediately surface the same
 * tracking ID the user just saw printed.
 *
 * The shape mirrors `generateMockDeployment` (a `DeploymentJob`): one
 * tenant-result entry per destination, all marked `completed`, with start/end
 * timestamps clustered around `now` so duration calculations look reasonable.
 */
function recordDemoDeployment(opts: {
  deploymentId: string;
  solutionInput: string;
  isFilePath: boolean;
  destinations: TenantConfig[];
  managed: boolean;
}): void {
  const now = Date.now();
  const startedAtIso = new Date(now).toISOString();
  // Stagger per-tenant completion so the table shows a tiny ramp instead of
  // every tenant finishing at the exact same instant.
  const tenantResults = opts.destinations.map((tenant, index) => ({
    tenantId: tenant.tenantId,
    tenantName: tenant.name,
    status: "completed" as const,
    startedAt: new Date(now + index * 1000).toISOString(),
    completedAt: new Date(now + (index + 1) * 5000).toISOString(),
    solutionImportJobId: `import-${tenant.tenantId.slice(0, 8)}-demo`,
    attemptNumber: 1,
  }));

  const totalTenants = tenantResults.length;
  const durationMs = totalTenants * 5000;
  const completedAtIso = new Date(now + durationMs).toISOString();

  // Solution name: derive from the input. For zip paths, strip the directory
  // and `.zip` suffix so the listing shows something readable.
  const solutionName = opts.isFilePath
    ? opts.solutionInput
        .split(/[\\/]/)
        .pop()
        ?.replace(/\.zip$/i, "") || opts.solutionInput
    : opts.solutionInput;

  demoDeploymentStore.record({
    id: opts.deploymentId,
    solutionPath: opts.isFilePath ? opts.solutionInput : `./solutions/${opts.solutionInput}.zip`,
    solutionName,
    solutionVersion: "1.0.0.2",
    status: "completed",
    createdAt: startedAtIso,
    updatedAt: completedAtIso,
    startedAt: startedAtIso,
    completedAt: completedAtIso,
    tenantResults,
    totalTenants,
    completedTenants: totalTenants,
    failedTenants: 0,
    triggeredBy: "cli",
    durationMs,
    canRollback: true,
  });
}

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
  deploy TestDeploy --all                Deploy to all tenants
  deploy TestDeploy --tag production     Deploy to production tenants only
  deploy TestDeploy --all --dry-run      Preview without deploying
  deploy ./TestDeploy.zip --all          Deploy a pre-exported zip file
  deploy TestDeploy --all --skip-url-replace  Skip URL replacement
`
  )
  .action(async (solutionArg: string | undefined, options, cmd) => {
    // Merge global flags (--json, --quiet registered on root) into local options.
    // Without this, Commander consumes --json at the root level and deploy's
    // options.json is undefined, breaking `deploy --dry-run --json`.
    Object.assign(options, cmd.optsWithGlobals());
    const mergedTenantFilters = [...(options.tenant ?? []), ...(options.tenants ?? [])];
    if (mergedTenantFilters.length > 0) {
      options.tenant = Array.from(new Set(mergedTenantFilters));
    }

    if (solutionArg && !options.solution) options.solution = solutionArg;

    // No solution provided? In an interactive terminal, offer a picker drawn
    // from `./agent packages/*.zip` (and DEMO_SOLUTIONS in demo mode).
    // Scripts/pipelines (--json, --quiet, non-TTY) skip the picker and get
    // the existing usage error so they fail fast instead of hanging.
    if (!options.solution && isInteractivePrompt({ json: options.json, quiet: options.quiet })) {
      const picked = await pickSolutionInteractively();
      if (picked) {
        options.solution = picked;
      }
    }

    if (!options.solution) {
      console.error(chalk.red("Error: solution name or path required."));
      console.error(chalk.gray("  Example: deploy TestDeploy --all"));
      process.exit(2);
    }

    // Resolve the structured output format once — drives --quiet/--json gating
    // and TTY-default JSON for the destinations preview and the post-deploy
    // summary blocks (issue #357). Dry-run keeps its own JSON branch (the
    // existing envelope shape is preserved by runDryRunPreview).
    const fmt: OutputFormat = resolveFormat({
      json: options.json,
      quiet: options.quiet,
    });

    // No target selection? In an interactive terminal, offer a picker
    // (tags from the fleet plus an "all" sentinel). Same TTY guard as above.
    if (
      !options.all &&
      (!options.tag || options.tag.length === 0) &&
      (!options.tenant || options.tenant.length === 0) &&
      isInteractivePrompt({ json: options.json, quiet: options.quiet })
    ) {
      const picked = await pickTargetInteractively(options.config);
      if (picked === "all") {
        options.all = true;
      } else if (picked) {
        options.tag = [picked];
      }

      if (options.solution && (options.all || options.tag?.length)) {
        const targetFlag = options.all ? "--all" : `--tag ${options.tag![0]}`;
        printRunningCommand(["deploy", options.solution, ...targetFlag.split(" ")]);
      }
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

          // Validate the solution argument against the demo catalog before we
          // pretend to export/ship. Without this, demo mode silently accepts
          // typos like "CusteomrServiceAgent" and prints a fake success — that
          // teaches users the CLI accepts garbage and hides typos during
          // demos. Real-mode deploy already errors when an unknown solution
          // name fails to export, so we only need to backfill the demo path.
          // ZIP path inputs ("./foo.zip") still pretend-export without file
          // existence checks (the existing demo contract for paths).
          if (!isFilePath) {
            const knownDemoNames = DEMO_SOLUTIONS.map((sol) => sol.uniqueName);
            // Case-sensitive match — the CLI is case-sensitive about solution
            // names elsewhere (export/import use the uniqueName verbatim).
            if (!knownDemoNames.includes(solutionArg)) {
              const preview = knownDemoNames.slice(0, 5);
              const lines = [
                `Solution '${solutionArg}' not found in the demo catalog.`,
                "Available demo solutions:",
                ...preview.map((name) => `  - ${name}`),
                "Run 'solutions list' to see all available demo solutions.",
              ];
              throw new CliError(lines.join("\n"));
            }
          }

          // DEMO MODE banner is informational chrome — keep it on stderr but
          // suppress under --quiet/--json (callers piping JSON shouldn't see
          // unstructured noise on either stream during automated runs).
          if (fmt === "table") {
            showDemoBanner();
          }

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

          const destinationRows = buildDestinationRows(destinations);
          const demoDeploymentId = `dep-demo-${Date.now().toString(36)}`;
          const packageLabel = isFilePath ? solutionArg : `${solutionArg} (exported)`;

          // Record the demo deploy in the in-process store so a follow-up
          // `deployments list` / `deployments show <id>` finds the tracking ID
          // we just printed. Without this, the natural
          // "I just deployed → show me what landed" demo beat broke because
          // the listing came purely from canned `generateMockDeploymentHistory`.
          recordDemoDeployment({
            deploymentId: demoDeploymentId,
            solutionInput: solutionArg,
            isFilePath,
            destinations,
            managed: !options.unmanaged,
          });

          if (fmt === "json") {
            // Demo success envelope — distinct from the dry-run plan shape.
            emitEnvelope(
              {
                demo: true,
                deploymentId: demoDeploymentId,
                package: packageLabel,
                solution: solutionArg,
                managed: !options.unmanaged,
                destinations: destinationRows.map((row) => ({
                  name: row.name,
                  tenantId: row.tenantId,
                  environmentUrl: row.environmentUrl,
                  tags: destinations.find((t) => t.tenantId === row.tenantId)?.tags ?? [],
                })),
                totalDestinations: destinations.length,
              },
              {
                command: "deploy",
                summary: { totalDestinations: destinations.length },
                nextActions: [
                  nextAction(
                    "View this deployment",
                    ["deployments", "show", demoDeploymentId],
                    "Inspect per-tenant results for the deployment just recorded"
                  ),
                ],
              }
            );
            return null;
          }

          if (fmt === "quiet") {
            // No-op — caller cares about exit code only.
            return null;
          }

          // Human-readable (table) path.
          if (!isFilePath) {
            console.log(chalk.bold("📤 Export Simulation:"));
            console.log(`  Solution:      ${chalk.green(solutionArg)}`);
            console.log(`  Version:       1.0.0.2 (demo)`);
            console.log(`  Type:          ${options.unmanaged ? "Unmanaged" : "Managed"}`);
            console.log();
          }

          console.log(chalk.bold(`🎯 Deployment Targets (${destinations.length}):`));
          console.log();
          output(destinationRows, { format: "table", columns: DESTINATION_COLUMNS });
          console.log();

          // Simulate the deploy work so the demo doesn't feel instantaneous.
          // Real deploys hit Microsoft Graph + Dataverse Web API per tenant —
          // this mirrors that activity at a watchable pace.
          await simulateDemoDeployProgress(destinations.map((t) => t.name));

          console.log(chalk.green("✓ Deployment dispatched successfully (demo)"));
          console.log();
          console.log(chalk.bold("📋 Deployment Details:"));
          console.log(`  Deployment ID:  ${chalk.cyan(demoDeploymentId)}`);
          console.log(`  Solution:       ${packageLabel}`);
          console.log(`  Target tenants: ${destinations.length}`);
          console.log();
          console.log(
            chalk.gray(`Use 'pax8-cta deployments show ${demoDeploymentId}' to track progress`)
          );
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
            if (fmt === "table") {
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
            }
            // Default to majority mode
            managed = modeCheck.managedCount >= modeCheck.unmanagedCount;
            if (fmt === "table") {
              console.log(
                chalk.cyan(`Proceeding with ${managed ? "managed" : "unmanaged"} mode (majority)`)
              );
              console.log();
            }
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

          if (fmt === "table") {
            console.log();
          }
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

      // Display destinations through the structured output() helper so
      // --quiet/--json/TTY-default JSON behave consistently (issue #357).
      const destinationRows = buildDestinationRows(destinations);
      if (fmt === "table") {
        console.log();
        console.log(chalk.bold(`Deployment Targets (${destinations.length}):`));
        output(destinationRows, { format: "table", columns: DESTINATION_COLUMNS });
        console.log();
      }

      // Verify client secret is available
      await getClientSecretWithFallback();

      // Auto-setup app users if needed (unless --no-auto-setup)
      if (options.autoSetup !== false) {
        if (fmt === "table") {
          console.log(chalk.bold("Checking application users..."));
        }
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

        if (fmt === "table") {
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
      }

      // Deploy directly to each tenant sequentially
      if (fmt === "table") {
        console.log(chalk.bold("Deploying to destinations...\n"));
      }

      const clientSecret = await getClientSecretWithFallback();
      let successCount = 0;
      let failCount = 0;
      // Track per-tenant outcomes so we can render a structured summary at the
      // end (table for humans, rows in the JSON envelope for pipelines).
      const deployResults: DeployResultRow[] = [];

      // Scan solution for tenant-specific URLs (once, before the loop)
      let detectedUrls: DetectedUrl[] = [];
      if (!options.skipUrlReplace) {
        try {
          const JSZip = (await import("jszip")).default;
          const zipBuffer = readFileSync(agentPackagePath);
          const zip = await JSZip.loadAsync(zipBuffer);
          const templater = new UrlTemplater();
          detectedUrls = await templater.scanSolution(zip);

          if (detectedUrls.length > 0 && fmt === "table") {
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
            deployResults.push({
              tenant: tenant.name,
              tenantId: tenant.tenantId,
              status: "success",
              message: "Deployed successfully",
            });
          } else {
            const message = result.error || "Deployment failed";
            tenantSpinner.fail(chalk.red(`${tenant.name}: ${message}`));
            failCount++;
            deployResults.push({
              tenant: tenant.name,
              tenantId: tenant.tenantId,
              status: "failed",
              message,
            });
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          tenantSpinner.fail(chalk.red(`${tenant.name}: ${errorMsg}`));
          failCount++;
          deployResults.push({
            tenant: tenant.name,
            tenantId: tenant.tenantId,
            status: "failed",
            message: errorMsg,
          });
        }
      }

      // Render the post-deploy summary through the same output() pipeline as
      // tenants-list / deployments-list. JSON callers get a structured envelope
      // (results[] + counts); --quiet stays silent; the human path keeps the
      // bold "Deployment Summary" block.
      if (fmt === "json") {
        // On any failure, point the agent at the failed-deployment listing so
        // it can inspect which tenants need attention.
        const actions: NextAction[] =
          failCount > 0
            ? [
                nextAction(
                  "Review failed deployments",
                  ["deployments", "list", "--status", "failed"],
                  "List deployments that did not complete successfully"
                ),
              ]
            : [];
        emitEnvelope(
          {
            demo: false,
            solution: solutionArg,
            total: destinations.length,
            success: successCount,
            failed: failCount,
            results: deployResults,
          },
          {
            command: "deploy",
            summary: { total: destinations.length, success: successCount, failed: failCount },
            nextActions: actions,
          }
        );
      } else if (fmt === "table") {
        console.log();
        console.log(chalk.bold("Deployment Summary:"));
        output(deployResults, { format: "table", columns: DEPLOY_RESULT_COLUMNS });
        console.log(`  Total:     ${destinations.length}`);
        console.log(`  ${chalk.green("Success:")}  ${successCount}`);
        if (failCount > 0) {
          console.log(`  ${chalk.red("Failed:")}   ${failCount}`);
        }
      }
      // fmt === "quiet" (and any future formats) intentionally produce no
      // success-path stdout.

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

      handleCommandError(error, spinner, "Deployment failed");
    }
  });

interface DryRunActionOptions {
  json?: boolean;
  quiet?: boolean;
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

/**
 * Demo-mode dry-run validation derived from the tenant's demo metadata.
 *
 * Uses the same gdapStatus / connectionStatus → severity mapping as the
 * `solutions drift --risk` analyzer (`risk-analyzer.ts:283-410`) so the two
 * views never disagree about a tenant. Tenants without demo metadata fall
 * back to the previous "skipped" behaviour so non-demo configs are
 * unaffected.
 */
function deriveDemoValidation(tenant: TenantConfig): DryRunValidation {
  const meta = getDemoTenantMetadata(tenant.tenantId);
  if (!meta) {
    return { status: "skipped", errors: [], warnings: ["No demo metadata available"] };
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  switch (meta.gdapStatus) {
    case "missing_role":
      errors.push("Missing Power Platform Admin role on GDAP relationship");
      break;
    case "expired":
      errors.push("GDAP relationship expired");
      break;
    case "propagating":
      warnings.push("GDAP recently added — permissions may not have propagated yet");
      break;
    case "expiring_soon":
      warnings.push("GDAP relationship expires within 7 days");
      break;
  }

  switch (meta.connectionStatus) {
    case "expired":
      errors.push("Expired connection references");
      break;
    case "missing":
      errors.push("Connection references missing");
      break;
    case "expiring_certificate":
      warnings.push("Connection certificate expires soon");
      break;
  }

  if (meta.recentFailures >= 3) {
    warnings.push(`${meta.recentFailures} recent deploy failures on this tenant`);
  }

  if (meta.riskProfile === "production-critical" && errors.length === 0) {
    warnings.push("Production-critical tenant — approval recommended");
  }

  return {
    status: errors.length > 0 ? "fail" : "pass",
    errors,
    warnings,
  };
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

interface SolutionPickItem {
  display: string;
  value: string;
  hint?: string;
}

/**
 * Build the candidate list for the solution picker:
 *   - Every `*.zip` under `./agent packages/` (most-recent first).
 *   - In demo mode, also surface the synthetic DEMO_SOLUTIONS by uniqueName
 *     so users exploring without real exports still have something to pick.
 */
function gatherSolutionCandidates(): SolutionPickItem[] {
  const items: SolutionPickItem[] = [];
  const agentPackagesDir = resolve(process.cwd(), "agent packages");

  if (existsSync(agentPackagesDir)) {
    try {
      const zips = readdirSync(agentPackagesDir)
        .filter((f) => f.endsWith(".zip"))
        .map((f) => {
          const path = join(agentPackagesDir, f);
          return { name: f, path, mtime: statSync(path).mtimeMs };
        })
        .sort((a, b) => b.mtime - a.mtime);

      for (const zip of zips) {
        items.push({
          display: zip.name,
          value: zip.path,
          hint: "agent packages/",
        });
      }
    } catch {
      // Directory unreadable — silently skip; user can still type a path.
    }
  }

  if (isDemo()) {
    for (const demo of DEMO_SOLUTIONS) {
      // Skip if already represented by a real zip with the same base name.
      if (items.some((it) => it.display.startsWith(demo.uniqueName))) continue;
      items.push({
        display: demo.uniqueName,
        value: demo.uniqueName,
        hint: "demo",
      });
    }
  }

  return items;
}

async function pickSolutionInteractively(): Promise<string | undefined> {
  const candidates = gatherSolutionCandidates();
  if (candidates.length === 0) return undefined;

  const chosen = await pickFromList(candidates, {
    prompt: "Pick a solution to deploy:",
    label: (it) => it.display,
    hint: (it) => it.hint,
  });
  return chosen?.value;
}

/**
 * Build the target picker — distinct tags drawn from the fleet plus an
 * "all" sentinel for "deploy everywhere". Returns the selected tag string,
 * the literal `"all"`, or undefined if the user skipped.
 */
async function pickTargetInteractively(
  configPath: string | undefined
): Promise<string | undefined> {
  let tenants: TenantConfig[] = [];
  try {
    if (isDemo()) {
      const { getDemoTenants } = await import("./demo.js");
      tenants = getDemoTenants({ all: true });
    } else {
      const path = resolve(process.cwd(), configPath ?? "./config/tenants.yaml");
      const config = await loadConfig(path);
      tenants = config.tenants.filter((t) => t.enabled);
    }
  } catch {
    // Config unavailable — let the caller fall through to the default --all.
    return undefined;
  }

  const tagSet = new Set<string>();
  for (const t of tenants) {
    for (const tag of t.tags ?? []) tagSet.add(tag);
  }

  const items: { display: string; value: string; hint?: string }[] = [
    { display: "all tenants", value: "all", hint: `${tenants.length} enabled` },
    ...Array.from(tagSet)
      .sort()
      .map((tag) => ({
        display: `--tag ${tag}`,
        value: tag,
        hint: `${tenants.filter((t) => t.tags?.includes(tag)).length} tenant(s)`,
      })),
  ];

  if (items.length === 1) {
    // Only "all" is available — no point prompting; the default kicks in.
    return undefined;
  }

  const chosen = await pickFromList(items, {
    prompt: "Pick a deployment target:",
    label: (it) => it.display,
    hint: (it) => it.hint,
  });
  return chosen?.value;
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

  // Honor --quiet, --json, and TTY-default JSON when piped (issue #357).
  // ids-only/csv aren't meaningful for a dry-run plan; treat anything that
  // resolves to a non-quiet/non-json format as "table" (the human path).
  const fmt = resolveFormat({
    json: context.options.json,
    quiet: context.options.quiet,
  });

  if (fmt === "quiet") {
    // No output; exit code below still reflects validation failures.
  } else if (fmt === "json") {
    const clean = plan.summary.validationFailedTenants === 0;
    const actions: NextAction[] = clean
      ? [
          nextAction(
            "Run the deployment for real",
            ["deploy", plan.solution],
            "Re-run without --dry-run to execute the plan"
          ),
        ]
      : [];
    emitEnvelope(plan, {
      command: "deploy",
      summary: plan.summary as unknown as Record<string, unknown>,
      nextActions: actions,
    });
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
    // Derive plausible per-tenant validation from demo metadata so the dry-run
    // table shows real signal (PASS / WARN / FAIL with reasons) instead of a
    // wall of "SKIPPED" cells. Drives the demo story "this tool actually
    // checked each tenant before deploying."
    for (const tenant of context.destinations) {
      validationByTenant.set(tenant.tenantId, deriveDemoValidation(tenant));
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
  const tempPath = join(tmpdir(), `pax8-cta-deploy-${randomUUID()}.zip`);
  writeFileSync(tempPath, modifiedBuffer);

  return tempPath;
}

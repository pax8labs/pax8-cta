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
import { type DeploymentJob, demoDeploymentStore, RollbackService } from "@pax8-cta/core";
import { createSpinner } from "../../lib/spinner.js";
import { withDemoMode, isDemo } from "../../lib/command-wrapper.js";
import { CliError, handleCommandError } from "../../lib/errors.js";
import { confirm, isInteractivePrompt } from "../../lib/picker.js";
import { getDeploymentById, resolveDeploymentFormat } from "./helpers.js";

/**
 * Per-tenant outcome shape used in the JSON envelope.
 */
type UndoTenantStatus = "rolled-back" | "skipped" | "failed";

interface UndoTenantResult {
  tenantId: string;
  tenantName: string;
  status: UndoTenantStatus;
  error?: string;
}

/**
 * Top-level JSON envelope emitted by `--json`.
 */
interface UndoJsonEnvelope {
  deploymentId: string;
  status: "rolled-back" | "partial" | "failed";
  tenants: Array<{
    tenantName: string;
    status: UndoTenantStatus;
    error?: string;
  }>;
}

interface UndoOptions {
  config?: string;
  dryRun?: boolean;
  yes?: boolean;
  json?: boolean;
  quiet?: boolean;
}

export const undoCommand = new Command("undo")
  .argument("<id>", "Deployment ID to roll back")
  .description("Roll back a previous deployment to its prior solution version")
  .option("-c, --config <path>", "Path to config file", "./config/tenants.yaml")
  .option("--dry-run", "Show what would be undone without making changes")
  .option("-y, --yes", "Skip confirmation prompt")
  .option("--json", "Output as JSON")
  .option("--quiet", "Suppress all output")
  .addHelpText(
    "after",
    `
Examples:
  deployments undo dep-demo-123                Undo a deployment after confirming
  deployments undo dep-demo-123 --dry-run      Preview without making changes
  deployments undo dep-demo-123 -y --json      Skip prompt, JSON output
`
  )
  .action(async (id: string, options, cmd) => {
    const opts: UndoOptions = { ...options, ...cmd.optsWithGlobals() };

    await withDemoMode(
      () => demoUndo(id, opts),
      () => realUndo(id, opts)
    ).catch((error) => handleCommandError(error, undefined, "Undo failed"));
  });

/**
 * Build a "did you mean..." suggestion from the most recent demo deployments.
 * Helpful when the user typo-fingered the ID; quiet otherwise.
 */
function buildDidYouMeanHint(): string {
  if (!isDemo()) {
    // Real-mode hint is intentionally minimal — we don't have a cheap way to
    // list recent deployments without GDAP credentials. Point at `list`.
    return "Run 'pax8-cta deployments list' to see available deployments.";
  }

  const recent = demoDeploymentStore
    .list()
    .filter((d) => !d.rollbackFromDeploymentId) // skip prior undo entries
    .slice(0, 5);

  if (recent.length === 0) {
    return "Run 'pax8-cta deployments list' to see available deployments.";
  }

  const lines = recent.map((d) => `  - ${d.id} (${d.solutionName})`);
  return (
    `Did you mean one of these?\n${lines.join("\n")}\n\n` +
    `Run 'pax8-cta deployments list' to see all available deployments.`
  );
}

/**
 * Decide the overall envelope status from per-tenant results.
 */
function aggregateStatus(results: UndoTenantResult[]): UndoJsonEnvelope["status"] {
  const allOk = results.every((r) => r.status === "rolled-back");
  if (allOk) return "rolled-back";
  const allFailed = results.every((r) => r.status !== "rolled-back");
  if (allFailed) return "failed";
  return "partial";
}

/**
 * Map the demo-mode in-memory undo back to the public JSON envelope.
 */
function envelopeFor(deploymentId: string, results: UndoTenantResult[]): UndoJsonEnvelope {
  return {
    deploymentId,
    status: aggregateStatus(results),
    tenants: results.map((r) => ({
      tenantName: r.tenantName,
      status: r.status,
      ...(r.error ? { error: r.error } : {}),
    })),
  };
}

async function demoUndo(id: string, options: UndoOptions): Promise<void> {
  const original = await getDeploymentById(id);
  if (!original) {
    throw new CliError(`Deployment '${id}' not found.\n${buildDidYouMeanHint()}`);
  }

  // Reject undo of an undo: the second-level rollback is meaningless and
  // confusing to surface in the audit trail.
  if (original.rollbackFromDeploymentId) {
    throw new CliError(
      `Deployment '${id}' is itself an undo (of ${original.rollbackFromDeploymentId}). ` +
        `It cannot be rolled back again.`
    );
  }

  // Honor the explicit `canRollback: false` flag set on demo records.
  // This is the cleanest way to surface "this deployment cannot be undone"
  // (e.g. failed deploys with no successful tenants, very old records).
  if (original.canRollback === false) {
    throw new CliError(
      `Deployment '${id}' is not eligible for rollback ` +
        `(canRollback: false). This is typically because the deploy already ` +
        `failed, was already rolled back, or is too old for a snapshot to ` +
        `exist. Run 'pax8-cta deployments show ${id}' for details.`
    );
  }

  const succeededTenants = original.tenantResults.filter((r) => r.status === "completed");
  if (succeededTenants.length === 0) {
    throw new CliError(
      `Deployment '${id}' has no successfully-deployed tenants to roll back. ` +
        `Run 'pax8-cta deployments show ${id}' to inspect per-tenant status.`
    );
  }

  const fmt = resolveDeploymentFormat(options);
  const verbose = fmt !== "json" && fmt !== "quiet";

  if (verbose) {
    console.log();
    console.log(chalk.bold("Rollback Preview"));
    console.log(`  Original deployment: ${chalk.cyan(original.id)}`);
    console.log(
      `  Solution:            ${original.solutionName} ${chalk.gray(`(v${original.solutionVersion ?? "?"})`)}`
    );
    console.log(
      `  Tenants to undo:     ${succeededTenants.length} of ${original.tenantResults.length}`
    );
    console.log();
    succeededTenants.forEach((t) => {
      console.log(`  ${chalk.gray("•")} ${t.tenantName}`);
    });
    console.log();
  }

  // Dry-run path: emit a preview-shaped envelope (or human text) and bail
  // before mutating the store.
  if (options.dryRun) {
    const previewResults: UndoTenantResult[] = succeededTenants.map((t) => ({
      tenantId: t.tenantId,
      tenantName: t.tenantName,
      status: "rolled-back",
    }));

    if (fmt === "json") {
      const envelope = {
        ...envelopeFor(original.id, previewResults),
        dryRun: true,
      };
      console.log(JSON.stringify(envelope, null, 2));
      return;
    }
    if (verbose) {
      console.log(chalk.gray("(dry run — no changes were made)"));
    }
    return;
  }

  // Confirmation gate: only when stdin/stdout are both real TTYs and the
  // caller didn't pass `-y`. Pipelined / scripted invocations skip this.
  if (!options.yes && isInteractivePrompt(options)) {
    const proceed = await confirm(
      chalk.bold(
        `Roll back deployment ${original.id} (${original.solutionName} v${original.solutionVersion ?? "?"}) on ${succeededTenants.length} tenant${succeededTenants.length === 1 ? "" : "s"}? [y/N] `
      )
    );
    if (!proceed) {
      if (verbose) {
        console.log(chalk.gray("Cancelled."));
      }
      return;
    }
  }

  // Per-tenant simulated rollback. Spins for visual fidelity in TTY mode;
  // silent and synchronous-feeling in --json/--quiet.
  const undoStartedAt = new Date();
  const undoResults: UndoTenantResult[] = [];
  const tenantJobResults: DeploymentJob["tenantResults"] = [];

  for (const tenant of succeededTenants) {
    const sp = verbose ? createSpinner(`Rolling back ${tenant.tenantName}...`).start() : null;
    await new Promise((r) => setTimeout(r, 250));
    sp?.succeed(chalk.green(`${tenant.tenantName}: restored prior version`));

    undoResults.push({
      tenantId: tenant.tenantId,
      tenantName: tenant.tenantName,
      status: "rolled-back",
    });
    tenantJobResults.push({
      tenantId: tenant.tenantId,
      tenantName: tenant.tenantName,
      status: "completed",
      startedAt: new Date(undoStartedAt.getTime() + tenantJobResults.length * 100).toISOString(),
      completedAt: new Date(
        undoStartedAt.getTime() + (tenantJobResults.length + 1) * 350
      ).toISOString(),
      attemptNumber: 1,
      previousVersion: original.solutionVersion,
    });
  }

  const undoCompletedAt = new Date(undoStartedAt.getTime() + undoResults.length * 400);
  const undoJob: DeploymentJob = {
    id: `dep-demo-undo-${Date.now().toString(36)}`,
    solutionPath: original.solutionPath,
    solutionName: original.solutionName,
    solutionVersion: original.solutionVersion,
    status: "completed",
    createdAt: undoStartedAt.toISOString(),
    updatedAt: undoCompletedAt.toISOString(),
    startedAt: undoStartedAt.toISOString(),
    completedAt: undoCompletedAt.toISOString(),
    tenantResults: tenantJobResults,
    totalTenants: tenantJobResults.length,
    completedTenants: tenantJobResults.length,
    failedTenants: 0,
    triggeredBy: "cli",
    durationMs: tenantJobResults.length * 400,
    rollbackFromDeploymentId: original.id,
    canRollback: false,
  };
  demoDeploymentStore.record(undoJob);

  // Mark the original as no-longer-rollback-able so a second `undo` on the
  // same id surfaces a sensible error rather than silently re-rolling.
  demoDeploymentStore.record({ ...original, canRollback: false });

  if (fmt === "json") {
    console.log(JSON.stringify(envelopeFor(original.id, undoResults), null, 2));
    return;
  }

  if (verbose) {
    console.log();
    console.log(chalk.green.bold("Rollback complete"));
    console.log(`  Undo deployment: ${chalk.cyan(undoJob.id)}`);
    console.log(`  Tenants undone:  ${undoResults.length}`);
    console.log();
    console.log(chalk.gray(`Run 'deployments show ${undoJob.id}' for details.`));
  }
}

/**
 * Real-mode undo path.
 *
 * Today this is wired to `RollbackService` from `@pax8-cta/core` but the
 * snapshots that `RollbackService.rollback()` consumes are not yet created
 * by `pax8-cta deploy` (Phase 2 of #418). So the practical end-state for
 * any current real-mode caller is "no snapshots → CliError with recovery
 * hint." We still instantiate the service and probe for snapshots so that
 * once Phase 2 lands, this path becomes complete without further wiring.
 */
async function realUndo(id: string, options: UndoOptions): Promise<void> {
  const fmt = resolveDeploymentFormat(options);
  const verbose = fmt !== "json" && fmt !== "quiet";

  const rollbackService = new RollbackService();
  const snapshots = await rollbackService.listSnapshotsForDeployment(id);

  if (snapshots.length === 0) {
    throw new CliError(
      `No rollback snapshots found for deployment '${id}'.\n` +
        `\n` +
        `Snapshots are written when a deploy runs with rollback enabled in ` +
        `your config (RollbackSettings.enabled). Wiring this into 'pax8-cta ` +
        `deploy' is tracked as Phase 2 of #418 ` +
        `(https://github.com/pax8labs/pax8-cta/issues/418).\n` +
        `\n` +
        `Workaround: uninstall the solution per tenant with ` +
        `'pax8-cta solutions remove <name> -t <tenant>'.\n` +
        `Demo: 'DEMO_MODE=true pax8-cta deployments undo ${id} -y' shows the ` +
        `flow end-to-end.`
    );
  }

  if (verbose) {
    console.log();
    console.log(chalk.bold("Rollback Preview"));
    console.log(`  Original deployment: ${chalk.cyan(id)}`);
    console.log(`  Snapshots found:     ${snapshots.length}`);
    console.log();
    snapshots.forEach((s) => {
      console.log(
        `  ${chalk.gray("•")} ${s.tenantName} ${chalk.gray(`(prev v${s.previousVersion})`)}`
      );
    });
    console.log();
  }

  if (options.dryRun) {
    const previewResults: UndoTenantResult[] = snapshots.map((s) => ({
      tenantId: s.tenantId,
      tenantName: s.tenantName,
      status: "rolled-back",
    }));
    if (fmt === "json") {
      console.log(JSON.stringify({ ...envelopeFor(id, previewResults), dryRun: true }, null, 2));
      return;
    }
    if (verbose) {
      console.log(chalk.gray("(dry run — no changes were made)"));
    }
    return;
  }

  if (!options.yes && isInteractivePrompt(options)) {
    const proceed = await confirm(
      chalk.bold(
        `Roll back deployment ${id} on ${snapshots.length} tenant${snapshots.length === 1 ? "" : "s"}? [y/N] `
      )
    );
    if (!proceed) {
      if (verbose) {
        console.log(chalk.gray("Cancelled."));
      }
      return;
    }
  }

  // Per-tenant rollback. We can't actually call `RollbackService.rollback()`
  // without a `DataverseClient` per tenant, which requires a real
  // TokenManager bootstrapped from a config + GDAP credentials. That wiring
  // mirrors `deploy.ts` exactly; once Phase 2 lands a snapshot in deploy,
  // the code below should pick that snapshot up via the per-tenant
  // DataverseClient path. For now we surface a clean CliError.
  throw new CliError(
    `Real-mode undo found ${snapshots.length} snapshot(s) for deployment '${id}', ` +
      `but the per-tenant Dataverse rollback path is not yet wired into the ` +
      `CLI (Phase 2 of #418). Use 'pax8-cta solutions remove <name> -t <tenant>' ` +
      `per tenant as a workaround.`
  );
}

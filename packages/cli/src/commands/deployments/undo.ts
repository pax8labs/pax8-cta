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
import { type DeploymentJob, demoDeploymentStore } from "@agentsync/core";
import { createSpinner } from "../../lib/spinner.js";
import { withDemoMode } from "../../lib/command-wrapper.js";
import { CliError, handleCommandError } from "../../lib/errors.js";
import { question } from "../../lib/input.js";
import { getDeploymentById, resolveDeploymentFormat } from "./helpers.js";

export const undoCommand = new Command("undo")
  .argument("<id>", "Deployment ID to roll back")
  .description("Roll back a previous deployment to its prior solution version")
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
    const opts = { ...options, ...cmd.optsWithGlobals() };

    await withDemoMode(
      () => demoUndo(id, opts),
      () => realUndo(id, opts)
    ).catch((error) => handleCommandError(error, undefined, "Undo failed"));
  });

interface UndoOptions {
  dryRun?: boolean;
  yes?: boolean;
  json?: boolean;
  quiet?: boolean;
}

async function demoUndo(id: string, options: UndoOptions): Promise<void> {
  const original = await getDeploymentById(id);
  if (!original) {
    throw new CliError(
      `Deployment '${id}' not found. Run 'deployments list' to see available deployments.`
    );
  }

  if (original.rollbackFromDeploymentId) {
    throw new CliError(
      `Deployment '${id}' is itself an undo (of ${original.rollbackFromDeploymentId}). ` +
        `Run 'deployments show ${original.rollbackFromDeploymentId}' to see the original.`
    );
  }

  const succeededTenants = original.tenantResults.filter((r) => r.status === "completed");
  if (succeededTenants.length === 0) {
    throw new CliError(
      `Deployment '${id}' has no successfully-deployed tenants to roll back. ` +
        `Run 'deployments show ${id}' to inspect per-tenant status.`
    );
  }

  const fmt = resolveDeploymentFormat(options);
  const verbose = fmt !== "json" && fmt !== "quiet";

  if (verbose) {
    console.log();
    console.log(chalk.bold("⏪ Rollback Preview"));
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

  if (options.dryRun) {
    if (verbose) {
      console.log(chalk.gray("(dry run — no changes were made)"));
    } else if (fmt === "json") {
      console.log(
        JSON.stringify(
          {
            dryRun: true,
            original: { id: original.id, solutionName: original.solutionName },
            wouldUndo: succeededTenants.map((t) => ({
              tenantId: t.tenantId,
              tenantName: t.tenantName,
            })),
          },
          null,
          2
        )
      );
    }
    return;
  }

  if (!options.yes && verbose && process.stdout.isTTY) {
    const answer = (await question(chalk.bold(`Roll back this deployment? [y/N] `)))
      .trim()
      .toLowerCase();
    if (answer !== "y" && answer !== "yes") {
      console.log(chalk.gray("Cancelled."));
      return;
    }
  }

  // Per-tenant simulated rollback.
  const undoStartedAt = new Date();
  const undoResults = [];
  for (const tenant of succeededTenants) {
    const sp = verbose ? createSpinner(`Rolling back ${tenant.tenantName}...`).start() : null;
    await new Promise((r) => setTimeout(r, 350));
    sp?.succeed(chalk.green(`${tenant.tenantName}: restored prior version`));

    undoResults.push({
      tenantId: tenant.tenantId,
      tenantName: tenant.tenantName,
      status: "completed" as const,
      startedAt: new Date(undoStartedAt.getTime() + undoResults.length * 100).toISOString(),
      completedAt: new Date(undoStartedAt.getTime() + (undoResults.length + 1) * 350).toISOString(),
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
    tenantResults: undoResults,
    totalTenants: undoResults.length,
    completedTenants: undoResults.length,
    failedTenants: 0,
    triggeredBy: "cli",
    durationMs: undoResults.length * 400,
    rollbackFromDeploymentId: original.id,
    canRollback: false,
  };
  demoDeploymentStore.record(undoJob);

  if (fmt === "json") {
    console.log(
      JSON.stringify(
        { undo: { id: undoJob.id, originalId: original.id, tenantsUndone: undoResults.length } },
        null,
        2
      )
    );
    return;
  }

  if (verbose) {
    console.log();
    console.log(chalk.green.bold("✓ Rollback complete"));
    console.log(`  Undo deployment: ${chalk.cyan(undoJob.id)}`);
    console.log(`  Tenants undone:  ${undoResults.length}`);
    console.log();
    console.log(chalk.gray(`Run 'deployments show ${undoJob.id}' for details.`));
  }
}

async function realUndo(_id: string, _options: UndoOptions): Promise<void> {
  throw new CliError(
    "Real-mode undo isn't implemented yet. " +
      "deploy doesn't currently create snapshots, so there's nothing to roll back to. " +
      "Wiring RollbackService into deploy + this command is tracked in #418 " +
      "(https://github.com/pax8labs/agentsync/issues/418). " +
      "For now, use 'agentsync solutions remove <name> -t <tenant>' per tenant. " +
      "Demo mode supports undo end-to-end if you just want to see the flow."
  );
}

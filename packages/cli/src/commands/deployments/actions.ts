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
import { isDemo } from "../../lib/command-wrapper.js";
import { exitOssUnavailable } from "../../lib/oss-surface.js";

// ============================================================================
// deployments approve
// ============================================================================

export const approveCommand = new Command("approve")
  .argument("<id>", "Deployment ID")
  .description("Approve a pending deployment that requires approval")
  .action(async (id: string, _options) => {
    if (isDemo()) {
      console.error(chalk.yellow("\n⚠️  DEMO MODE - Approval workflow not yet implemented\n"));
      console.log(chalk.yellow(`⚠ Deployment ${chalk.cyan(id)} approval is simulated (no-op)`));
      console.log(
        chalk.gray("\nIn production, this will approve a deployment awaiting manual review.")
      );
      console.log(chalk.gray("This feature is planned for a future release."));
      process.exit(2);
    }

    exitOssUnavailable("deployments approve", {
      alternatives: ["Use 'agentsync deployments show <id>' to inspect deployment details."],
    });
  });

// ============================================================================
// deployments reject
// ============================================================================

export const rejectCommand = new Command("reject")
  .argument("<id>", "Deployment ID")
  .description("Reject a pending deployment")
  .option("-r, --reason <text>", "Reason for rejection")
  .action(async (id: string, options) => {
    if (isDemo()) {
      console.error(chalk.yellow("\n⚠️  DEMO MODE - Rejection workflow not yet implemented\n"));
      console.log(chalk.yellow(`⚠ Deployment ${chalk.cyan(id)} rejection is simulated (no-op)`));
      if (options.reason) {
        console.log(chalk.gray(`  Reason: ${options.reason}`));
      }
      console.log(chalk.gray("\nIn production, this will reject and cancel a pending deployment."));
      console.log(chalk.gray("This feature is planned for a future release."));
      process.exit(2);
    }

    exitOssUnavailable("deployments reject", {
      alternatives: ["Use 'agentsync deployments show <id>' to inspect deployment details."],
    });
  });

// ============================================================================
// deployments cancel
// ============================================================================

export const cancelCommand = new Command("cancel")
  .argument("<id>", "Deployment ID")
  .description("Cancel an in-progress deployment")
  .action(async (id: string, _options) => {
    if (isDemo()) {
      console.error(chalk.yellow("\n⚠️  DEMO MODE\n"));
      console.log(chalk.gray(`⊘ Deployment ${chalk.cyan(id)} cancelled`));
      return;
    }

    exitOssUnavailable("deployments cancel", {
      alternatives: [
        "Run a new 'agentsync deploy --direct' for the tenant subset you want to correct.",
      ],
    });
  });

// ============================================================================
// deployments retry
// ============================================================================

export const retryCommand = new Command("retry")
  .argument("<id>", "Deployment ID")
  .description("Retry failed tenants in a deployment")
  .option("-t, --tenant <tenantId>", "Retry only a specific tenant")
  .action(async (id: string, options) => {
    if (isDemo()) {
      console.error(chalk.yellow("\n⚠️  DEMO MODE\n"));
      if (options.tenant) {
        console.log(
          chalk.cyan(`↻ Retrying tenant ${options.tenant} in deployment ${chalk.cyan(id)}`)
        );
      } else {
        console.log(chalk.cyan(`↻ Retrying all failed tenants in deployment ${chalk.cyan(id)}`));
      }
      console.log(chalk.gray("\nUse 'agentsync deployments show " + id + "' to monitor progress."));
      return;
    }

    exitOssUnavailable("deployments retry", {
      alternatives: [
        "Run 'agentsync deploy --direct --tag <tag>' or '--all' to re-run deployment flows.",
      ],
    });
  });

// ============================================================================
// deployments rollback
// ============================================================================

export const rollbackCommand = new Command("rollback")
  .argument("<id>", "Deployment ID")
  .description("Rollback a completed deployment to the previous version")
  .action(async (id: string, _options) => {
    if (isDemo()) {
      console.error(chalk.yellow("\n⚠️  DEMO MODE - Rollback not yet implemented\n"));

      console.log(chalk.yellow(`⚠ Deployment ${chalk.cyan(id)} rollback is simulated (no-op)`));
      console.log(chalk.gray("\nIn production, this will restore the previous solution version."));
      console.log(
        chalk.gray("Rollback requires solution snapshots which are not currently captured.")
      );
      console.log(chalk.gray("This feature is planned for a future release."));
      process.exit(2);
    }

    exitOssUnavailable("deployments rollback", {
      alternatives: ["Deploy a known-good solution package using 'agentsync deploy --direct'."],
    });
  });

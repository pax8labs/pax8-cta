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
import { handleCommandError } from "../lib/errors.js";
import { runInitWizard } from "./init-wizard.js";

const DEFAULT_CONFIG_PATH = "./config/tenants.yaml";

export const initCommand = new Command("init")
  .description("Initialize AgentSync with guided setup")
  .option("-c, --config <path>", "Path to create manifest file", DEFAULT_CONFIG_PATH)
  .option("--demo", "Set up in demo mode (skip credential prompts)")
  .option("--no-gdap", "Skip automatic GDAP tenant discovery (for non-MSP setups)")
  .option("--interactive", "Run interactive setup wizard with Azure AD app creation")
  .action(async (options) => {
    // Handle interactive mode
    if (options.interactive) {
      const { runInteractiveWizard } = await import("../lib/interactive-wizard.js");

      try {
        const result = await runInteractiveWizard(options.config);

        if (result.success) {
          process.exit(0);
        } else {
          process.exit(1);
        }
      } catch (error) {
        handleCommandError(error, null, "Interactive setup failed");
      }
      return;
    }

    await runInitWizard(options);
  });

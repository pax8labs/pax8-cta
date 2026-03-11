/**
 * Copyright 2024 Pax8 Labs
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
import ora from "ora";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createInterface } from "node:readline/promises";

const DEFAULT_CONFIG_PATH = "./config/tenants.yaml";

export const initCommand = new Command("init")
  .description("Initialize AgentSync with guided setup")
  .option("-c, --config <path>", "Path to create manifest file", DEFAULT_CONFIG_PATH)
  .option("--demo", "Set up in demo mode (skip credential prompts)")
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
        console.error(chalk.red("\n✖ Interactive setup failed"));
        if (error instanceof Error) {
          console.error(chalk.red(error.message));
        }
        process.exit(1);
      }
      return;
    }

    console.log(chalk.cyan.bold("\n🚀 AgentSync Setup Wizard\n"));

    if (options.demo) {
      // Demo mode setup
      console.log(chalk.yellow("Setting up in DEMO MODE..."));
      console.log(chalk.gray("You can explore AgentSync features without credentials.\n"));

      const spinner = ora("Enabling demo mode...").start();

      // Enable demo mode
      const { saveCliConfig } = await import("./demo.js");
      saveCliConfig({ demoMode: true });

      spinner.succeed("Demo mode enabled");

      console.log();
      console.log(chalk.green("✓ Setup complete!"));
      console.log();
      console.log(chalk.cyan("Try these commands:"));
      console.log(chalk.gray("  agentsync fleet list          ") + chalk.dim("# View demo fleet"));
      console.log(chalk.gray("  agentsync --help             ") + chalk.dim("# See all commands"));
      console.log();
      console.log(chalk.dim("To switch to production mode later: agentsync demo off"));
      return;
    }

    // Production setup
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    let partnerTenantId = "";
    let partnerClientId = "";
    let clientSecretCreated = false;

    try {
      console.log(chalk.white("We'll need your Azure AD app registration details.\n"));

      // Ask about sign-in (optional helper)
      const wantSignIn = await rl.question(
        chalk.cyan("Sign in to auto-discover your apps? ") +
          chalk.gray("(y/n) [or press Enter to skip] ")
      );

      if (wantSignIn.toLowerCase() === "y" || wantSignIn.toLowerCase() === "yes") {
        // Device code flow to discover apps
        console.log();

        try {
          const { interactiveLogin } = await import("../lib/auth.js");
          const { GraphClient } = await import("../lib/graph-client.js");

          // Don't use spinner during device code - MSAL prints the code/URL directly
          console.log(chalk.cyan("Opening Microsoft sign-in...\n"));

          const loginResult = await interactiveLogin({
            scopes: ["https://graph.microsoft.com/.default"],
          });

          const spinner = ora().start();

          partnerTenantId = loginResult.tenantId;
          spinner.succeed(`Authenticated to tenant ${partnerTenantId}`);

          // List app registrations
          spinner.start("Fetching your app registrations...");
          const graphClient = new GraphClient({ accessToken: loginResult.accessToken });
          const apps = await graphClient.listAppRegistrations();

          if (apps.length === 0) {
            spinner.warn("No app registrations found");
            console.log(chalk.gray("\nYou'll need to create one first:"));
            console.log(
              chalk.underline(
                "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/CreateApplicationBlade"
              )
            );
            console.log();

            // Fall back to manual entry
            partnerClientId = await rl.question(chalk.white("Client ID (after creating app): "));
          } else {
            spinner.succeed(`Found ${apps.length} app registration(s)`);
            console.log();

            // Display apps for selection
            console.log(chalk.cyan("Your App Registrations:\n"));
            apps.forEach((app, index) => {
              console.log(chalk.white(`  ${index + 1}. ${app.displayName}`));
              console.log(chalk.gray(`     Client ID: ${app.appId}`));
            });
            console.log(chalk.white(`  ${apps.length + 1}. Enter manually`));
            console.log();

            const selection = await rl.question(chalk.white("Select an app (number): "));
            const selectedIndex = parseInt(selection, 10) - 1;

            if (selectedIndex >= 0 && selectedIndex < apps.length) {
              const selectedApp = apps[selectedIndex];
              partnerClientId = selectedApp.appId;
              console.log(chalk.green(`\n✓ Selected: ${selectedApp.displayName}`));

              // Offer to create a client secret
              console.log();
              const wantSecret = await rl.question(
                chalk.cyan("Create a new client secret for this app? ") + chalk.gray("(y/n) ")
              );

              if (wantSecret.toLowerCase() === "y" || wantSecret.toLowerCase() === "yes") {
                const secretSpinner = ora("Creating client secret...").start();
                try {
                  const secret = await graphClient.createClientSecret(
                    selectedApp.id,
                    "AgentSync CLI",
                    24
                  );

                  secretSpinner.succeed("Client secret created");
                  console.log();
                  console.log(
                    chalk.yellow("⚠️  IMPORTANT: Copy this secret now - it won't be shown again!")
                  );
                  console.log(chalk.white(`   Secret: ${chalk.bold(secret.secretText)}`));
                  console.log(
                    chalk.gray(`   Expires: ${new Date(secret.endDateTime).toLocaleDateString()}`)
                  );
                  console.log();

                  // Offer to store in keychain
                  const wantStore = await rl.question(
                    chalk.cyan("Store this secret securely in OS keychain? ") + chalk.gray("(y/n) ")
                  );

                  if (wantStore.toLowerCase() === "y" || wantStore.toLowerCase() === "yes") {
                    const { storeCredentials } = await import("../lib/auth.js");
                    await storeCredentials(partnerClientId, secret.secretText, partnerTenantId);
                    console.log(chalk.green("✓ Secret stored in keychain"));
                    clientSecretCreated = true;
                  }
                } catch (error) {
                  secretSpinner.fail("Failed to create secret");
                  console.log(
                    chalk.gray(`   ${error instanceof Error ? error.message : "Unknown error"}`)
                  );
                  console.log(chalk.gray("\n   You can create one manually in the Azure Portal."));
                }
              }
            } else {
              // Manual entry
              partnerClientId = await rl.question(chalk.white("\nClient ID: "));
            }
          }
        } catch (error) {
          console.log(chalk.red("\n✖ Authentication failed"));
          console.log(chalk.gray(`   ${error instanceof Error ? error.message : "Unknown error"}`));
          console.log(chalk.gray("\n   Falling back to manual setup...\n"));

          // Fall back to manual entry
          partnerTenantId = "";
          partnerClientId = "";
        }
      }

      // Manual entry if not set via auth flow
      if (!partnerTenantId) {
        console.log(chalk.cyan("\n1. Partner Tenant ID"));
        console.log(
          chalk.gray("   Your Microsoft Entra (Azure AD) tenant ID where the app is registered.")
        );
        console.log(
          chalk.gray("   Find it at: ") +
            chalk.underline(
              "https://portal.azure.com/#view/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/~/Overview"
            )
        );
        console.log(chalk.gray("   Look for 'Tenant ID' in the overview section.\n"));
        partnerTenantId = await rl.question(chalk.white("Tenant ID: "));
      }

      if (!partnerClientId) {
        console.log(chalk.cyan("\n2. App Registration Client ID"));
        console.log(chalk.gray("   The Application (client) ID of your registered Azure AD app."));
        console.log(
          chalk.gray("   Find it at: ") +
            chalk.underline(
              "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
            )
        );
        console.log(chalk.gray("   Select your app and copy the 'Application (client) ID'.\n"));
        partnerClientId = await rl.question(chalk.white("Client ID: "));
      }

      // Client Secret info (only if not already created)
      if (!clientSecretCreated) {
        console.log();
        console.log(chalk.cyan("3. Client Secret"));
        console.log(
          chalk.gray("   Create a secret in your app registration under 'Certificates & secrets'.")
        );
        console.log(
          chalk.gray("   Direct link: ") +
            chalk.underline(
              `https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/Credentials/appId/${partnerClientId}/isMSAApp~/false`
            )
        );
        console.log();
        console.log(chalk.yellow("⚠️  Store your secret securely using one of these methods:"));
        console.log(chalk.white("  • OS Keychain (recommended): agentsync auth login"));
        console.log(
          chalk.white('  • Environment variable: export PARTNER_CLIENT_SECRET="your-secret"')
        );
      }
      console.log();

      // Ask about sample tenants
      const wantSample = await rl.question(
        chalk.cyan("Include sample tenant configuration? ") + chalk.gray("(y/n) ")
      );

      rl.close();

      // Create config
      const spinner = ora("Creating configuration...").start();

      const configPath = resolve(process.cwd(), options.config);
      const configDir = dirname(configPath);

      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
      }

      const includeSample = wantSample.toLowerCase() === "y" || wantSample.toLowerCase() === "yes";

      const configContent = `# AgentSync Configuration File
# Generated by: agentsync init

# Partner/MSP Credentials (Azure AD App Registration)
# Find these at: https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade
partner:
  tenantId: "${partnerTenantId}"
  clientId: "${partnerClientId}"
  # Client secret should be stored securely:
  #   Option 1 (recommended): agentsync auth login
  #   Option 2: export PARTNER_CLIENT_SECRET="your-secret"

# Settings
settings:
  approval:
    required: false
    minApprovals: 1
    timeout: "24h"
    approvers:
      - admin@partner.com

# Your Tenants
tenants:${
        includeSample
          ? `
  # Sample tenant - replace with your actual tenants
  - tenantId: "00000000-0000-0000-0000-000000000000"
    name: "Sample Client"
    environmentUrl: "https://sample.crm.dynamics.com"
    enabled: true
    tags:
      - production
      - enterprise`
          : `
  # Add your tenants here:
  # - tenantId: "tenant-guid-here"
  #   name: "Client Name"
  #   environmentUrl: "https://client.crm.dynamics.com"
  #   enabled: true
  #   tags:
  #     - production`
      }
`;

      writeFileSync(configPath, configContent);
      spinner.succeed(`Configuration created at ${configPath}`);

      console.log();
      console.log(chalk.green("✓ Setup complete!"));
      console.log();
      console.log(chalk.cyan("Next steps:"));

      let stepNum = 1;
      if (!clientSecretCreated) {
        console.log(chalk.gray(`  ${stepNum}. Store your client secret securely:`));
        console.log(chalk.white("     agentsync auth login"));
        console.log();
        stepNum++;
      }

      console.log(chalk.gray(`  ${stepNum}. Add your tenant destinations to:`));
      console.log(chalk.white(`     ${configPath}`));
      console.log();
      stepNum++;

      console.log(chalk.gray(`  ${stepNum}. Verify GDAP access:`));
      console.log(chalk.white("     agentsync tenants inspect"));
      console.log();
      console.log(chalk.dim("Or explore in demo mode first: agentsync demo on"));
    } catch (error) {
      console.error(chalk.red("\n✖ Setup failed"));
      if (error instanceof Error) {
        console.error(chalk.red(error.message));
      }
      process.exit(1);
    }
  });

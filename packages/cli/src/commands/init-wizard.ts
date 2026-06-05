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

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import chalk from "chalk";
import open from "open";
import { createSpinner } from "../lib/spinner.js";
import { question, questionHidden } from "../lib/input.js";
import { handleCommandError } from "../lib/errors.js";
import {
  storeClientSecretWithFallback,
  type InitTenantInput,
  writeInitConfigFile,
} from "./init-config.js";
import {
  discoverGdapTenantsWithEnvironments,
  showEnvironmentSummary,
  testCredentialsAndGdap,
} from "./init-validation.js";

export interface InitWizardOptions {
  config: string;
  demo?: boolean;
  gdap?: boolean;
}

/**
 * Open a URL in the default browser
 */
function openUrl(url: string): void {
  open(url);
}

/**
 * Run the standard (non-interactive) init wizard flow.
 */
export async function runInitWizard(options: InitWizardOptions): Promise<void> {
  console.log(chalk.cyan.bold("\n🚀 Pax8 CTA Setup Wizard\n"));

  // If the user is currently in demo mode and didn't pass --demo, confirm
  // before switching them to a real-mode setup. Real init writes Azure AD
  // credentials and disables demo, so users may get here unintentionally
  // (e.g. expecting to refresh their demo).
  if (!options.demo) {
    const { isDemoModeEnabled } = await import("./demo.js");
    if (isDemoModeEnabled()) {
      console.log(chalk.yellow("ℹ️  You're currently in demo mode."));
      console.log(chalk.gray("`init` sets up real Azure AD credentials and will exit demo mode."));
      const confirm = await question(chalk.cyan("Continue? ") + chalk.gray("(y/N) "));
      if (!/^(y|yes)$/i.test(confirm.trim())) {
        console.log();
        console.log(chalk.gray("Setup cancelled."));
        console.log(chalk.gray("  • To refresh demo setup:    init --demo"));
        console.log(chalk.gray("  • To exit demo manually:    demo off"));
        return;
      }
      console.log();
    }
  }

  // Check if config already exists. options.config can be undefined when
  // the REPL state-reset wipes Commander's option defaults between
  // iterations — fall back to the same default Commander declares.
  const configPath = resolve(process.cwd(), options.config ?? "./config/tenants.yaml");

  if (existsSync(configPath)) {
    console.log(chalk.yellow(`⚠️  Configuration already exists: ${configPath}\n`));
    const overwrite = await question(
      chalk.white("Overwrite existing configuration? ") + chalk.gray("(y/n) ")
    );

    if (overwrite.toLowerCase() !== "y" && overwrite.toLowerCase() !== "yes") {
      console.log(chalk.gray("\nSetup cancelled. Your existing configuration was preserved."));
      console.log(chalk.gray("To modify settings, edit: " + configPath));
      return;
    }
    console.log();
  }

  if (options.demo) {
    // Demo mode setup
    console.log(chalk.yellow("Setting up in DEMO MODE..."));
    console.log(chalk.gray("You can explore Pax8 CTA features without credentials.\n"));

    const spinner = createSpinner("Enabling demo mode...").start();

    // Enable demo mode
    const { saveCliConfig } = await import("./demo.js");
    saveCliConfig({ demoMode: true });

    spinner.succeed("Demo mode enabled");

    console.log();
    console.log(chalk.green("✓ Setup complete!"));
    console.log();
    console.log(chalk.cyan("Try these commands:"));
    console.log(chalk.gray("  tenants list        ") + chalk.dim("# View demo tenants"));
    console.log(chalk.gray("  help                ") + chalk.dim("# See all commands"));
    console.log();
    console.log(chalk.dim("To switch to production mode later: demo off"));
    return;
  }

  let partnerTenantId = "";
  let partnerClientId = "";
  let partnerClientSecret = "";
  let clientSecretCreated = false;

  try {
    console.log(chalk.white("We'll need your Azure AD app registration details.\n"));

    // Ask about sign-in (optional helper)
    const wantSignIn = await question(
      chalk.cyan("Sign in to auto-discover your apps? ") +
        chalk.gray("(y/n) [or press Enter to skip] ")
    );

    if (wantSignIn.toLowerCase() === "y" || wantSignIn.toLowerCase() === "yes") {
      // Device code flow to discover apps
      console.log();

      try {
        const { interactiveLogin } = await import("../lib/auth.js");
        const { GraphClient } = await import("../lib/graph-client.js");

        // Tell user what's happening before opening browser
        console.log(chalk.cyan("Opening Microsoft sign-in..."));
        console.log(chalk.gray("   We'll open: https://microsoft.com/devicelogin\n"));

        const loginResult = await interactiveLogin({
          scopes: ["https://graph.microsoft.com/.default"],
          openBrowser: true, // Auto-open browser
        });

        const spinner = createSpinner().start();

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
          partnerClientId = await question(chalk.white("Client ID (after creating app): "));
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

          const selection = await question(chalk.white("Select an app (number): "));
          const selectedIndex = parseInt(selection, 10) - 1;

          if (selectedIndex >= 0 && selectedIndex < apps.length) {
            const selectedApp = apps[selectedIndex];
            partnerClientId = selectedApp.appId;
            console.log(chalk.green(`\n✓ Selected: ${selectedApp.displayName}`));

            // Offer to create a client secret
            console.log();
            const wantSecret = await question(
              chalk.cyan("Create a new client secret for this app? ") + chalk.gray("(y/n) ")
            );

            if (wantSecret.toLowerCase() === "y" || wantSecret.toLowerCase() === "yes") {
              const secretSpinner = createSpinner("Creating client secret...").start();
              try {
                const secret = await graphClient.createClientSecret(
                  selectedApp.id,
                  "Pax8 CTA CLI",
                  24
                );

                secretSpinner.succeed("Client secret created");
                console.log();
                console.log(chalk.yellow("⚠️  IMPORTANT: Secret created for this app."));
                console.log(
                  chalk.gray(`   Expires: ${new Date(secret.endDateTime).toLocaleDateString()}`)
                );
                console.log();

                const canRevealSecret = process.env.CI !== "true";
                let secretWasRevealed = false;

                if (canRevealSecret) {
                  const revealSecret = await question(
                    chalk.cyan("Reveal this secret once on screen? ") +
                      chalk.gray("(y/n, default: n) ")
                  );

                  if (revealSecret.toLowerCase() === "y" || revealSecret.toLowerCase() === "yes") {
                    console.log(chalk.white(`   Secret: ${chalk.bold(secret.secretText)}`));
                    console.log();
                    secretWasRevealed = true;
                  } else {
                    console.log(chalk.gray("   Secret kept hidden."));
                    console.log();
                  }
                } else {
                  console.log(chalk.gray("   CI detected. Secret value will not be displayed."));
                  console.log();
                }

                // Offer to store in keychain
                const wantStore = await question(
                  chalk.cyan("Store this secret securely in OS keychain? ") + chalk.gray("(y/n) ")
                );

                if (wantStore.toLowerCase() === "y" || wantStore.toLowerCase() === "yes") {
                  const { storeCredentials } = await import("../lib/auth.js");
                  await storeCredentials(partnerClientId, secret.secretText, partnerTenantId);
                  console.log(chalk.green("✓ Secret stored in keychain"));
                  clientSecretCreated = true;
                } else if (!secretWasRevealed) {
                  console.log(
                    chalk.gray(
                      "   Secret was not shown. You'll be prompted to enter one manually next."
                    )
                  );
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
            partnerClientId = await question(chalk.white("\nClient ID: "));
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
      const tenantIdUrl =
        "https://portal.azure.com/#view/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/~/Overview";

      console.log(chalk.cyan("\n1. Partner Tenant ID"));
      console.log(chalk.gray("   Your Microsoft Entra (Azure AD) tenant ID."));

      const tenantInput = await question(
        chalk.white("   Tenant ID ") + chalk.gray("(or 'o' to open Azure Portal): ")
      );

      if (tenantInput.toLowerCase() === "o" || tenantInput.toLowerCase() === "open") {
        openUrl(tenantIdUrl);
        console.log(chalk.green("   ✓ Opened - look for 'Tenant ID'"));
        partnerTenantId = await question(chalk.white("   Tenant ID: "));
      } else {
        partnerTenantId = tenantInput;
      }
    }

    if (!partnerClientId) {
      const appRegUrl =
        "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade";

      console.log(chalk.cyan("\n2. App Registration Client ID"));
      console.log(chalk.gray("   The Application (client) ID of your Azure AD app."));

      const clientInput = await question(
        chalk.white("   Client ID ") + chalk.gray("(or 'o' to open Azure Portal): ")
      );

      if (clientInput.toLowerCase() === "o" || clientInput.toLowerCase() === "open") {
        openUrl(appRegUrl);
        console.log(chalk.green("   ✓ Opened - select your app, copy 'Application (client) ID'"));
        partnerClientId = await question(chalk.white("   Client ID: "));
      } else {
        partnerClientId = clientInput;
      }
    }

    // Client Secret (only if not already created via sign-in flow)
    if (!clientSecretCreated) {
      const secretUrl = `https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/Credentials/appId/${partnerClientId}/isMSAApp~/false`;

      console.log(chalk.cyan("\n3. Client Secret"));
      console.log(
        chalk.gray("   The secret Value from your app registration (not the Secret ID).")
      );

      let clientSecret = await questionHidden(
        chalk.white("   Secret Value ") + chalk.gray("(or 'o' to open Azure Portal): ")
      );

      if (clientSecret.toLowerCase() === "o" || clientSecret.toLowerCase() === "open") {
        openUrl(secretUrl);
        console.log(chalk.green("   ✓ Opened - click 'New client secret', copy the 'Value'"));
        clientSecret = await questionHidden(chalk.white("   Secret Value: "));
      }

      if (clientSecret) {
        const storeResult = await storeClientSecretWithFallback(
          partnerTenantId,
          partnerClientId,
          clientSecret
        );
        partnerClientSecret = storeResult.partnerClientSecret;
        clientSecretCreated = storeResult.clientSecretCreated;
      } else {
        console.log(chalk.gray('   You can add it later: export PARTNER_CLIENT_SECRET="..."'));
      }
    }

    // Source environment (where agents are developed)
    let sourceEnvironmentUrl = "";
    console.log(chalk.cyan("\n4. Source Environment"));
    console.log(chalk.gray("   The Power Platform environment where you develop agents.\n"));

    // Try discovering environments via Global Discovery Service
    if (partnerClientSecret) {
      try {
        const { TokenManager } = await import("@pax8/cta-core");
        const tokenManager = new TokenManager({
          tenantId: partnerTenantId,
          clientId: partnerClientId,
          clientSecret: partnerClientSecret,
        });
        const dvToken = await tokenManager.getToken([
          "https://globaldisco.crm.dynamics.com/.default",
        ]);
        const resp = await fetch(
          "https://globaldisco.crm.dynamics.com/api/discovery/v2.0/Instances",
          {
            headers: { Authorization: `Bearer ${dvToken}` },
          }
        );

        if (resp.ok) {
          const data = (await resp.json()) as {
            value: Array<{ FriendlyName: string; Url: string; State: number }>;
          };
          const instances = (data.value || []).filter((i) => i.State === 0);

          if (instances.length > 0) {
            console.log(chalk.green(`   Found ${instances.length} environment(s):\n`));
            instances.forEach((env, i) => {
              console.log(chalk.white(`   ${i + 1}. ${env.FriendlyName}`));
              console.log(chalk.gray(`      ${env.Url}`));
            });
            console.log(chalk.white(`   ${instances.length + 1}. Enter manually`));
            console.log(chalk.white(`   ${instances.length + 2}. Skip for now`));
            console.log();

            const selection = await question(
              chalk.white("   Select source environment (number): ")
            );
            const idx = parseInt(selection, 10) - 1;

            if (idx >= 0 && idx < instances.length) {
              sourceEnvironmentUrl = instances[idx].Url;
              console.log(chalk.green(`   ✓ Source: ${instances[idx].FriendlyName}`));
            } else if (idx === instances.length) {
              sourceEnvironmentUrl = await question(chalk.white("   Source environment URL: "));
            }
            // else: skip
          }
        }
      } catch {
        // Discovery failed - fall through to manual prompt
      }
    }

    // Fall back to manual entry if discovery didn't produce a result
    if (!sourceEnvironmentUrl) {
      sourceEnvironmentUrl = await question(
        chalk.white("   Source environment URL ") +
          chalk.gray("(e.g. https://org123.crm.dynamics.com, or Enter to skip): ")
      );
    }

    // Try to discover tenants via GDAP (automatic unless --no-gdap)
    console.log();
    const tenants: InitTenantInput[] = [];

    // If we have credentials, try GDAP discovery automatically
    if (clientSecretCreated && options.gdap !== false) {
      const discovered = await discoverGdapTenantsWithEnvironments(
        partnerTenantId,
        partnerClientId,
        partnerClientSecret
      );

      if (discovered.length > 0) {
        console.log();

        // Let user select which tenants/environments to add
        for (const tenant of discovered) {
          if (tenant.environments.length === 0) {
            console.log(chalk.gray(`   ${tenant.name}: No Dataverse environments found, skipping`));
            continue;
          }

          const add = await question(
            chalk.white(`   Add ${tenant.name}? `) +
              chalk.gray(`(${tenant.environments.length} environment(s)) `) +
              chalk.gray("(y/n) ")
          );

          if (add.toLowerCase() === "y" || add.toLowerCase() === "yes") {
            // If multiple environments, let them pick or add all
            if (tenant.environments.length === 1) {
              const env = tenant.environments[0];
              tenants.push({
                tenantId: tenant.tenantId,
                name: `${tenant.name}`,
                environmentUrl: env.instanceUrl,
              });
              console.log(chalk.green(`   ✓ Added ${tenant.name} (${env.displayName})`));
            } else {
              // Multiple environments - show list
              console.log(chalk.cyan(`   Environments for ${tenant.name}:`));
              tenant.environments.forEach((env, i) => {
                console.log(
                  chalk.gray(`     ${i + 1}. ${env.displayName} (${env.type}) - ${env.instanceUrl}`)
                );
              });

              const envChoice = await question(
                chalk.white("   Add which? ") + chalk.gray("(number, 'all', or 'skip') ")
              );

              if (envChoice.toLowerCase() === "all") {
                for (const env of tenant.environments) {
                  tenants.push({
                    tenantId: tenant.tenantId,
                    name: `${tenant.name} - ${env.displayName}`,
                    environmentUrl: env.instanceUrl,
                  });
                }
                console.log(
                  chalk.green(`   ✓ Added all ${tenant.environments.length} environments`)
                );
              } else if (envChoice.toLowerCase() !== "skip") {
                const envIndex = parseInt(envChoice, 10) - 1;
                if (envIndex >= 0 && envIndex < tenant.environments.length) {
                  const env = tenant.environments[envIndex];
                  tenants.push({
                    tenantId: tenant.tenantId,
                    name: `${tenant.name} - ${env.displayName}`,
                    environmentUrl: env.instanceUrl,
                  });
                  console.log(chalk.green(`   ✓ Added ${env.displayName}`));
                }
              }
            }
          }
        }
      }
    }

    // If --no-gdap was specified, mention it
    if (options.gdap === false && clientSecretCreated) {
      console.log(
        chalk.gray("GDAP discovery skipped (--no-gdap). You can add tenants manually.\n")
      );
    }

    // If no tenants added yet, offer manual entry
    if (tenants.length === 0) {
      console.log(chalk.cyan("\n5. Target Tenants"));
      console.log(chalk.gray("   Customer tenants where agents will be deployed."));
      console.log(chalk.gray("   These must be real Microsoft 365 tenants your app has access to"));
      console.log(chalk.gray("   (via GDAP or direct app consent). You can add them later.\n"));

      const addTenant = await question(
        chalk.white("   Add a target tenant now? ") + chalk.gray("(y/n, most users skip this) ")
      );

      if (addTenant.toLowerCase() === "y" || addTenant.toLowerCase() === "yes") {
        let addMore = true;
        while (addMore) {
          console.log(chalk.cyan(`\n   Tenant ${tenants.length + 1}:`));

          const tenantName = await question(chalk.white("     Name (e.g., Contoso): "));
          const tenantId = await question(chalk.white("     Tenant ID (Azure AD GUID): "));
          const envUrl = await question(
            chalk.white("     Environment URL (e.g., https://contoso.crm.dynamics.com): ")
          );

          if (tenantName && tenantId && envUrl) {
            tenants.push({ tenantId, name: tenantName, environmentUrl: envUrl });
            console.log(chalk.green(`     ✓ Added ${tenantName}`));
          }

          const another = await question(
            chalk.white("\n   Add another tenant? ") + chalk.gray("(y/n) ")
          );
          addMore = another.toLowerCase() === "y" || another.toLowerCase() === "yes";
        }
      }
    }

    // Create config (keep rl open for test prompt later)
    console.log(chalk.cyan("\n  Creating configuration..."));
    writeInitConfigFile(
      configPath,
      partnerTenantId,
      partnerClientId,
      sourceEnvironmentUrl,
      tenants
    );

    // Disable demo mode since user is setting up real credentials
    const { saveCliConfig } = await import("./demo.js");
    saveCliConfig({ demoMode: false });

    // Offer to test credentials and discover GDAP tenants
    console.log();
    const testConnection = await question(
      chalk.cyan("Test your credentials now? ") + chalk.gray("(y/n) ")
    );

    if (testConnection.toLowerCase() === "y" || testConnection.toLowerCase() === "yes") {
      await testCredentialsAndGdap(partnerTenantId, partnerClientId, partnerClientSecret, tenants);
    }

    console.log();
    console.log(chalk.green.bold("✓ Setup complete!\n"));

    // Show live environment summary if we have credentials and tenants
    if (partnerClientSecret && (sourceEnvironmentUrl || tenants.length > 0)) {
      await showEnvironmentSummary(
        partnerTenantId,
        partnerClientId,
        partnerClientSecret,
        sourceEnvironmentUrl,
        tenants
      );
    } else if (tenants.length === 0) {
      console.log(chalk.cyan("Next steps:"));
      console.log();
      console.log(chalk.white("  1. Add target tenants to your config:"));
      console.log(chalk.gray("     " + configPath));
      console.log();
      console.log(chalk.white("  2. Verify your configuration:"));
      console.log(chalk.gray("     tenants list -c " + options.config));
      console.log();
    }
    console.log(chalk.dim("Run 'help' to see all available commands."));
  } catch (error) {
    handleCommandError(error, null, "Setup failed");
  }
}

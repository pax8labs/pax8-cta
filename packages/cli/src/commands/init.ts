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
import { createSpinner } from "../lib/spinner.js";
import { existsSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { exec } from "node:child_process";
import { question } from "../lib/input.js";
import { handleCommandError } from "../lib/errors.js";

const DEFAULT_CONFIG_PATH = "./config/tenants.yaml";

/**
 * Open a URL in the default browser
 */
function openUrl(url: string): void {
  const command =
    process.platform === "darwin"
      ? `open "${url}"`
      : process.platform === "win32"
        ? `start "${url}"`
        : `xdg-open "${url}"`;
  exec(command);
}

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

    console.log(chalk.cyan.bold("\n🚀 AgentSync Setup Wizard\n"));

    // Check if config already exists
    const configPath = resolve(process.cwd(), options.config);

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
      console.log(chalk.gray("You can explore AgentSync features without credentials.\n"));

      const spinner = createSpinner("Enabling demo mode...").start();

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
                  const wantStore = await question(
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

        // TODO: Add masked input for secret (see https://github.com/pax8-labs/agentsync/issues/XXX)
        let clientSecret = await question(
          chalk.white("   Secret Value ") + chalk.gray("(or 'o' to open Azure Portal): ")
        );

        if (clientSecret.toLowerCase() === "o" || clientSecret.toLowerCase() === "open") {
          openUrl(secretUrl);
          console.log(chalk.green("   ✓ Opened - click 'New client secret', copy the 'Value'"));
          clientSecret = await question(chalk.white("   Secret Value: "));
        }

        if (clientSecret) {
          // Try keychain first, fall back to .env file
          try {
            const { storeCredentials } = await import("../lib/auth.js");
            await storeCredentials(partnerClientId, clientSecret, partnerTenantId);
            console.log(chalk.green("   ✓ Secret stored securely in OS keychain"));
            partnerClientSecret = clientSecret;
            clientSecretCreated = true;
          } catch {
            // Keychain failed, save to .env file automatically
            const envPath = resolve(process.cwd(), ".env");
            const envContent = existsSync(envPath)
              ? (await import("node:fs")).readFileSync(envPath, "utf-8")
              : "";

            // Check if PARTNER_CLIENT_SECRET already exists
            if (envContent.includes("PARTNER_CLIENT_SECRET=")) {
              console.log(chalk.green("   ✓ Secret already configured in .env"));
              // Load the existing secret from .env into memory
              const match = envContent.match(/PARTNER_CLIENT_SECRET=(.+)/);
              if (match) partnerClientSecret = match[1].trim();
            } else {
              const newContent =
                envContent.endsWith("\n") || envContent === ""
                  ? envContent + `PARTNER_CLIENT_SECRET=${clientSecret}\n`
                  : envContent + `\nPARTNER_CLIENT_SECRET=${clientSecret}\n`;
              writeFileSync(envPath, newContent, { mode: 0o600 });
              // Ensure restrictive permissions even if file existed
              chmodSync(envPath, 0o600);
              console.log(chalk.green("   ✓ Secret saved to .env (restricted permissions)"));
              partnerClientSecret = clientSecret;

              // Auto-add .env to .gitignore if not already there
              const gitignorePath = resolve(process.cwd(), ".gitignore");
              if (existsSync(gitignorePath)) {
                const gitignoreContent = (await import("node:fs")).readFileSync(
                  gitignorePath,
                  "utf-8"
                );
                if (!gitignoreContent.includes(".env")) {
                  writeFileSync(gitignorePath, gitignoreContent.trimEnd() + "\n.env\n");
                  console.log(chalk.green("   ✓ Added .env to .gitignore"));
                }
              } else {
                writeFileSync(gitignorePath, ".env\n");
                console.log(chalk.green("   ✓ Created .gitignore with .env"));
              }
            }
            clientSecretCreated = true;
          }
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
          const { TokenManager } = await import("@agentsync/core");
          const tokenManager = new TokenManager({
            tenantId: partnerTenantId,
            clientId: partnerClientId,
            clientSecret: partnerClientSecret,
          });
          const dvToken = await tokenManager.getToken(["https://globaldisco.crm.dynamics.com/.default"]);
          const resp = await fetch(
            "https://globaldisco.crm.dynamics.com/api/discovery/v2.0/Instances",
            { headers: { Authorization: `Bearer ${dvToken}` } }
          );

          if (resp.ok) {
            const data = (await resp.json()) as { value: Array<{ FriendlyName: string; Url: string; State: number }> };
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
                console.log(
                  chalk.green(`   ✓ Source: ${instances[idx].FriendlyName}`)
                );
              } else if (idx === instances.length) {
                sourceEnvironmentUrl = await question(
                  chalk.white("   Source environment URL: ")
                );
              }
              // else: skip
            }
          }
        } catch {
          // Discovery failed — fall through to manual prompt
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
      const tenants: Array<{
        tenantId: string;
        name: string;
        environmentUrl: string;
      }> = [];

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
                console.log(
                  chalk.gray(`   ${tenant.name}: No Dataverse environments found, skipping`)
                );
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
                      chalk.gray(
                        `     ${i + 1}. ${env.displayName} (${env.type}) - ${env.instanceUrl}`
                      )
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
        console.log(chalk.gray("GDAP discovery skipped (--no-gdap). You can add tenants manually.\n"));
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

      const configDir = dirname(configPath);

      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
      }

      // Generate tenant entries
      let tenantsYaml = "";
      if (tenants.length > 0) {
        for (const t of tenants) {
          tenantsYaml += `
  - tenantId: "${t.tenantId}"
    name: "${t.name}"
    environmentUrl: "${t.environmentUrl}"
    enabled: true
    tags:
      - production`;
        }
      }

      const sourceYaml = sourceEnvironmentUrl
        ? `source:
  tenantId: "${partnerTenantId}"
  environmentUrl: "${sourceEnvironmentUrl}"`
        : `# Source environment (where you develop agents)
# source:
#   tenantId: "${partnerTenantId}"
#   environmentUrl: "https://your-dev-org.crm.dynamics.com"`;

      const configContent = `# AgentSync Configuration File
# Generated by: agentsync init

# Partner/MSP Credentials (Azure AD App Registration)
partner:
  tenantId: "${partnerTenantId}"
  clientId: "${partnerClientId}"

${sourceYaml}

# Target tenants (where agents will be deployed)
# Add tenants here or use 'agentsync tenants discover' to find them
tenants:${tenantsYaml || " []"}
# Example:
#   - tenantId: "customer-tenant-guid"
#     name: "Contoso"
#     environmentUrl: "https://contoso.crm.dynamics.com"
#     enabled: true
`;

      writeFileSync(configPath, configContent);
      console.log(chalk.green(`  ✓ Configuration saved to ${configPath}`));

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

      if (tenants.length > 0) {
        // User added tenants - show next steps for deployment
        console.log(chalk.cyan("Next steps:"));
        console.log();
        console.log(chalk.white("  1. Verify your tenants:"));
        console.log(chalk.gray("     agentsync tenants list -c " + options.config));
        console.log();
        console.log(chalk.white("  2. Export a solution from your source environment:"));
        console.log(chalk.gray("     agentsync export --solution YourSolutionName"));
        console.log();
        console.log(chalk.white("  3. Deploy to your tenants:"));
        console.log(chalk.gray("     agentsync deploy --solution ./exports/YourSolution.zip"));
        console.log();
      } else {
        // No tenants yet - guide them to add some
        console.log(chalk.cyan("Next steps:"));
        console.log();
        console.log(chalk.white("  1. Add target tenants to your config:"));
        console.log(chalk.gray("     " + configPath));
        console.log();
        console.log(chalk.gray("     Example:"));
        console.log(chalk.gray("     tenants:"));
        console.log(chalk.gray('       - tenantId: "customer-tenant-guid"'));
        console.log(chalk.gray('         name: "Contoso"'));
        console.log(chalk.gray('         environmentUrl: "https://contoso.crm.dynamics.com"'));
        console.log(chalk.gray("         enabled: true"));
        console.log();
        console.log(chalk.white("  2. Verify your configuration:"));
        console.log(chalk.gray("     agentsync tenants list -c " + options.config));
        console.log();
      }
      console.log(chalk.dim("Run 'agentsync --help' to see all available commands."));
    } catch (error) {
      handleCommandError(error, null, "Setup failed");
    }
  });

/**
 * Test credentials and optionally discover GDAP relationships
 */
async function testCredentialsAndGdap(
  partnerTenantId: string,
  partnerClientId: string,
  clientSecret: string,
  configuredTenants: Array<{ tenantId: string; name: string; environmentUrl: string }>,
): Promise<void> {
  console.log();

  // Try to get a token to verify credentials work
  console.log(chalk.cyan("  Testing credentials..."));

  try {
    const { TokenManager } = await import("@agentsync/core");
    const tokenManager = new TokenManager({
      tenantId: partnerTenantId,
      clientId: partnerClientId,
      clientSecret,
    });

    // Test getting a Graph token
    await tokenManager.getGraphToken();
    console.log(chalk.green("  ✓ Credentials valid - authentication successful"));

    // Try to discover GDAP relationships
    console.log(chalk.cyan("  Checking GDAP relationships..."));
    try {
      const { GdapClient } = await import("@agentsync/core");
      const gdapClient = new GdapClient({
        tenantId: partnerTenantId,
        clientId: partnerClientId,
        clientSecret,
      });

      const relationships = await gdapClient.listDelegatedAdminRelationships();

      if (relationships.length === 0) {
        console.log(chalk.yellow("  ⚠ No active GDAP relationships found"));
        console.log(
          chalk.gray("   You may need to set up GDAP relationships with your customers.")
        );
        console.log(
          chalk.gray("   See: https://learn.microsoft.com/en-us/partner-center/gdap-introduction")
        );
      } else {
        console.log(chalk.green(`  ✓ Found ${relationships.length} active GDAP relationship(s)`));
        console.log();

        // Show discovered tenants
        console.log(chalk.cyan("   Your GDAP customers:"));
        for (const rel of relationships) {
          const isConfigured = configuredTenants.some((t) => t.tenantId === rel.customer.tenantId);
          const status = isConfigured ? chalk.green("✓ configured") : chalk.yellow("not in config");
          console.log(chalk.white(`   • ${rel.customer.displayName}`) + chalk.gray(` (${status})`));
        }

        // Count unconfigured
        const unconfigured = relationships.filter(
          (rel) => !configuredTenants.some((t) => t.tenantId === rel.customer.tenantId)
        );
        if (unconfigured.length > 0) {
          console.log();
          console.log(
            chalk.yellow(
              `   ${unconfigured.length} customer(s) not yet in your config. Run 'agentsync tenants discover' to add them.`
            )
          );
        }
      }
    } catch (gdapError) {
      // GDAP discovery failed - might not have Graph permissions
      console.log(chalk.yellow("  ⚠ Could not check GDAP relationships"));
      const errMsg = gdapError instanceof Error ? gdapError.message : String(gdapError);
      if (errMsg.includes("403") || errMsg.includes("Authorization")) {
        console.log(
          chalk.gray(
            "   Your app may need Directory.Read.All or similar permissions for GDAP discovery."
          )
        );
      } else {
        console.log(chalk.gray(`   ${errMsg.slice(0, 80)}`));
      }
    }

    // Test connectivity to configured tenants
    if (configuredTenants.length > 0) {
      console.log();
      console.log(chalk.cyan("Testing tenant connectivity..."));
      for (const tenant of configuredTenants) {
        console.log(chalk.cyan(`   Testing ${tenant.name}...`));
        try {
          const tenantTokenManager = new TokenManager({
            tenantId: tenant.tenantId,
            clientId: partnerClientId,
            clientSecret,
          });

          const { DataverseClient } = await import("@agentsync/core");
          const client = new DataverseClient({
            environmentUrl: tenant.environmentUrl,
            tokenManager: tenantTokenManager,
          });

          // Try to query to verify connectivity
          await client.get("/WhoAmI");
          console.log(chalk.green(`   ✓ ${tenant.name}: Connected`));
        } catch (tenantError) {
          const errMsg = tenantError instanceof Error ? tenantError.message : String(tenantError);
          if (errMsg.includes("not a member") || errMsg.includes("AADSTS50020")) {
            console.log(chalk.red(`   ✖ ${tenant.name}: App user not registered`));
            console.log(chalk.gray(`      Run: agentsync setup --tenant "${tenant.name}"`));
          } else if (errMsg.includes("403") || errMsg.includes("privilege")) {
            console.log(chalk.red(`   ✖ ${tenant.name}: Missing permissions`));
            console.log(chalk.gray("      App user needs System Administrator role"));
          } else {
            console.log(chalk.red(`   ✖ ${tenant.name}: Connection failed`));
            console.log(chalk.gray(`      ${errMsg.slice(0, 60)}`));
          }
        }
      }
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.log(chalk.red("  ✖ Credential test failed"));

    if (errMsg.includes("AADSTS7000215") || errMsg.includes("Invalid client secret")) {
      console.log(chalk.red("   Invalid client secret"));
      console.log(chalk.gray("   Make sure you copied the secret Value, not the Secret ID"));
    } else if (errMsg.includes("AADSTS700016")) {
      console.log(chalk.red("   Application not found"));
      console.log(chalk.gray("   Verify the Client ID is correct"));
    } else if (errMsg.includes("AADSTS90002")) {
      console.log(chalk.red("   Tenant not found"));
      console.log(chalk.gray("   Verify the Tenant ID is correct"));
    } else {
      console.log(chalk.red(`   ${errMsg.slice(0, 80)}`));
    }

    console.log();
    console.log(chalk.yellow("You can fix these issues and run 'agentsync validate' later."));
  }
}

interface DiscoveredEnvironment {
  displayName: string;
  type: string;
  instanceUrl: string;
}

interface DiscoveredTenant {
  tenantId: string;
  name: string;
  environments: DiscoveredEnvironment[];
}

/**
 * Discover customer tenants via GDAP and their Power Platform environments
 */
async function discoverGdapTenantsWithEnvironments(
  partnerTenantId: string,
  partnerClientId: string,
  clientSecret: string
): Promise<DiscoveredTenant[]> {
  console.log(chalk.cyan("  Discovering GDAP customers..."));

  try {
    const { GdapClient, TokenManager, PowerPlatformAdminClient } = await import("@agentsync/core");
    const gdapClient = new GdapClient({
      tenantId: partnerTenantId,
      clientId: partnerClientId,
      clientSecret,
    });

    const relationships = await gdapClient.listDelegatedAdminRelationships();

    if (relationships.length === 0) {
      console.log(chalk.yellow("  ⚠ No active GDAP relationships found"));
      console.log(
        chalk.gray("   You can add tenants manually or set up GDAP relationships later.")
      );
      return [];
    }

    console.log(chalk.green(`  ✓ Found ${relationships.length} GDAP customer(s)`));

    // Now discover environments for each tenant
    const results: DiscoveredTenant[] = [];

    for (const rel of relationships) {
      console.log(chalk.cyan(`   Discovering environments for ${rel.customer.displayName}...`));

      try {
        // Create token manager for the customer tenant (using GDAP delegation)
        const customerTokenManager = new TokenManager({
          tenantId: rel.customer.tenantId,
          clientId: partnerClientId,
          clientSecret,
        });

        const adminClient = new PowerPlatformAdminClient({
          tokenManager: customerTokenManager,
        });

        const environments = await adminClient.listEnvironmentSummaries();

        // Filter to production/sandbox environments with Dataverse
        const dataverseEnvs = environments.filter(
          (env) =>
            env.instanceUrl &&
            (env.type === "Production" || env.type === "Sandbox" || env.type === "Default")
        );

        results.push({
          tenantId: rel.customer.tenantId,
          name: rel.customer.displayName,
          environments: dataverseEnvs.map((env) => ({
            displayName: env.displayName,
            type: env.type,
            instanceUrl: env.instanceUrl,
          })),
        });

        if (dataverseEnvs.length > 0) {
          console.log(chalk.green(
            `   ✓ ${rel.customer.displayName}: ${dataverseEnvs.length} environment(s)`
          ));
        } else {
          console.log(chalk.yellow(`   ⚠ ${rel.customer.displayName}: No Dataverse environments`));
        }
      } catch (envError) {
        // Couldn't discover environments for this tenant
        console.log(chalk.yellow(`   ⚠ ${rel.customer.displayName}: Could not discover environments`));
        results.push({
          tenantId: rel.customer.tenantId,
          name: rel.customer.displayName,
          environments: [],
        });
      }
    }

    return results;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.log(chalk.yellow("  ⚠ Could not discover GDAP customers"));

    if (errMsg.includes("AADSTS") || errMsg.includes("Invalid client")) {
      console.log(chalk.gray("   Credentials may be invalid. You can add tenants manually."));
    } else if (errMsg.includes("403") || errMsg.includes("Authorization")) {
      console.log(chalk.gray("   App may need permissions for GDAP discovery."));
    } else {
      console.log(chalk.gray(`   ${errMsg.slice(0, 60)}`));
    }

    return [];
  }
}

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
import { existsSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createInterface } from "node:readline/promises";
import { exec } from "node:child_process";

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

/**
 * Read a line with masked input (shows * for each character)
 */
function readMaskedInput(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const originalWrite = process.stdout.write.bind(process.stdout);
    let input = "";

    // Write prompt
    originalWrite(prompt);

    // Handle keypress in raw mode
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    const handler = (char: string): void => {
      if (char === "\r" || char === "\n") {
        // Enter pressed - cleanup and resolve
        process.stdin.setRawMode?.(false);
        process.stdin.removeListener("data", handler);
        process.stdin.pause();
        originalWrite("\n");
        resolve(input);
      } else if (char === "\x7f" || char === "\b") {
        // Backspace
        if (input.length > 0) {
          input = input.slice(0, -1);
          originalWrite("\b \b"); // Erase the * character
        }
      } else if (char === "\x03") {
        // Ctrl+C
        process.stdin.setRawMode?.(false);
        process.stdin.removeListener("data", handler);
        originalWrite("\n");
        process.exit(1);
      } else if (char >= " ") {
        // Printable character
        input += char;
        originalWrite("*");
      }
    };

    process.stdin.on("data", handler);
  });
}

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

          // Tell user what's happening before opening browser
          console.log(chalk.cyan("Opening Microsoft sign-in..."));
          console.log(chalk.gray("   We'll open: https://microsoft.com/devicelogin\n"));

          const loginResult = await interactiveLogin({
            scopes: ["https://graph.microsoft.com/.default"],
            openBrowser: true, // Auto-open browser
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
        const tenantIdUrl =
          "https://portal.azure.com/#view/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/~/Overview";

        console.log(chalk.cyan("\n1. Partner Tenant ID"));
        console.log(chalk.gray("   Your Microsoft Entra (Azure AD) tenant ID."));

        const tenantInput = await rl.question(
          chalk.white("   Tenant ID ") + chalk.gray("(or 'o' to open Azure Portal): ")
        );

        if (tenantInput.toLowerCase() === "o" || tenantInput.toLowerCase() === "open") {
          openUrl(tenantIdUrl);
          console.log(chalk.green("   ✓ Opened - look for 'Tenant ID'"));
          partnerTenantId = await rl.question(chalk.white("   Tenant ID: "));
        } else {
          partnerTenantId = tenantInput;
        }
      }

      if (!partnerClientId) {
        const appRegUrl =
          "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade";

        console.log(chalk.cyan("\n2. App Registration Client ID"));
        console.log(chalk.gray("   The Application (client) ID of your Azure AD app."));

        const clientInput = await rl.question(
          chalk.white("   Client ID ") + chalk.gray("(or 'o' to open Azure Portal): ")
        );

        if (clientInput.toLowerCase() === "o" || clientInput.toLowerCase() === "open") {
          openUrl(appRegUrl);
          console.log(chalk.green("   ✓ Opened - select your app, copy 'Application (client) ID'"));
          partnerClientId = await rl.question(chalk.white("   Client ID: "));
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
        console.log(
          chalk.gray("   Type 'o' to open Azure Portal, or paste your secret (input is masked):")
        );

        // Use masked input for the secret
        let clientSecret = await readMaskedInput(chalk.white("   Secret Value: "));

        if (clientSecret.toLowerCase() === "o" || clientSecret.toLowerCase() === "open") {
          openUrl(secretUrl);
          console.log(chalk.green("   ✓ Opened - click 'New client secret', copy the 'Value'"));
          clientSecret = await readMaskedInput(chalk.white("   Secret Value: "));
        }

        if (clientSecret) {
          // Try keychain first, fall back to .env file
          try {
            const { storeCredentials } = await import("../lib/auth.js");
            await storeCredentials(partnerClientId, clientSecret, partnerTenantId);
            console.log(chalk.green("   ✓ Secret stored securely in OS keychain"));
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
            } else {
              const newContent =
                envContent.endsWith("\n") || envContent === ""
                  ? envContent + `PARTNER_CLIENT_SECRET=${clientSecret}\n`
                  : envContent + `\nPARTNER_CLIENT_SECRET=${clientSecret}\n`;
              writeFileSync(envPath, newContent, { mode: 0o600 });
              // Ensure restrictive permissions even if file existed
              chmodSync(envPath, 0o600);
              console.log(chalk.green("   ✓ Secret saved to .env (restricted permissions)"));

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
      // Try to discover tenants via GDAP
      console.log();
      const tenants: Array<{
        tenantId: string;
        name: string;
        environmentUrl: string;
      }> = [];

      // If we have credentials, try GDAP discovery
      if (clientSecretCreated) {
        const discoverTenants = await rl.question(
          chalk.cyan("Discover your customer tenants via GDAP? ") + chalk.gray("(y/n) ")
        );

        if (discoverTenants.toLowerCase() === "y" || discoverTenants.toLowerCase() === "yes") {
          const discovered = await discoverGdapTenants(partnerTenantId, partnerClientId);

          if (discovered.length > 0) {
            console.log();
            console.log(chalk.cyan(`Found ${discovered.length} GDAP customer(s):`));
            console.log();

            // Let user select which tenants to add
            for (const tenant of discovered) {
              const add = await rl.question(
                chalk.white(`   Add ${tenant.name}? `) + chalk.gray("(y/n) ")
              );
              if (add.toLowerCase() === "y" || add.toLowerCase() === "yes") {
                // Ask for environment URL since GDAP doesn't provide it
                const envUrl = await rl.question(
                  chalk.white(`   Environment URL for ${tenant.name}: `) +
                    chalk.gray("(e.g., https://contoso.crm.dynamics.com) ")
                );
                if (envUrl) {
                  tenants.push({
                    tenantId: tenant.tenantId,
                    name: tenant.name,
                    environmentUrl: envUrl,
                  });
                  console.log(chalk.green(`   ✓ Added ${tenant.name}`));
                }
              }
            }
          }
        }
      }

      // If no tenants added yet, offer manual entry
      if (tenants.length === 0) {
        const addTenant = await rl.question(
          chalk.cyan("Add a target tenant manually? ") + chalk.gray("(y/n) ")
        );

        if (addTenant.toLowerCase() === "y" || addTenant.toLowerCase() === "yes") {
          let addMore = true;
          while (addMore) {
            console.log(chalk.cyan(`\nTenant ${tenants.length + 1}:`));

            const tenantName = await rl.question(chalk.white("   Name (e.g., Contoso): "));
            const tenantId = await rl.question(chalk.white("   Tenant ID: "));
            const envUrl = await rl.question(
              chalk.white("   Environment URL (e.g., https://contoso.crm.dynamics.com): ")
            );

            if (tenantName && tenantId && envUrl) {
              tenants.push({ tenantId, name: tenantName, environmentUrl: envUrl });
              console.log(chalk.green(`   ✓ Added ${tenantName}`));
            }

            const another = await rl.question(
              chalk.white("\nAdd another tenant? ") + chalk.gray("(y/n) ")
            );
            addMore = another.toLowerCase() === "y" || another.toLowerCase() === "yes";
          }
        }
      }

      // Create config (keep rl open for test prompt later)
      const spinner = ora("Creating configuration...").start();

      const configPath = resolve(process.cwd(), options.config);
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
      } else {
        tenantsYaml = `
  # Add your tenants here:
  # - tenantId: "customer-tenant-guid"
  #   name: "Customer Name"
  #   environmentUrl: "https://customer-org.crm.dynamics.com"
  #   enabled: true
  #   tags:
  #     - production`;
      }

      const configContent = `# AgentSync Configuration File
# Generated by: agentsync init

# Partner/MSP Credentials (Azure AD App Registration)
partner:
  tenantId: "${partnerTenantId}"
  clientId: "${partnerClientId}"

# Source environment (where you develop agents)
# source:
#   environmentUrl: "https://your-dev-org.crm.dynamics.com"

# Target tenants (where agents will be deployed)
tenants:${tenantsYaml}
`;

      writeFileSync(configPath, configContent);
      spinner.succeed(`Configuration saved to ${configPath}`);

      // Offer to test credentials and discover GDAP tenants
      console.log();
      const testConnection = await rl.question(
        chalk.cyan("Test your credentials now? ") + chalk.gray("(y/n) ")
      );

      rl.close();

      if (testConnection.toLowerCase() === "y" || testConnection.toLowerCase() === "yes") {
        await testCredentialsAndGdap(partnerTenantId, partnerClientId, tenants, options.config);
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
      console.error(chalk.red("\n✖ Setup failed"));
      if (error instanceof Error) {
        console.error(chalk.red(error.message));
      }
      process.exit(1);
    }
  });

/**
 * Test credentials and optionally discover GDAP relationships
 */
async function testCredentialsAndGdap(
  partnerTenantId: string,
  partnerClientId: string,
  configuredTenants: Array<{ tenantId: string; name: string; environmentUrl: string }>,
  _configPath: string
): Promise<void> {
  console.log();

  // Try to get a token to verify credentials work
  const spinner = ora("Testing credentials...").start();

  try {
    const { getClientSecretWithFallback } = await import("../lib/credentials.js");
    const clientSecret = await getClientSecretWithFallback("PARTNER_CLIENT_SECRET");

    const { TokenManager } = await import("@agentsync/core");
    const tokenManager = new TokenManager({
      tenantId: partnerTenantId,
      clientId: partnerClientId,
      clientSecret,
    });

    // Test getting a Graph token
    await tokenManager.getGraphToken();
    spinner.succeed("Credentials valid - authentication successful");

    // Try to discover GDAP relationships
    spinner.start("Checking GDAP relationships...");
    try {
      const { GdapClient } = await import("@agentsync/core");
      const gdapClient = new GdapClient({
        tenantId: partnerTenantId,
        clientId: partnerClientId,
        clientSecret,
      });

      const relationships = await gdapClient.listDelegatedAdminRelationships();

      if (relationships.length === 0) {
        spinner.warn("No active GDAP relationships found");
        console.log(
          chalk.gray("   You may need to set up GDAP relationships with your customers.")
        );
        console.log(
          chalk.gray("   See: https://learn.microsoft.com/en-us/partner-center/gdap-introduction")
        );
      } else {
        spinner.succeed(`Found ${relationships.length} active GDAP relationship(s)`);
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
      spinner.warn("Could not check GDAP relationships");
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
        const tenantSpinner = ora(`   ${tenant.name}...`).start();
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
          tenantSpinner.succeed(`   ${tenant.name}: Connected`);
        } catch (tenantError) {
          const errMsg = tenantError instanceof Error ? tenantError.message : String(tenantError);
          if (errMsg.includes("not a member") || errMsg.includes("AADSTS50020")) {
            tenantSpinner.fail(`   ${tenant.name}: App user not registered`);
            console.log(chalk.gray(`      Run: agentsync setup --tenant "${tenant.name}"`));
          } else if (errMsg.includes("403") || errMsg.includes("privilege")) {
            tenantSpinner.fail(`   ${tenant.name}: Missing permissions`);
            console.log(chalk.gray("      App user needs System Administrator role"));
          } else {
            tenantSpinner.fail(`   ${tenant.name}: Connection failed`);
            console.log(chalk.gray(`      ${errMsg.slice(0, 60)}`));
          }
        }
      }
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    spinner.fail("Credential test failed");

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

/**
 * Discover customer tenants via GDAP relationships
 */
async function discoverGdapTenants(
  partnerTenantId: string,
  partnerClientId: string
): Promise<Array<{ tenantId: string; name: string }>> {
  const spinner = ora("Discovering GDAP customers...").start();

  try {
    const { getClientSecretWithFallback } = await import("../lib/credentials.js");
    const clientSecret = await getClientSecretWithFallback("PARTNER_CLIENT_SECRET");

    const { GdapClient } = await import("@agentsync/core");
    const gdapClient = new GdapClient({
      tenantId: partnerTenantId,
      clientId: partnerClientId,
      clientSecret,
    });

    const relationships = await gdapClient.listDelegatedAdminRelationships();

    if (relationships.length === 0) {
      spinner.warn("No active GDAP relationships found");
      console.log(
        chalk.gray("   You can add tenants manually or set up GDAP relationships later.")
      );
      return [];
    }

    spinner.succeed(`Found ${relationships.length} customer(s) via GDAP`);

    return relationships.map((rel) => ({
      tenantId: rel.customer.tenantId,
      name: rel.customer.displayName,
    }));
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    spinner.warn("Could not discover GDAP customers");

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

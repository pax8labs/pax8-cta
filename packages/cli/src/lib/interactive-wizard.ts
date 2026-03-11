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

import inquirer from "inquirer";
import chalk from "chalk";
import ora, { Ora } from "ora";
import { interactiveLogin, storeCredentials } from "./auth.js";
import { GraphClient } from "./graph-client.js";
import { TenantDiscoveryService } from "@agentsync/core";
import type { DiscoveredTenant } from "@agentsync/core";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

export interface WizardResult {
  configPath: string;
  clientId: string;
  tenantId: string;
  success: boolean;
}

interface WizardContext {
  accessToken?: string;
  tenantId?: string;
  appId?: string;
  appObjectId?: string;
  clientSecret?: string;
  discoveredTenants?: DiscoveredTenant[];
  partnerTenantId?: string;
  partnerClientId?: string;
}

/**
 * Run the interactive setup wizard
 */
export async function runInteractiveWizard(configPath: string): Promise<WizardResult> {
  console.log(chalk.cyan.bold("\n🚀 AgentSync Interactive Setup Wizard\n"));
  console.log(
    chalk.white(
      "This wizard will help you set up AgentSync by creating an Azure AD app registration"
    )
  );
  console.log(chalk.white("and discovering your Power Platform environments.\n"));

  const ctx: WizardContext = {};
  let spinner: Ora | null = null;

  try {
    // Step 1: Welcome and authentication
    console.log(chalk.cyan.bold("Step 1: Authentication\n"));

    const { shouldContinue } = await inquirer.prompt([
      {
        type: "confirm",
        name: "shouldContinue",
        message: "Ready to authenticate with Microsoft?",
        default: true,
      },
    ]);

    if (!shouldContinue) {
      console.log(chalk.yellow("\nSetup cancelled."));
      return { configPath, clientId: "", tenantId: "", success: false };
    }

    // Perform device code authentication
    spinner = ora("Waiting for authentication...").start();

    try {
      const loginResult = await interactiveLogin({
        scopes: ["https://graph.microsoft.com/.default"],
      });

      ctx.accessToken = loginResult.accessToken;
      ctx.tenantId = loginResult.tenantId;

      spinner.succeed(chalk.green("Authentication successful!"));
      console.log(chalk.gray(`  Tenant ID: ${ctx.tenantId}\n`));
    } catch (error) {
      spinner.fail("Authentication failed");
      throw error;
    }

    // Step 2: App Registration
    console.log(chalk.cyan.bold("Step 2: App Registration\n"));

    const graphClient = new GraphClient({ accessToken: ctx.accessToken! });
    const appName = "AgentSync CLI";

    // Check for existing app
    spinner = ora("Checking for existing app registration...").start();
    const existingApp = await graphClient.findExistingApp(appName);

    if (existingApp) {
      spinner.info(chalk.yellow("Found existing app registration"));
      console.log(chalk.gray(`  App ID: ${existingApp.appId}`));
      console.log(chalk.gray(`  Object ID: ${existingApp.id}\n`));

      const { useExisting } = await inquirer.prompt([
        {
          type: "confirm",
          name: "useExisting",
          message: "Use existing app registration?",
          default: true,
        },
      ]);

      if (useExisting) {
        ctx.appId = existingApp.appId;
        ctx.appObjectId = existingApp.id;
      } else {
        spinner = ora("Creating new app registration...").start();
        const newApp = await graphClient.createAppRegistration(`${appName} ${Date.now()}`);
        ctx.appId = newApp.appId;
        ctx.appObjectId = newApp.id;
        spinner.succeed(chalk.green("App registration created"));
        console.log(chalk.gray(`  App ID: ${ctx.appId}\n`));
      }
    } else {
      spinner.text = "Creating app registration...";
      const newApp = await graphClient.createAppRegistration(appName);
      ctx.appId = newApp.appId;
      ctx.appObjectId = newApp.id;
      spinner.succeed(chalk.green("App registration created"));
      console.log(chalk.gray(`  App ID: ${ctx.appId}\n`));
    }

    // Step 3: Add Dynamics CRM permission
    console.log(chalk.cyan.bold("Step 3: API Permissions\n"));

    spinner = ora("Adding Dynamics CRM permission...").start();

    try {
      await graphClient.addDynamicsPermission(ctx.appObjectId!);
      await graphClient.ensureServicePrincipal(ctx.appId!);
      spinner.succeed(chalk.green("Dynamics CRM permission added"));
    } catch (error) {
      spinner.warn(chalk.yellow("Could not add permission automatically"));
      console.log(chalk.gray("\nYou may need to add it manually:"));
      console.log(chalk.white("  1. Go to portal.azure.com → Azure Active Directory"));
      console.log(chalk.white("  2. Find your app → API permissions"));
      console.log(chalk.white("  3. Add 'Dynamics CRM' → 'user_impersonation'"));
      console.log(chalk.white("  4. Grant admin consent\n"));
    }

    // Admin consent notice
    console.log();
    console.log(chalk.yellow("⚠️  Admin Consent Required"));
    console.log(chalk.gray("Your IT admin needs to grant consent for API permissions."));
    console.log(
      chalk.white(
        `  Visit: https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/CallAnAPI/appId/${ctx.appId}/isMSAApp~/false\n`
      )
    );

    const { consentGranted } = await inquirer.prompt([
      {
        type: "confirm",
        name: "consentGranted",
        message: "Has admin consent been granted? (Skip if you're unsure)",
        default: false,
      },
    ]);

    // Step 4: Create client secret
    console.log(chalk.cyan.bold("\nStep 4: Client Secret\n"));

    spinner = ora("Creating client secret...").start();

    try {
      const secret = await graphClient.createClientSecret(
        ctx.appObjectId!,
        "AgentSync CLI Secret",
        24
      );

      ctx.clientSecret = secret.secretText;
      spinner.succeed(chalk.green("Client secret created"));
      console.log(chalk.yellow("\n⚠️  IMPORTANT: Save this secret - it won't be shown again!"));
      console.log(chalk.white(`  Secret: ${secret.secretText}`));
      console.log(chalk.gray(`  Expires: ${new Date(secret.endDateTime).toLocaleDateString()}\n`));

      // Store credentials securely
      const { shouldStore } = await inquirer.prompt([
        {
          type: "confirm",
          name: "shouldStore",
          message: "Store credentials securely in OS keychain?",
          default: true,
        },
      ]);

      if (shouldStore) {
        spinner = ora("Storing credentials...").start();
        await storeCredentials(ctx.appId!, ctx.clientSecret, ctx.tenantId);
        spinner.succeed(chalk.green("Credentials stored securely"));
      }
    } catch (error) {
      spinner.fail("Failed to create client secret");
      console.log(chalk.yellow("\nYou can create a client secret manually:"));
      console.log(chalk.white("  1. Go to portal.azure.com → Azure Active Directory"));
      console.log(chalk.white("  2. Find your app → Certificates & secrets"));
      console.log(chalk.white("  3. Create a new client secret"));
      console.log(chalk.white("  4. Save the secret value\n"));

      const { manualSecret } = await inquirer.prompt([
        {
          type: "password",
          name: "manualSecret",
          message: "Enter client secret (if you created one):",
          mask: "*",
        },
      ]);

      if (manualSecret) {
        ctx.clientSecret = manualSecret;
      }
    }

    // Step 5: Discover Power Platform environments
    console.log(chalk.cyan.bold("\nStep 5: Power Platform Discovery\n"));

    if (!ctx.clientSecret) {
      console.log(
        chalk.yellow(
          "Skipping environment discovery - client secret required. You can add environments manually.\n"
        )
      );
    } else {
      const { discoverNow } = await inquirer.prompt([
        {
          type: "confirm",
          name: "discoverNow",
          message: "Discover Power Platform environments now?",
          default: true,
        },
      ]);

      if (discoverNow) {
        spinner = ora("Discovering environments (this may take a minute)...").start();

        try {
          const discoveryService = new TenantDiscoveryService({
            tenantId: ctx.tenantId!,
            clientId: ctx.appId!,
            clientSecret: ctx.clientSecret!,
          });

          ctx.discoveredTenants = await discoveryService.discoverTenants();

          spinner.succeed(
            chalk.green(`Found ${ctx.discoveredTenants.length} tenant(s) with environments`)
          );

          if (ctx.discoveredTenants.length === 0) {
            console.log(chalk.yellow("\nNo environments found."));
            console.log(chalk.gray("Create one at: https://admin.powerplatform.microsoft.com\n"));
          }
        } catch (error) {
          spinner.fail("Failed to discover environments");
          console.log(
            chalk.gray(`  ${error instanceof Error ? error.message : "Unknown error"}\n`)
          );
        }
      }
    }

    // Step 6: Select environments
    let selectedTenants: DiscoveredTenant[] = [];
    let sourceTenant: DiscoveredTenant | undefined;

    if (ctx.discoveredTenants && ctx.discoveredTenants.length > 0) {
      console.log(chalk.cyan.bold("\nStep 6: Environment Selection\n"));

      // Filter tenants with environments
      const tenantsWithEnvs = ctx.discoveredTenants.filter(
        (t) => t.environments.length > 0 && !t.error
      );

      if (tenantsWithEnvs.length > 0) {
        // Select source environment
        const sourceChoices = tenantsWithEnvs.map((t) => ({
          name: `${t.displayName} (${t.environments.length} environment${t.environments.length > 1 ? "s" : ""})`,
          value: t.tenantId,
        }));

        const { sourceTenantId } = await inquirer.prompt([
          {
            type: "list",
            name: "sourceTenantId",
            message: "Select source environment (where agents are developed):",
            choices: sourceChoices,
          },
        ]);

        sourceTenant = tenantsWithEnvs.find((t) => t.tenantId === sourceTenantId);

        // Select target environments
        const targetChoices = tenantsWithEnvs
          .filter((t) => t.tenantId !== sourceTenantId)
          .map((t) => ({
            name: `${t.displayName} (${t.environments.length} environment${t.environments.length > 1 ? "s" : ""})`,
            value: t.tenantId,
            checked: true,
          }));

        if (targetChoices.length > 0) {
          const { targetTenantIds } = await inquirer.prompt([
            {
              type: "checkbox",
              name: "targetTenantIds",
              message: "Select target environments (where agents will be deployed):",
              choices: targetChoices,
            },
          ]);

          selectedTenants = tenantsWithEnvs.filter((t) => targetTenantIds.includes(t.tenantId));
        }
      }

      // Optional tags
      if (selectedTenants.length > 0) {
        await inquirer.prompt([
          {
            type: "input",
            name: "tags",
            message: "Add tags for target environments (comma-separated, optional):",
            default: "production",
          },
        ]);

        ctx.partnerTenantId = ctx.tenantId;
        ctx.partnerClientId = ctx.appId;
      }
    }

    // Step 7: Generate configuration
    console.log(chalk.cyan.bold("\nStep 7: Configuration\n"));

    spinner = ora("Generating configuration...").start();

    const configDir = dirname(resolve(process.cwd(), configPath));
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    const configContent = generateConfig({
      tenantId: ctx.tenantId!,
      clientId: ctx.appId!,
      sourceTenant,
      targetTenants: selectedTenants,
      useEnvVar: true,
    });

    writeFileSync(resolve(process.cwd(), configPath), configContent);
    spinner.succeed(chalk.green(`Configuration saved to ${configPath}`));

    // Step 8: Success and next steps
    console.log();
    console.log(chalk.green.bold("✓ Setup Complete!\n"));

    console.log(chalk.cyan("Next steps:\n"));

    if (!ctx.clientSecret) {
      console.log(chalk.white("1. Set your client secret:"));
      console.log(chalk.gray(`   export AGENTSYNC_CLIENT_SECRET="your-secret-here"\n`));
    }

    if (!consentGranted) {
      console.log(chalk.white("2. Grant admin consent for API permissions:"));
      console.log(
        chalk.gray(`   Visit portal.azure.com → App registrations → ${appName} → API permissions\n`)
      );
    }

    if (!selectedTenants.length && ctx.discoveredTenants) {
      console.log(chalk.white("3. Add target tenants to your configuration:"));
      console.log(chalk.gray(`   Edit ${configPath}\n`));
    }

    console.log(chalk.white("4. Test your setup:"));
    console.log(chalk.gray("   agentsync tenants list\n"));

    console.log(chalk.dim("Need help? Visit: https://github.com/pax8labs/agentsync\n"));

    return {
      configPath,
      clientId: ctx.appId!,
      tenantId: ctx.tenantId!,
      success: true,
    };
  } catch (error) {
    if (spinner) {
      spinner.fail("Setup failed");
    }

    if (error instanceof Error) {
      if (error.message.includes("user cancelled") || error.message.includes("cancelled")) {
        console.log(chalk.yellow("\n✖ Setup cancelled by user"));
        return { configPath, clientId: "", tenantId: "", success: false };
      }

      console.error(chalk.red(`\n✖ Error: ${error.message}`));
    }

    throw error;
  }
}

interface ConfigOptions {
  tenantId: string;
  clientId: string;
  sourceTenant?: DiscoveredTenant;
  targetTenants: DiscoveredTenant[];
  useEnvVar: boolean;
}

function generateConfig(options: ConfigOptions): string {
  const { tenantId, clientId, sourceTenant, targetTenants } = options;

  let config = `# AgentSync Configuration File
# Generated by interactive setup wizard

# Partner/MSP Credentials
partner:
  tenantId: "${tenantId}"
  clientId: "${clientId}"
  # Client secret should be in AGENTSYNC_CLIENT_SECRET env var

# Settings
settings:
  approval:
    required: false
    minApprovals: 1
    timeout: "24h"
    approvers:
      - admin@partner.com

`;

  if (sourceTenant && targetTenants.length > 0) {
    config += `# Source Environment\n`;
    config += `source:\n`;
    config += `  tenantId: "${sourceTenant.tenantId}"\n`;
    config += `  name: "${sourceTenant.displayName}"\n`;
    if (sourceTenant.defaultEnvironment) {
      config += `  environmentUrl: "${sourceTenant.defaultEnvironment.instanceUrl}"\n`;
    }
    config += `\n`;

    config += `# Target Environments\n`;
    config += `tenants:\n`;

    for (const tenant of targetTenants) {
      config += `  - tenantId: "${tenant.tenantId}"\n`;
      config += `    name: "${tenant.displayName}"\n`;

      if (tenant.defaultEnvironment) {
        config += `    environmentUrl: "${tenant.defaultEnvironment.instanceUrl}"\n`;
      }

      config += `    enabled: true\n`;
      config += `    tags:\n`;
      config += `      - production\n`;
    }
  } else {
    config += `# Your Tenants\n`;
    config += `tenants:\n`;
    config += `  # Add your tenants here:\n`;
    config += `  # - tenantId: "tenant-guid-here"\n`;
    config += `  #   name: "Client Name"\n`;
    config += `  #   environmentUrl: "https://client.crm.dynamics.com"\n`;
    config += `  #   enabled: true\n`;
    config += `  #   tags:\n`;
    config += `  #     - production\n`;
  }

  return config;
}

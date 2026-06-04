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

import inquirer from "inquirer";
import chalk from "chalk";
import ora, { Ora } from "ora";
import { interactiveLogin, storeCredentials } from "./auth.js";
import { GraphClient } from "./graph-client.js";
import { TenantDiscoveryService, TokenManager, PowerPlatformAdminClient } from "@pax8-cta/core";
import type { DiscoveredTenant, EnvironmentSummary } from "@pax8-cta/core";
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
  powerPlatformEnvironments?: EnvironmentSummary[];
  partnerTenantId?: string;
  partnerClientId?: string;
}

/**
 * Validate the setup by checking app registration and permissions
 */
async function validateSetup(ctx: WizardContext): Promise<{
  appExists: boolean;
  permissionsConfigured: boolean;
}> {
  let appExists = false;
  let permissionsConfigured = false;

  try {
    // Check if app still exists
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/applications/${ctx.appObjectId}`,
      {
        headers: {
          Authorization: `Bearer ${ctx.accessToken}`,
        },
      }
    );

    if (response.ok) {
      appExists = true;

      // Check permissions
      const app = (await response.json()) as {
        requiredResourceAccess: Array<{
          resourceAppId: string;
          resourceAccess: Array<{ id: string; type: string }>;
        }>;
      };

      const dynamicsResourceId = "00000007-0000-0000-c000-000000000000";
      const userImpersonationId = "78ce3f0f-a1ce-49c2-8cde-64b5c0896db4";

      const dynamicsPermission = app.requiredResourceAccess?.find(
        (p) => p.resourceAppId === dynamicsResourceId
      );

      if (dynamicsPermission) {
        permissionsConfigured = dynamicsPermission.resourceAccess.some(
          (ra) => ra.id === userImpersonationId
        );
      }
    }
  } catch {
    // Validation errors are not critical
  }

  return { appExists, permissionsConfigured };
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

    let permissionAddedSuccessfully = false;
    try {
      await graphClient.addDynamicsPermission(ctx.appObjectId!);
      await graphClient.ensureServicePrincipal(ctx.appId!);
      spinner.succeed(chalk.green("Dynamics CRM permission added"));
      permissionAddedSuccessfully = true;
    } catch (error) {
      spinner.warn(chalk.yellow("Could not add permission automatically"));
      console.log(chalk.yellow("\nManual step required:"));
      console.log(
        chalk.white(
          `1. Open: https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/CallAnAPI/appId/${ctx.appId}/isMSAApp~/false`
        )
      );
      console.log(
        chalk.white('2. Click "Add a permission" → "Dynamics CRM" → "user_impersonation"')
      );
      console.log(chalk.white('3. Click "Grant admin consent"'));
      console.log(
        chalk.gray(`\nError details: ${error instanceof Error ? error.message : "Unknown error"}\n`)
      );
    }

    // Admin consent notice
    console.log();
    console.log(chalk.yellow("⚠️  Admin Consent Required"));
    console.log(chalk.gray("An IT admin needs to grant consent for API permissions."));
    console.log(
      chalk.white(
        `  Direct link: https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/CallAnAPI/appId/${ctx.appId}/isMSAApp~/false\n`
      )
    );

    const { consentGranted } = await inquirer.prompt([
      {
        type: "confirm",
        name: "consentGranted",
        message: "Has admin consent been granted? (Skip if you're unsure)",
        default: permissionAddedSuccessfully,
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
    } catch {
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
          // Use PowerPlatformAdminClient for environment discovery
          const tokenManager = new TokenManager({
            tenantId: ctx.tenantId!,
            clientId: ctx.appId!,
            clientSecret: ctx.clientSecret!,
          });

          const adminClient = new PowerPlatformAdminClient({ tokenManager });
          ctx.powerPlatformEnvironments = await adminClient.listEnvironmentSummaries();

          spinner.succeed(
            chalk.green(
              `Found ${ctx.powerPlatformEnvironments.length} Power Platform environment(s)`
            )
          );

          if (ctx.powerPlatformEnvironments.length === 0) {
            console.log(chalk.yellow("\nNo environments found."));
            console.log(chalk.gray("Create one at: https://admin.powerplatform.microsoft.com\n"));
          } else {
            // Display discovered environments
            console.log(chalk.cyan("\nDiscovered environments:\n"));
            for (const env of ctx.powerPlatformEnvironments) {
              console.log(chalk.white(`  • ${env.displayName}`));
              console.log(chalk.gray(`    Type: ${env.type}`));
              console.log(chalk.gray(`    URL: ${env.instanceUrl}`));
              console.log(chalk.gray(`    Location: ${env.location}\n`));
            }
          }

          // Also try legacy tenant discovery for backward compatibility
          try {
            const discoveryService = new TenantDiscoveryService({
              tenantId: ctx.tenantId!,
              clientId: ctx.appId!,
              clientSecret: ctx.clientSecret!,
            });

            ctx.discoveredTenants = await discoveryService.discoverTenants();
          } catch (error) {
            // Legacy discovery failure is not critical
            console.log(
              chalk.gray(
                `Note: Legacy tenant discovery skipped (${error instanceof Error ? error.message : "Unknown error"})`
              )
            );
          }
        } catch (error) {
          spinner.fail("Failed to discover environments");
          console.log(
            chalk.gray(`  ${error instanceof Error ? error.message : "Unknown error"}\n`)
          );
          console.log(
            chalk.yellow(
              "You can add environments manually to your configuration file after setup.\n"
            )
          );
        }
      }
    }

    // Step 6: Select environments
    let selectedTenants: DiscoveredTenant[] = [];
    let selectedEnvironments: EnvironmentSummary[] = [];
    let sourceTenant: DiscoveredTenant | undefined;
    let sourceEnvironment: EnvironmentSummary | undefined;

    // Use Power Platform environments if available, otherwise fall back to discovered tenants
    if (ctx.powerPlatformEnvironments && ctx.powerPlatformEnvironments.length > 0) {
      console.log(chalk.cyan.bold("\nStep 6: Environment Selection\n"));

      // Select environments to add to config
      const envChoices = ctx.powerPlatformEnvironments.map((env) => ({
        name: `${env.displayName} (${env.type}) - ${env.instanceUrl}`,
        value: env.id,
        checked: true,
      }));

      const { selectedEnvIds } = await inquirer.prompt([
        {
          type: "checkbox",
          name: "selectedEnvIds",
          message: "Select environments to add to your configuration:",
          choices: envChoices,
        },
      ]);

      selectedEnvironments = ctx.powerPlatformEnvironments.filter((env) =>
        selectedEnvIds.includes(env.id)
      );

      if (selectedEnvironments.length > 0) {
        // Ask if one should be marked as source
        const { hasSource } = await inquirer.prompt([
          {
            type: "confirm",
            name: "hasSource",
            message: "Do you have a dedicated source environment for agent development?",
            default: false,
          },
        ]);

        if (hasSource && selectedEnvironments.length > 1) {
          const sourceChoices = selectedEnvironments.map((env) => ({
            name: `${env.displayName} (${env.type})`,
            value: env.id,
          }));

          const { sourceEnvId } = await inquirer.prompt([
            {
              type: "list",
              name: "sourceEnvId",
              message: "Select source environment (where agents are developed):",
              choices: sourceChoices,
            },
          ]);

          sourceEnvironment = selectedEnvironments.find((env) => env.id === sourceEnvId);
          selectedEnvironments = selectedEnvironments.filter((env) => env.id !== sourceEnvId);
        }

        ctx.partnerTenantId = ctx.tenantId;
        ctx.partnerClientId = ctx.appId;
      }
    } else if (ctx.discoveredTenants && ctx.discoveredTenants.length > 0) {
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

        ctx.partnerTenantId = ctx.tenantId;
        ctx.partnerClientId = ctx.appId;
      }
    }

    // Step 7: Validation
    console.log(chalk.cyan.bold("\nStep 7: Validation\n"));

    spinner = ora("Validating setup...").start();

    const validationResults = await validateSetup(ctx);

    if (validationResults.appExists) {
      spinner.succeed(chalk.green("App registration verified"));
    } else {
      spinner.warn(chalk.yellow("Could not verify app registration"));
    }

    console.log();
    console.log(chalk.cyan("Setup Summary:\n"));
    console.log(chalk.white(`  App Registration: ${ctx.appId}`));
    console.log(chalk.white(`  Tenant ID: ${ctx.tenantId}`));
    console.log(
      chalk.white(
        `  API Permissions: ${validationResults.permissionsConfigured ? chalk.green("Configured") : chalk.yellow("Needs configuration")}`
      )
    );
    console.log(
      chalk.white(
        `  Admin Consent: ${consentGranted ? chalk.green("Granted") : chalk.yellow("Pending")}`
      )
    );
    console.log(
      chalk.white(
        `  Client Secret: ${ctx.clientSecret ? chalk.green("Created") : chalk.yellow("Not created")}`
      )
    );

    if (selectedEnvironments.length > 0) {
      console.log(chalk.white(`  Environments: ${selectedEnvironments.length} selected`));
      if (sourceEnvironment) {
        console.log(chalk.white(`  Source Environment: ${sourceEnvironment.displayName}`));
      }
    } else if (selectedTenants.length > 0) {
      console.log(chalk.white(`  Tenants: ${selectedTenants.length} selected`));
      if (sourceTenant) {
        console.log(chalk.white(`  Source Tenant: ${sourceTenant.displayName}`));
      }
    }

    console.log();

    // Step 8: Generate configuration
    console.log(chalk.cyan.bold("Step 8: Configuration\n"));

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
      sourceEnvironment,
      targetEnvironments: selectedEnvironments,
      useEnvVar: true,
    });

    writeFileSync(resolve(process.cwd(), configPath), configContent);
    spinner.succeed(chalk.green(`Configuration saved to ${configPath}`));

    // Step 9: Success and next steps
    console.log();
    console.log(chalk.green.bold("✓ Setup Complete!\n"));

    console.log(chalk.cyan("Next steps:\n"));

    let stepNumber = 1;

    if (!ctx.clientSecret) {
      console.log(chalk.white(`${stepNumber}. Store your client secret securely:`));
      console.log(chalk.gray(`   auth login`));
      console.log(
        chalk.gray(
          `   (or set environment variable: export PAX8_CTA_CLIENT_SECRET="your-secret")\n`
        )
      );
      stepNumber++;
    }

    if (!consentGranted || !validationResults.permissionsConfigured) {
      console.log(chalk.white(`${stepNumber}. Grant admin consent for API permissions:`));
      console.log(
        chalk.gray(
          `   ${chalk.underline(`https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/CallAnAPI/appId/${ctx.appId}/isMSAApp~/false`)}\n`
        )
      );
      stepNumber++;
    }

    if (selectedEnvironments.length === 0 && selectedTenants.length === 0) {
      console.log(chalk.white(`${stepNumber}. Add target environments to your configuration:`));
      console.log(chalk.gray(`   Edit ${configPath}\n`));
      stepNumber++;
    }

    console.log(chalk.white(`${stepNumber}. Test your setup:`));
    console.log(chalk.gray("   tenants list\n"));

    if (selectedEnvironments.length > 0 || selectedTenants.length > 0) {
      console.log(chalk.white("You can now deploy agents with:"));
      console.log(chalk.gray("   deploy <agent-name>\n"));
    }

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
  sourceEnvironment?: EnvironmentSummary;
  targetEnvironments: EnvironmentSummary[];
  useEnvVar: boolean;
}

function generateConfig(options: ConfigOptions): string {
  const { tenantId, clientId, sourceTenant, targetTenants, sourceEnvironment, targetEnvironments } =
    options;

  let config = `# AgentSync Configuration File
# Generated by interactive setup wizard

# Partner/MSP Credentials
partner:
  tenantId: "${tenantId}"
  clientId: "${clientId}"
  # Client secret should be in PAX8_CTA_CLIENT_SECRET env var

# Settings
settings:
  approval:
    required: false
    minApprovals: 1
    timeout: "24h"
    approvers:
      - admin@partner.com

`;

  // Use Power Platform environments if available
  if (sourceEnvironment && targetEnvironments.length > 0) {
    config += `# Source Environment\n`;
    config += `source:\n`;
    config += `  tenantId: "${tenantId}"\n`;
    config += `  name: "${sourceEnvironment.displayName}"\n`;
    config += `  environmentUrl: "${sourceEnvironment.instanceUrl}"\n`;
    config += `\n`;

    config += `# Target Environments\n`;
    config += `tenants:\n`;

    for (const env of targetEnvironments) {
      config += `  - tenantId: "${tenantId}"\n`;
      config += `    name: "${env.displayName}"\n`;
      config += `    environmentUrl: "${env.instanceUrl}"\n`;
      config += `    enabled: true\n`;
      config += `    tags:\n`;
      config += `      - ${env.type.toLowerCase()}\n`;
    }
  } else if (targetEnvironments.length > 0) {
    // All environments as targets (no dedicated source)
    config += `# Power Platform Environments\n`;
    config += `tenants:\n`;

    for (const env of targetEnvironments) {
      config += `  - tenantId: "${tenantId}"\n`;
      config += `    name: "${env.displayName}"\n`;
      config += `    environmentUrl: "${env.instanceUrl}"\n`;
      config += `    enabled: true\n`;
      config += `    tags:\n`;
      config += `      - ${env.type.toLowerCase()}\n`;
    }
  } else if (sourceTenant && targetTenants.length > 0) {
    // Legacy tenant-based config
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

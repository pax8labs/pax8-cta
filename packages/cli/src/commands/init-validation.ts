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

import chalk from "chalk";

/**
 * Show a live summary of the user's environment after init completes.
 * Queries source for solutions, checks tenant health, and shows drift status.
 */
export async function showEnvironmentSummary(
  partnerTenantId: string,
  partnerClientId: string,
  clientSecret: string,
  sourceEnvironmentUrl: string,
  tenants: Array<{ tenantId: string; name: string; environmentUrl: string }>
): Promise<void> {
  console.log(chalk.cyan.bold("━".repeat(60)));
  console.log(chalk.cyan.bold("  Your Environment"));
  console.log(chalk.cyan.bold("━".repeat(60)));
  console.log();

  try {
    const { TokenManager, DataverseClient, VersionChecker, DriftAnalyzer } =
      await import("@agentsync/core");

    // Query source environment for solutions
    if (sourceEnvironmentUrl) {
      try {
        const sourceTokenManager = new TokenManager({
          tenantId: partnerTenantId,
          clientId: partnerClientId,
          clientSecret,
        });
        const sourceClient = new DataverseClient({
          environmentUrl: sourceEnvironmentUrl,
          tokenManager: sourceTokenManager,
          clientId: partnerClientId,
        });

        const solutions = await sourceClient.querySolutions();
        const customSolutions = solutions.filter(
          (s) =>
            s.uniquename !== "Default" &&
            s.uniquename !== "Active" &&
            !s.uniquename.startsWith("msdyn_") &&
            !s.uniquename.startsWith("msft_") &&
            !s.uniquename.startsWith("mspcat_")
        );

        console.log(chalk.white("  Source Environment"));
        console.log(chalk.gray(`  ${sourceEnvironmentUrl}`));
        console.log(chalk.green(`  ✓ ${customSolutions.length} deployable solution(s) found`));

        if (customSolutions.length > 0) {
          for (const sol of customSolutions.slice(0, 5)) {
            console.log(chalk.gray(`    • ${sol.friendlyname} v${sol.version}`));
          }
          if (customSolutions.length > 5) {
            console.log(chalk.gray(`    ... and ${customSolutions.length - 5} more`));
          }
        }
        console.log();

        // Check tenant health and drift if we have tenants
        if (tenants.length > 0) {
          console.log(chalk.white(`  Target Tenants (${tenants.length})`));

          const checker = new VersionChecker();
          const analyzer = new DriftAnalyzer();
          const expectedSolutions = customSolutions.map((s) => ({
            uniqueName: s.uniquename,
            friendlyName: s.friendlyname,
            version: s.version,
          }));

          for (const tenant of tenants) {
            try {
              const tm = new TokenManager({
                tenantId: tenant.tenantId,
                clientId: partnerClientId,
                clientSecret,
              });

              const tenantConfig = {
                name: tenant.name,
                tenantId: tenant.tenantId,
                environmentUrl: tenant.environmentUrl,
                tags: [] as string[],
                enabled: true,
                autoSetup: true,
              };

              const versionStatus = await checker.checkTenantVersions(
                tenantConfig,
                expectedSolutions,
                tm,
                true
              );

              const analysis = analyzer.analyzeTenant(tenantConfig, versionStatus);

              const statusIcon =
                versionStatus.overallStatus === "current"
                  ? chalk.green("✓")
                  : versionStatus.overallStatus === "outdated"
                    ? chalk.yellow("⚠")
                    : chalk.gray("?");

              const outdatedCount = versionStatus.solutions.filter(
                (s) => s.status === "outdated"
              ).length;
              const driftInfo =
                outdatedCount > 0
                  ? chalk.yellow(` (${outdatedCount} outdated)`)
                  : chalk.green(" (all current)");

              console.log(`  ${statusIcon} ${tenant.name}${driftInfo}`);

              if (analysis.riskScore > 0) {
                const riskColor = analysis.riskLevel === "high" ? chalk.red : chalk.yellow;
                console.log(
                  chalk.gray(`    Risk: `) +
                    riskColor(`${analysis.riskScore}/100 ${analysis.riskLevel}`)
                );
              }
            } catch {
              console.log(
                `  ${chalk.red("✖")} ${tenant.name} ${chalk.gray("(connection failed)")}`
              );
            }
          }
          console.log();
        }
      } catch (sourceError) {
        console.log(chalk.yellow("  ⚠ Could not query source environment"));
        console.log(
          chalk.gray(
            `  ${sourceError instanceof Error ? sourceError.message.slice(0, 60) : "Unknown error"}`
          )
        );
        console.log();
      }
    }

    // Show quick start commands
    console.log(chalk.white("  Quick Start"));
    console.log(chalk.gray("  ─".repeat(28)));
    if (tenants.length > 0) {
      console.log(chalk.gray("  solutions list        ") + chalk.dim("# See your solutions"));
      console.log(chalk.gray("  solutions drift --risk") + chalk.dim("# Check drift & risk"));
      console.log(chalk.gray("  deploy <name> --all   ") + chalk.dim("# Deploy to all tenants"));
    } else {
      console.log(chalk.gray("  solutions list        ") + chalk.dim("# See your solutions"));
      console.log(chalk.gray("  validate              ") + chalk.dim("# Verify configuration"));
    }
    console.log();
  } catch {
    // If anything fails, just show static next steps
    console.log(chalk.cyan("Next steps:"));
    console.log(chalk.gray("  validate              ") + chalk.dim("# Verify configuration"));
    console.log(chalk.gray("  solutions list        ") + chalk.dim("# See your solutions"));
    console.log();
  }
}

/**
 * Test credentials and optionally discover GDAP relationships
 */
export async function testCredentialsAndGdap(
  partnerTenantId: string,
  partnerClientId: string,
  clientSecret: string,
  configuredTenants: Array<{ tenantId: string; name: string; environmentUrl: string }>
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
              `   ${unconfigured.length} customer(s) not yet in your config. Run 'tenants discover' to add them.`
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
            console.log(chalk.gray(`      Run: setup --tenant "${tenant.name}"`));
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
    console.log(chalk.yellow("You can fix these issues and run 'validate' later."));
  }
}

export interface DiscoveredEnvironment {
  displayName: string;
  type: string;
  instanceUrl: string;
}

export interface DiscoveredTenant {
  tenantId: string;
  name: string;
  environments: DiscoveredEnvironment[];
}

/**
 * Discover customer tenants via GDAP and their Power Platform environments
 */
export async function discoverGdapTenantsWithEnvironments(
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
          console.log(
            chalk.green(`   ✓ ${rel.customer.displayName}: ${dataverseEnvs.length} environment(s)`)
          );
        } else {
          console.log(chalk.yellow(`   ⚠ ${rel.customer.displayName}: No Dataverse environments`));
        }
      } catch {
        // Couldn't discover environments for this tenant
        console.log(
          chalk.yellow(`   ⚠ ${rel.customer.displayName}: Could not discover environments`)
        );
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

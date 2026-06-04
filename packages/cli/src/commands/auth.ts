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
import inquirer from "inquirer";
import { storeSecret, deleteSecret, getStoredSecret } from "../lib/credentials.js";
import { handleCommandError } from "../lib/errors.js";

export const authCommand = new Command("auth")
  .description("Store or remove your client secret in the OS keychain")
  .addHelpText(
    "after",
    `
Examples:
  auth login                                Store client secret in OS keychain
  auth logout                               Remove stored credentials
  auth status                               Check authentication status
`
  );

// Login subcommand
authCommand
  .command("login")
  .description("Store client secret securely in OS keychain")
  .action(async () => {
    console.log(chalk.cyan.bold("\n🔐 Pax8 CTA Login\n"));
    console.log(chalk.gray("Your client secret will be stored securely in your OS keychain.\n"));

    try {
      const answers = await inquirer.prompt([
        {
          type: "password",
          name: "secret",
          message: "Enter your client secret:",
          mask: "*",
          validate: (input: string) => {
            if (!input || input.trim().length === 0) {
              return "Client secret cannot be empty";
            }
            if (input.trim().length < 10) {
              return "Client secret seems too short. Please verify.";
            }
            return true;
          },
        },
        {
          type: "confirm",
          name: "confirm",
          message: "Save this secret to your OS keychain?",
          default: true,
        },
      ]);

      if (!answers.confirm) {
        console.log(chalk.yellow("\n✖ Login cancelled"));
        return;
      }

      await storeSecret(answers.secret.trim());

      console.log(chalk.green("\n✓ Client secret stored securely!"));
      console.log();
      console.log(chalk.gray("Your secret is now stored in your OS keychain and will be"));
      console.log(chalk.gray("used automatically by Pax8 CTA commands."));
      console.log();
      console.log(chalk.cyan("Next steps:"));
      console.log(chalk.white("  auth status  ") + chalk.dim("# Verify credentials"));
      console.log(chalk.white("  tenants list ") + chalk.dim("# Test authentication"));
      console.log();
    } catch (error) {
      handleCommandError(error, null, "Failed to store secret");
    }
  });

// Logout subcommand
authCommand
  .command("logout")
  .description("Remove stored credentials from OS keychain")
  .action(async () => {
    console.log(chalk.cyan.bold("\n🔓 Pax8 CTA Logout\n"));

    try {
      const existingSecret = await getStoredSecret();

      if (!existingSecret) {
        console.log(chalk.yellow("No credentials found in keychain."));
        console.log();
        console.log(chalk.gray("To store credentials, use: auth login"));
        return;
      }

      const answers = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirm",
          message: "Remove stored credentials from keychain?",
          default: false,
        },
      ]);

      if (!answers.confirm) {
        console.log(chalk.yellow("\n✖ Logout cancelled"));
        return;
      }

      await deleteSecret();

      console.log(chalk.green("\n✓ Credentials removed from keychain"));
      console.log();
      console.log(chalk.gray("You can still use environment variables for authentication:"));
      console.log(chalk.white('  export PARTNER_CLIENT_SECRET="your-secret"'));
      console.log();
    } catch (error) {
      handleCommandError(error, null, "Failed to remove credentials");
    }
  });

// Status subcommand
authCommand
  .command("status")
  .description("Show authentication status")
  .action(async () => {
    console.log(chalk.cyan.bold("\n🔍 Authentication Status\n"));

    try {
      // Check both possible environment variable names
      const envVars = ["PARTNER_CLIENT_SECRET", "PAX8_CTA_CLIENT_SECRET"];
      const foundEnvVars = envVars.filter((v) => !!process.env[v]);
      const hasEnvVar = foundEnvVars.length > 0;

      const keychainSecret = await getStoredSecret();
      const hasKeychain = !!keychainSecret;

      if (hasEnvVar) {
        console.log(chalk.green("✓ Environment Variable"));
        for (const envVar of foundEnvVars) {
          console.log(chalk.gray(`  ${envVar} is set`));
        }
        console.log(chalk.gray("  Priority: PRIMARY (environment variables take precedence)"));
        console.log();
      }

      if (hasKeychain) {
        console.log(chalk.green("✓ OS Keychain"));
        console.log(chalk.gray("  Client secret stored in secure keychain"));
        if (hasEnvVar) {
          console.log(chalk.gray("  Priority: SECONDARY (used as fallback)"));
        } else {
          console.log(chalk.gray("  Priority: PRIMARY (will be used for authentication)"));
        }
        console.log();
      }

      if (!hasEnvVar && !hasKeychain) {
        console.log(chalk.yellow("⚠ No Credentials Found"));
        console.log();
        console.log(chalk.gray("You can authenticate using either method:"));
        console.log();
        console.log(chalk.cyan("Option 1: OS Keychain (Recommended)"));
        console.log(chalk.white("  auth login"));
        console.log();
        console.log(chalk.cyan("Option 2: Environment Variable"));
        console.log(chalk.white('  export PARTNER_CLIENT_SECRET="your-secret"'));
        console.log();
      } else {
        console.log(chalk.gray("Authentication method priority:"));
        console.log(
          chalk.gray("  1. Environment variable (PARTNER_CLIENT_SECRET or PAX8_CTA_CLIENT_SECRET)")
        );
        console.log(chalk.gray("  2. OS keychain (fallback)"));
        console.log();
      }
    } catch (error) {
      handleCommandError(error, null, "Failed to check authentication status");
    }
  });

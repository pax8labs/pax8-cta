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

import chalk from "chalk";

export function showBanner(version: string = "0.1.0") {
  const banner = `
${chalk.cyan.bold("╔═══════════════════════════════════════════════════════════════╗")}
${chalk.cyan.bold("║")}                                                               ${chalk.cyan.bold("║")}
${chalk.cyan.bold("║")}     ${chalk.blue.bold("█████╗  ██████╗ ███████╗███╗   ██╗████████╗")}             ${chalk.cyan.bold("║")}
${chalk.cyan.bold("║")}    ${chalk.blue.bold("██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝")}             ${chalk.cyan.bold("║")}
${chalk.cyan.bold("║")}    ${chalk.blue.bold("███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║")}                ${chalk.cyan.bold("║")}
${chalk.cyan.bold("║")}    ${chalk.blue.bold("██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║")}                ${chalk.cyan.bold("║")}
${chalk.cyan.bold("║")}    ${chalk.blue.bold("██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║")}                ${chalk.cyan.bold("║")}
${chalk.cyan.bold("║")}    ${chalk.blue.bold("╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝")}                ${chalk.cyan.bold("║")}
${chalk.cyan.bold("║")}                                                               ${chalk.cyan.bold("║")}
${chalk.cyan.bold("║")}        ${chalk.magenta.bold("███████╗██╗   ██╗███╗   ██╗ ██████╗")}                ${chalk.cyan.bold("║")}
${chalk.cyan.bold("║")}        ${chalk.magenta.bold("██╔════╝╚██╗ ██╔╝████╗  ██║██╔════╝")}                ${chalk.cyan.bold("║")}
${chalk.cyan.bold("║")}        ${chalk.magenta.bold("███████╗ ╚████╔╝ ██╔██╗ ██║██║")}                     ${chalk.cyan.bold("║")}
${chalk.cyan.bold("║")}        ${chalk.magenta.bold("╚════██║  ╚██╔╝  ██║╚██╗██║██║")}                     ${chalk.cyan.bold("║")}
${chalk.cyan.bold("║")}        ${chalk.magenta.bold("███████║   ██║   ██║ ╚████║╚██████╗")}                ${chalk.cyan.bold("║")}
${chalk.cyan.bold("║")}        ${chalk.magenta.bold("╚══════╝   ╚═╝   ╚═╝  ╚═══╝ ╚═════╝")}                ${chalk.cyan.bold("║")}
${chalk.cyan.bold("║")}                                                               ${chalk.cyan.bold("║")}
${chalk.cyan.bold("║")}   ${chalk.white("Sync your Copilot Studio agents to all your tenants")}        ${chalk.cyan.bold("║")}
${chalk.cyan.bold("║")}   ${chalk.gray(`Version ${version} • Multi-tenant deployment automation`)}         ${chalk.cyan.bold("║")}
${chalk.cyan.bold("║")}                                                               ${chalk.cyan.bold("║")}
${chalk.cyan.bold("╚═══════════════════════════════════════════════════════════════╝")}
`;
  console.log(banner);
}

export function showWelcome() {
  console.log();
  console.log(chalk.cyan.bold("🚀 Quick Start:"));
  console.log();
  console.log(
    chalk.white("  Deploy to all tenants:    ") +
      chalk.gray("deploy --all --solution ./agent.zip")
  );
  console.log(
    chalk.white("  Check deployment status:  ") +
      chalk.gray("status --deployment <id>")
  );
  console.log(
    chalk.white("  List your tenants:        ") +
      chalk.gray("tenants list")
  );
  console.log();
  console.log(
    chalk.cyan("  Need help? ") + chalk.gray("Type: help")
  );
  console.log();
}

export function showCompactBanner() {
  console.log();
  console.log(
    chalk.cyan.bold("  ╔═══════════════════════════════════════╗")
  );
  console.log(
    chalk.cyan.bold("  ║  ") +
      chalk.blue.bold("Agent") +
      chalk.magenta.bold("Sync") +
      chalk.cyan.bold(" • Multi-Tenant Deployment  ║")
  );
  console.log(
    chalk.cyan.bold("  ╚═══════════════════════════════════════╝")
  );
  console.log();
}

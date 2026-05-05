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

export function showBanner(version: string = "0.1.0") {
  const W = 63;
  const border = chalk.cyan.bold("═".repeat(W));
  const row = (text: string, visibleLen: number, color: (s: string) => string) =>
    chalk.cyan.bold("║") + color(text) + " ".repeat(W - visibleLen) + chalk.cyan.bold("║");
  const empty = row("", 0, (s) => s);

  const pax8Art = [
    ["     ██████╗  █████╗ ██╗  ██╗ █████╗", 36],
    ["     ██╔══██╗██╔══██╗╚██╗██╔╝██╔══██╗", 37],
    ["     ██████╔╝███████║ ╚███╔╝ ╚█████╔╝", 37],
    ["     ██╔═══╝ ██╔══██║ ██╔██╗ ██╔══██╗", 37],
    ["     ██║     ██║  ██║██╔╝ ██╗╚█████╔╝", 37],
    ["     ╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝ ╚════╝", 36],
  ] as const;

  const ctaArt = [
    ["         ██████╗████████╗ █████╗", 32],
    ["        ██╔════╝╚══██╔══╝██╔══██╗", 33],
    ["        ██║        ██║   ███████║", 33],
    ["        ██║        ██║   ██╔══██║", 33],
    ["        ╚██████╗   ██║   ██║  ██║", 33],
    ["         ╚═════╝   ╚═╝   ╚═╝  ╚═╝", 32],
  ] as const;

  const subtitle = "                     Cross Tenant Agents";
  const tagline = "   Deploy Copilot Studio agents to customer tenants via GDAP";
  const versionLine = `   Version ${version}`;

  const lines = [
    chalk.cyan.bold("╔" + border + "╗"),
    empty,
    ...pax8Art.map(([text, len]) => row(text, len, chalk.blue.bold)),
    empty,
    ...ctaArt.map(([text, len]) => row(text, len, chalk.magenta.bold)),
    empty,
    row(subtitle, subtitle.length, chalk.white.bold),
    empty,
    row(tagline, tagline.length, chalk.white),
    row(versionLine, versionLine.length, chalk.gray),
    empty,
    chalk.cyan.bold("╚" + border + "╝"),
  ];

  console.log("\n" + lines.join("\n"));
}

export function showWelcome() {
  console.log();
  console.log(chalk.cyan.bold("🚀 Quick Start:"));
  console.log();
  console.log(
    chalk.white("  Deploy to all tenants:    ") + chalk.gray("deploy --all --solution ./agent.zip")
  );
  console.log(chalk.white("  View deployment history:  ") + chalk.gray("deployments list"));
  console.log(chalk.white("  List your tenants:        ") + chalk.gray("tenants list"));
  console.log();
  console.log(chalk.cyan("  Need help? ") + chalk.gray("Type: help"));
  console.log();
}

export function showCompactBanner() {
  console.log();
  console.log(chalk.cyan.bold("  ╔═══════════════════════════════════════╗"));
  console.log(
    chalk.cyan.bold("  ║  ") +
      chalk.blue.bold("Pax8") +
      chalk.magenta.bold(" CTA") +
      chalk.cyan.bold(" • Multi-Tenant Deployment  ║")
  );
  console.log(chalk.cyan.bold("  ╚═══════════════════════════════════════╝"));
  console.log();
}

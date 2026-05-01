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

let pirateMode = false;

export function setPirateMode(enabled: boolean): void {
  pirateMode = enabled;
}

export function isPirateMode(): boolean {
  return pirateMode;
}

// ---------------------------------------------------------------------------
// Pirate translations for spinner / status messages
// ---------------------------------------------------------------------------

const pirateSpinnerMap: Record<string, string> = {
  "Loading configuration...": "Consultin' the treasure map...",
  "Loading manifest...": "Unrollin' the treasure map...",
  "Loading deployment...": "Checkin' the ship's log...",
  "Loading fleet manifest...": "Gatherin' the fleet roster...",
  "Loading agents...": "Mustering the crew...",
  "Loading agent...": "Summonin' a crewmate...",
  "Enabling demo mode...": "Raisin' the Jolly Roger...",
  "Authenticating with directory...": "Showin' our letters of marque...",
  "Establishing shipping route...": "Chartin' the course...",
  "Connecting to shipping dock...": "Rowin' to the dock...",
  "Connecting to deployment service...": "Signalin' the fleet admiral...",
  "Validating configuration file...": "Inspectin' the ship's papers...",
  "Checking application users...": "Takin' roll call on deck...",
  "Checking health...": "Checkin' the crew for scurvy...",
  "Checking version drift...": "Scannin' the horizon for drift...",
  "Checking source environment...": "Scoutin' the home port...",
  "Fetching GDAP relationships...": "Checkin' our alliances...",
  "Approving deployment...": "Givin' the order to fire!",
  "Rejecting deployment...": "Callin' off the attack!",
  "Cancelling deployment...": "Soundin' the retreat!",
  "Retrying failed jobs...": "Rallyin' the crew for another go!",
  "Initiating rollback...": "Battening down the hatches!",
  "Loading deployment history...": "Reviewin' the captain's log...",
  "Enabling tenant...": "Welcomin' a new port o' call...",
  "Disabling tenant...": "Strikin' a port from the charts...",
  "Updating tags...": "Scratchin' new marks on the map...",
  "Creating client secret...": "Forgin' a new skeleton key...",
  "Detecting solution mode in target environments...": "Scoutin' the enemy waters...",
};

/**
 * Translate a spinner/status message to pirate speak.
 * Falls back to the original if no translation exists, but still
 * applies some generic word swaps for dynamic messages.
 */
export function pirateSpinner(text: string): string {
  if (!pirateMode) return text;

  // Exact match first
  if (pirateSpinnerMap[text]) return pirateSpinnerMap[text];

  // Pattern-based translations for dynamic messages
  return pirateifyText(text);
}

// ---------------------------------------------------------------------------
// Generic pirate-ification for dynamic strings
// ---------------------------------------------------------------------------

const wordSwaps: [RegExp, string][] = [
  [/\bDeploying to\b/g, "Sailin' to"],
  [/\bDeploying directly to destinations\b/g, "Plunderin' the ports directly"],
  [/\bDeployed successfully\b/g, "Plundered successfully, yarr!"],
  [/\bDeployment Summary\b/g, "Plunder Report"],
  [/\bDeployment\b/g, "Voyage"],
  [/\bdeployment\b/g, "voyage"],
  [/\bShipment dispatched successfully\b/g, "The fleet has set sail, yarr!"],
  [/\bShipment Details\b/g, "Voyage Manifest"],
  [/\bShipment\b/g, "Voyage"],
  [/\bshipment\b/g, "voyage"],
  [/\bShipping Destinations\b/g, "Ports to Plunder"],
  [/\bDestination\b/g, "Port"],
  [/\bdestination\b/g, "port"],
  [/\bTracking #\b/g, "Treasure Map #"],
  [/\bAgent package\b/gi, "Treasure chest"],
  [/\bPackage\b/g, "Treasure"],
  [/\bpackage\b/g, "treasure"],
  [/\bExporting\b/g, "Plunderin'"],
  [/\bExported\b/g, "Plundered"],
  [/\bExport\b/g, "Plunder"],
  [/\bexport\b/g, "plunder"],
  [/\bImporting\b/g, "Unloadin' the booty at"],
  [/\bImport\b/g, "Unload booty"],
  [/\bimport\b/g, "unload booty"],
  [/\bDelivering\b/g, "Ferrying treasure to"],
  [/\bDelivered successfully\b/g, "Treasure delivered, yarr!"],
  [/\bDelivery\b/g, "Treasure run"],
  [/\bdelivery\b/g, "treasure run"],
  [/\bUnloading at\b/g, "Haulin' booty ashore at"],
  [/\bRoute established\b/g, "Course charted"],
  [/\bManifest loaded\b/g, "Treasure map unfurled"],
  [/\bAgent\b/g, "Buccaneer"],
  [/\bagent\b/g, "buccaneer"],
  [/\bSolution\b/g, "Loot"],
  [/\bsolution\b/g, "loot"],
  [/\bTenant\b/g, "Port"],
  [/\btenant\b/g, "port"],
  [/\btenants\b/g, "ports"],
  [/\bDry run\b/g, "Spy mission"],
  [/\bFailed\b/g, "Sunk"],
  [/\bfailed\b/g, "sunk"],
  [/\bSuccess\b/g, "Plundered"],
  [/\bsuccess\b/g, "plundered"],
  [/\bTotal\b/g, "Fleet size"],
  [/\bChecking\b/g, "Eyeballin'"],
  [/\bConnected\b/g, "Docked"],
  [/\bconnected\b/g, "docked"],
  [/\bReady\b/g, "Battle-ready"],
  [/\bLoading\b/g, "Hoistin'"],
  [/\bloading\b/g, "hoistin'"],
  [/\bDockworker\b/g, "First mate"],
  [/\bdockworker\b/g, "first mate"],
  [/\bWorker\b/g, "Deckhand"],
  [/\bworker\b/g, "deckhand"],
  [/\bQueue\b/g, "Gangplank"],
  [/\bqueue\b/g, "gangplank"],
  [/\bError\b/g, "Blimey"],
  [/\berror\b/g, "blimey"],
  [/\bWarning\b/g, "Avast"],
  [/\bwarning\b/g, "avast"],
];

function pirateifyText(text: string): string {
  let result = text;
  for (const [pattern, replacement] of wordSwaps) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Wrap any user-facing string through pirate mode.
 * Use this for one-off strings that aren't covered by the spinner map.
 */
export function pirate(text: string): string {
  if (!pirateMode) return text;
  return pirateifyText(text);
}

// ---------------------------------------------------------------------------
// Random pirate quips for success / failure
// ---------------------------------------------------------------------------

const successQuips = [
  "Shiver me timbers, it worked!",
  "Yo ho ho! Smooth sailin'!",
  "The seas be calm and the loot be ours!",
  "Arr, that went better than expected!",
  "By Davy Jones, we did it!",
  "The wind be at our backs, cap'n!",
  "Hoist the colors! Victory is ours!",
  "Not a single kraken in sight!",
];

const failureQuips = [
  "Arrr, we've been scuttled!",
  "Davy Jones claims another one...",
  "Abandon ship! Abandon ship!",
  "The kraken got us, cap'n!",
  "We've hit the rocks!",
  "Man overboard! ...er, deployment overboard!",
  "Blimey, that went sideways!",
  "Walk the plank, ya buggy code!",
];

export function pirateSuccessQuip(): string {
  return successQuips[Math.floor(Math.random() * successQuips.length)];
}

export function pirateFailureQuip(): string {
  return failureQuips[Math.floor(Math.random() * failureQuips.length)];
}

// ---------------------------------------------------------------------------
// Pirate banner ASCII art
// ---------------------------------------------------------------------------

export function showPirateBanner(version: string = "0.1.0") {
  const W = 63;
  const border = chalk.yellow.bold("~".repeat(W));
  const row = (text: string, visibleLen: number, color: (s: string) => string) =>
    chalk.yellow.bold("~") + color(text) + " ".repeat(W - visibleLen) + chalk.yellow.bold("~");
  const empty = row("", 0, (s) => s);

  const skullArt = [
    ["          _____", 15],
    ["         /     \\", 16],
    ["        | () () |", 18],
    ["         \\  ^  /", 16],
    ["          |||||", 15],
    ["          |||||", 15],
  ] as const;

  const swordsArt = [
    ["     __|__          __|__", 25],
    ["       |    AGENT     |", 23],
    ["       |     SYNC     |", 23],
    ["     __|__          __|__", 25],
  ] as const;

  const tagline = "   Arr! Sync yer Copilot agents across the seven seas!";
  const versionLine = `   v${version} - Plunderin' ports since 2024`;

  const lines = [
    chalk.yellow.bold("." + border + "."),
    empty,
    ...skullArt.map(([text, len]) => row(text, len, chalk.white.bold)),
    empty,
    ...swordsArt.map(([text, len]) => row(text, len, chalk.red.bold)),
    empty,
    row(tagline, tagline.length, chalk.yellow),
    row(versionLine, versionLine.length, chalk.gray),
    empty,
    chalk.yellow.bold("'" + border + "'"),
  ];

  console.log("\n" + lines.join("\n"));
}

export function showPirateWelcome() {
  console.log();
  console.log(chalk.yellow.bold("  Ahoy, Cap'n! Ready to set sail?"));
  console.log();
  console.log(
    chalk.white("  Plunder all ports:        ") + chalk.gray("deploy --all --solution ./agent.zip")
  );
  console.log(chalk.white("  Check voyage status:      ") + chalk.gray("status --deployment <id>"));
  console.log(chalk.white("  Survey yer fleet:         ") + chalk.gray("tenants list"));
  console.log();
  console.log(chalk.yellow("  Lost at sea? ") + chalk.gray("Type: help"));
  console.log();
}

export function showPirateCompactBanner() {
  console.log();
  console.log(chalk.yellow.bold("  .~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~."));
  console.log(
    chalk.yellow.bold("  ~ ") +
      chalk.white.bold(" Agent") +
      chalk.red.bold("Sync") +
      chalk.yellow(" - Plunderin' Ports Since 2024") +
      chalk.yellow.bold("  ~")
  );
  console.log(chalk.yellow.bold("  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~'"));
  console.log();
}

// ---------------------------------------------------------------------------
// Pirate farewell messages
// ---------------------------------------------------------------------------

const farewells = [
  "Fair winds and following seas, cap'n!",
  "Until we sail again, yarr!",
  "May yer deployments never sink!",
  "Back to Davy Jones' locker with ye!",
  "Anchors aweigh... er, goodbye!",
  "The pirate's life ain't for everyone. Farewell!",
];

export function pirateFarewell(): string {
  return farewells[Math.floor(Math.random() * farewells.length)];
}

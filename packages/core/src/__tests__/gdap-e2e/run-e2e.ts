#!/usr/bin/env tsx
/**
 * GDAP E2E Test Runner
 *
 * A convenience script that validates environment variables are present
 * before launching the E2E test suite. Can be run directly or via:
 *
 *   pnpm --filter @agentsync/core test -- --run src/__tests__/gdap-e2e/
 *
 * Usage:
 *   npx tsx packages/core/src/__tests__/gdap-e2e/run-e2e.ts
 *
 * The tests themselves also skip gracefully if env vars are missing,
 * but this script provides a clearer pre-flight check.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const REQUIRED_ENV_VARS = [
  "GDAP_PARTNER_TENANT_ID",
  "GDAP_CLIENT_ID",
  "GDAP_CLIENT_SECRET",
  "GDAP_CUSTOMER_TENANT_ID",
] as const;

const OPTIONAL_ENV_VARS = ["GDAP_CUSTOMER_ENVIRONMENT_URL"] as const;

/**
 * Load environment variables from a .env.gdap-e2e file if it exists.
 */
function loadEnvFile(): void {
  // Search upward for .env.gdap-e2e from the repo root
  const candidates = [
    resolve(process.cwd(), ".env.gdap-e2e"),
    resolve(process.cwd(), "../../.env.gdap-e2e"), // from packages/core/
  ];

  for (const envPath of candidates) {
    if (existsSync(envPath)) {
      console.log(`Loading credentials from ${envPath}`);
      const content = readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIndex = trimmed.indexOf("=");
        if (eqIndex === -1) continue;
        const key = trimmed.slice(0, eqIndex).trim();
        const value = trimmed
          .slice(eqIndex + 1)
          .trim()
          .replace(/^["']|["']$/g, "");
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
      return;
    }
  }
}

function main(): void {
  console.log("=== GDAP E2E Test Runner ===\n");

  // Try loading .env.gdap-e2e
  loadEnvFile();

  // Check required env vars
  const missing: string[] = [];
  const present: string[] = [];

  for (const key of REQUIRED_ENV_VARS) {
    if (process.env[key]) {
      present.push(key);
    } else {
      missing.push(key);
    }
  }

  console.log("Required environment variables:");
  for (const key of REQUIRED_ENV_VARS) {
    const status = process.env[key] ? "SET" : "MISSING";
    const masked = process.env[key]
      ? `${process.env[key]!.slice(0, 4)}...${process.env[key]!.slice(-4)}`
      : "---";
    console.log(`  ${status === "SET" ? "[ok]" : "[!!]"} ${key}: ${masked}`);
  }

  console.log("\nOptional environment variables:");
  for (const key of OPTIONAL_ENV_VARS) {
    const status = process.env[key] ? "SET" : "NOT SET";
    console.log(`  [${status === "SET" ? "ok" : "--"}] ${key}: ${status}`);
  }

  if (missing.length > 0) {
    console.log(`\n${missing.length} required variable(s) missing.`);
    console.log("Tests will be skipped. See README.md for setup instructions.");
    console.log("\nTo set up credentials, create a .env.gdap-e2e file in the repo root:\n");
    for (const key of REQUIRED_ENV_VARS) {
      console.log(`  ${key}=<value>`);
    }
    console.log("");
    process.exit(0);
  }

  console.log("\nAll required credentials found. Running E2E tests...\n");

  // Run vitest targeting just the gdap-e2e directory
  try {
    execSync("npx vitest run src/__tests__/gdap-e2e/gdap-e2e.test.ts", {
      cwd: resolve(import.meta.dirname, "../../.."),
      stdio: "inherit",
      env: {
        ...process.env,
        // Ensure these are passed through
        GDAP_PARTNER_TENANT_ID: process.env.GDAP_PARTNER_TENANT_ID,
        GDAP_CLIENT_ID: process.env.GDAP_CLIENT_ID,
        GDAP_CLIENT_SECRET: process.env.GDAP_CLIENT_SECRET,
        GDAP_CUSTOMER_TENANT_ID: process.env.GDAP_CUSTOMER_TENANT_ID,
        GDAP_CUSTOMER_ENVIRONMENT_URL: process.env.GDAP_CUSTOMER_ENVIRONMENT_URL,
      },
    });
  } catch {
    process.exit(1);
  }
}

main();

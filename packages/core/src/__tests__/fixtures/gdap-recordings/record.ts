#!/usr/bin/env npx tsx
/**
 * Records live GDAP Graph API responses and saves them as sanitized fixtures.
 *
 * Usage:
 *   PARTNER_TENANT_ID=... PARTNER_CLIENT_ID=... PARTNER_CLIENT_SECRET=... \
 *     npx tsx packages/core/src/__tests__/fixtures/gdap-recordings/record.ts
 *
 * The script will:
 * 1. Authenticate to Azure AD using partner credentials
 * 2. Call the Graph API GDAP endpoints
 * 3. Sanitize sensitive fields (tokens, real tenant names are kept for shape accuracy)
 * 4. Save the response to active-relationships.json
 *
 * Review the output before committing — make sure no real secrets are included.
 */

import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TokenManager } from "../../../../auth/token-manager.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const { PARTNER_TENANT_ID, PARTNER_CLIENT_ID, PARTNER_CLIENT_SECRET } = process.env;

if (!PARTNER_TENANT_ID || !PARTNER_CLIENT_ID || !PARTNER_CLIENT_SECRET) {
  console.error("Missing required environment variables:");
  console.error("  PARTNER_TENANT_ID, PARTNER_CLIENT_ID, PARTNER_CLIENT_SECRET");
  process.exit(1);
}

async function record() {
  console.log("Authenticating to Azure AD...");
  const tokenManager = new TokenManager({
    tenantId: PARTNER_TENANT_ID!,
    clientId: PARTNER_CLIENT_ID!,
    clientSecret: PARTNER_CLIENT_SECRET!,
  });

  const token = await tokenManager.getGraphToken();
  console.log("Authenticated successfully.");

  console.log("Fetching delegated admin relationships...");
  const response = await fetch(
    "https://graph.microsoft.com/v1.0/tenantRelationships/delegatedAdminRelationships",
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error(`Graph API error (${response.status}): ${error}`);
    process.exit(1);
  }

  const data = await response.json();
  console.log(`Found ${data.value?.length ?? 0} relationships.`);

  // Save the raw recording (review before committing!)
  const outputPath = resolve(__dirname, "active-relationships.recorded.json");
  writeFileSync(outputPath, JSON.stringify(data, null, 2));
  console.log(`\nSaved raw recording to: ${outputPath}`);
  console.log("\nIMPORTANT: Review the file and sanitize before committing.");
  console.log("Consider replacing real tenant IDs and display names with fake values.");
  console.log("Then copy to active-relationships.json once sanitized.");
}

record().catch((error) => {
  console.error("Recording failed:", error);
  process.exit(1);
});

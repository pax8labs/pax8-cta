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

import { getClientSecret as getCoreClientSecret } from "@agentsync/core";
import { getClientSecretWithFallback } from "./credentials.js";

/**
 * Get client secret for CLI commands with keychain fallback support.
 * This wraps the core getClientSecret and adds OS keychain as a fallback.
 *
 * Priority:
 * 1. Environment variable (specified by envVar parameter)
 * 2. OS keychain (if env var not set)
 *
 * @param envVar - Environment variable name to check (default: PARTNER_CLIENT_SECRET)
 * @returns The client secret
 * @throws Error if secret not found in either location
 */
export async function getClientSecretForCLI(
  envVar: string = "PARTNER_CLIENT_SECRET"
): Promise<string> {
  // First try the environment variable directly
  const envSecret = process.env[envVar];
  if (envSecret) {
    return envSecret;
  }

  // For PARTNER_CLIENT_SECRET, also check AGENTSYNC_CLIENT_SECRET as an alias
  if (envVar === "PARTNER_CLIENT_SECRET") {
    const agentSyncSecret = process.env.AGENTSYNC_CLIENT_SECRET;
    if (agentSyncSecret) {
      return agentSyncSecret;
    }
  }

  // Fall back to keychain
  try {
    return await getClientSecretWithFallback(envVar);
  } catch {
    // If keychain fallback also fails, use the core function to get consistent error messages
    return getCoreClientSecret(envVar);
  }
}

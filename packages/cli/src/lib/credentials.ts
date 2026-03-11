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

import keytar from "keytar";

const SERVICE_NAME = "agentsync";
const ACCOUNT_NAME = "client-secret";

/**
 * Get stored secret from OS keychain
 */
export async function getStoredSecret(): Promise<string | null> {
  try {
    return await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
  } catch (error) {
    // If keytar fails (e.g., on unsupported platforms), return null
    return null;
  }
}

/**
 * Store secret in OS keychain
 */
export async function storeSecret(secret: string): Promise<void> {
  if (!secret || secret.trim().length === 0) {
    throw new Error("Secret cannot be empty");
  }

  try {
    await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, secret);
  } catch (error) {
    throw new Error(
      `Failed to store secret in keychain: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Remove secret from OS keychain
 */
export async function deleteSecret(): Promise<void> {
  try {
    await keytar.deletePassword(SERVICE_NAME, ACCOUNT_NAME);
  } catch (error) {
    // Ignore errors when deleting (secret may not exist)
  }
}

/**
 * Get client secret with fallback priority:
 * 1. Environment variable (AGENTSYNC_CLIENT_SECRET or custom name)
 * 2. OS keychain
 *
 * @param envVar - Environment variable name to check (default: AGENTSYNC_CLIENT_SECRET)
 * @returns The client secret
 * @throws Error if secret not found in either location
 */
export async function getClientSecretWithFallback(
  envVar: string = "AGENTSYNC_CLIENT_SECRET"
): Promise<string> {
  // Check environment variable first
  const envSecret = process.env[envVar];
  if (envSecret) {
    return envSecret;
  }

  // Fall back to keychain
  const keychainSecret = await getStoredSecret();
  if (keychainSecret) {
    return keychainSecret;
  }

  throw new Error(
    `Client secret not found. Either:\n` +
      `  1. Set the ${envVar} environment variable, OR\n` +
      `  2. Store it securely using: agentsync auth login`
  );
}

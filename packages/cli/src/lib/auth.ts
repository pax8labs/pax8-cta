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

import { deviceCodeLogin } from "@agentsync/core";
import type { DeviceCodeLoginResult } from "@agentsync/core";
import open from "open";
import chalk from "chalk";
import { storeSecret } from "./credentials.js";

const KEYTAR_SERVICE = "agentsync-cli";

/**
 * Lazily load keytar (optional dependency — may not be installed if native
 * compilation failed, e.g. on Windows without Visual Studio Build Tools).
 */
type KeytarModule = typeof import("keytar");
type KeytarLike = Pick<KeytarModule, "getPassword" | "setPassword" | "deletePassword">;

async function getKeytar(): Promise<KeytarLike | null> {
  try {
    const mod = (await import("keytar")) as KeytarModule & { default?: KeytarModule };
    const keytar = (mod.default || mod) as KeytarLike;
    if (
      typeof keytar.getPassword === "function" &&
      typeof keytar.setPassword === "function" &&
      typeof keytar.deletePassword === "function"
    ) {
      return keytar;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Open a URL in the default browser
 */
function openBrowser(url: string): void {
  open(url);
}

export type InteractiveLoginResult = DeviceCodeLoginResult;

/**
 * Perform interactive device code login for Microsoft authentication
 * Opens user's browser for authentication
 */
export async function interactiveLogin(options?: {
  clientId?: string;
  tenantId?: string;
  scopes?: string[];
  openBrowser?: boolean;
}): Promise<InteractiveLoginResult> {
  const shouldOpenBrowser = options?.openBrowser ?? false;

  try {
    return await deviceCodeLogin({
      clientId: options?.clientId,
      tenantId: options?.tenantId,
      scopes: options?.scopes,
      deviceCodeCallback: (response) => {
        if (shouldOpenBrowser) {
          openBrowser(response.verificationUri);
          console.log(`  ✓ Browser opened`);
          console.log(`  Enter code: ${chalk.bold(response.userCode)}`);
        } else {
          console.log(`  1. Open: ${response.verificationUri}`);
          console.log(`  2. Enter code: ${chalk.bold(response.userCode)}`);
        }
        console.log();
        console.log("  Waiting for you to sign in...");
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Authentication failed: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Store credentials securely in the OS keychain.
 *
 * Writes the client secret to the canonical keychain entry used by
 * `getClientSecretWithFallback()` (via `storeSecret` from credentials.ts)
 * as well as the per-clientId entry for tenant-specific lookup.
 */
export async function storeCredentials(
  clientId: string,
  clientSecret: string,
  tenantId?: string
): Promise<void> {
  // Store in the canonical location so getClientSecretWithFallback() can find it
  await storeSecret(clientSecret);

  const keytar = await getKeytar();
  if (keytar) {
    try {
      // Also store per-clientId for tenant-specific retrieval
      await keytar.setPassword(KEYTAR_SERVICE, `clientSecret:${clientId}`, clientSecret);

      // Store tenant ID if provided
      if (tenantId) {
        await keytar.setPassword(KEYTAR_SERVICE, `tenantId:${clientId}`, tenantId);
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to store credentials: ${error.message}`);
      }
      throw error;
    }
  }
}

/**
 * Retrieve stored credentials from the OS keychain
 */
export async function getStoredCredentials(
  clientId: string
): Promise<{ clientSecret: string; tenantId?: string } | null> {
  try {
    const keytar = await getKeytar();
    if (!keytar) return null;

    const clientSecret = await keytar.getPassword(KEYTAR_SERVICE, `clientSecret:${clientId}`);

    if (!clientSecret) {
      return null;
    }

    const tenantId = await keytar.getPassword(KEYTAR_SERVICE, `tenantId:${clientId}`);

    return {
      clientSecret,
      tenantId: tenantId || undefined,
    };
  } catch {
    // Return null if keychain is not available (e.g., in some CI environments)
    return null;
  }
}

/**
 * Remove credentials from the OS keychain
 */
export async function clearCredentials(clientId: string): Promise<void> {
  try {
    const keytar = await getKeytar();
    if (!keytar) return;
    await keytar.deletePassword(KEYTAR_SERVICE, `clientSecret:${clientId}`);
    await keytar.deletePassword(KEYTAR_SERVICE, `tenantId:${clientId}`);
  } catch {
    // Ignore errors when clearing (credential may not exist)
  }
}

/**
 * Check if credentials exist in the keychain
 */
export async function hasStoredCredentials(clientId: string): Promise<boolean> {
  try {
    const creds = await getStoredCredentials(clientId);
    return creds !== null;
  } catch {
    return false;
  }
}

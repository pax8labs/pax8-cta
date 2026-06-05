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

import { deviceCodeLogin } from "@pax8/cta-core";
import type { DeviceCodeLoginResult } from "@pax8/cta-core";
import open from "open";
import chalk from "chalk";
import { storeSecret } from "./credentials.js";

// Keychain "service" string — preserved verbatim for backwards compatibility
// with credentials already stored on user machines by earlier versions.
const KEYRING_SERVICE = "pax8-cta-cli";

/**
 * Lazily load @napi-rs/keyring (optional dependency — native bindings may not
 * be available on every platform). The package exposes a synchronous `Entry`
 * class; we wrap it in a keytar-shaped async interface so call sites here
 * stay compact and consistent with credentials.ts.
 */
interface KeyringLike {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
}

type KeyringModule = {
  Entry: new (
    service: string,
    account: string
  ) => {
    getPassword(): string | null;
    setPassword(password: string): void;
    deletePassword(): boolean;
  };
};

async function getKeyring(): Promise<KeyringLike | null> {
  try {
    const mod = (await import("@napi-rs/keyring")) as KeyringModule & {
      default?: KeyringModule;
    };
    const keyring = (mod.default || mod) as KeyringModule;
    if (typeof keyring.Entry !== "function") {
      return null;
    }
    return {
      async getPassword(service: string, account: string): Promise<string | null> {
        const entry = new keyring.Entry(service, account);
        return entry.getPassword();
      },
      async setPassword(service: string, account: string, password: string): Promise<void> {
        const entry = new keyring.Entry(service, account);
        entry.setPassword(password);
      },
      async deletePassword(service: string, account: string): Promise<boolean> {
        const entry = new keyring.Entry(service, account);
        return entry.deletePassword();
      },
    };
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

  const keyring = await getKeyring();
  if (keyring) {
    try {
      // Also store per-clientId for tenant-specific retrieval
      await keyring.setPassword(KEYRING_SERVICE, `clientSecret:${clientId}`, clientSecret);

      // Store tenant ID if provided
      if (tenantId) {
        await keyring.setPassword(KEYRING_SERVICE, `tenantId:${clientId}`, tenantId);
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
    const keyring = await getKeyring();
    if (!keyring) return null;

    const clientSecret = await keyring.getPassword(KEYRING_SERVICE, `clientSecret:${clientId}`);

    if (!clientSecret) {
      return null;
    }

    const tenantId = await keyring.getPassword(KEYRING_SERVICE, `tenantId:${clientId}`);

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
    const keyring = await getKeyring();
    if (!keyring) return;
    await keyring.deletePassword(KEYRING_SERVICE, `clientSecret:${clientId}`);
    await keyring.deletePassword(KEYRING_SERVICE, `tenantId:${clientId}`);
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

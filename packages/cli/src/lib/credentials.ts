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

const SERVICE_NAME = "pax8-cta";
const ACCOUNT_NAME = "client-secret";

/**
 * Lazily load @napi-rs/keyring (optional dependency — native bindings may not
 * be available on every platform, e.g. unsupported architectures). The package
 * exposes an `Entry` class with synchronous methods; we wrap it to preserve
 * the existing async, keytar-shaped (`getPassword(service, account)`) interface
 * so callers across the CLI don't need to change.
 */
export interface KeyringLike {
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
 * Get stored secret from OS keychain
 */
export async function getStoredSecret(): Promise<string | null> {
  try {
    const keyring = await getKeyring();
    if (!keyring) return null;
    return await keyring.getPassword(SERVICE_NAME, ACCOUNT_NAME);
  } catch {
    // If the keychain fails (e.g., on unsupported platforms), return null
    return null;
  }
}

/**
 * Probe whether the OS keychain is available without revealing the secret.
 *
 * Useful for status / config commands that need to report whether a stored
 * credential exists. Returns one of:
 *   - "set"         — keychain available and a secret is stored
 *   - "not-set"     — keychain available but no secret stored
 *   - "unavailable" — keychain bindings not installed or keychain unreadable
 *
 * Never returns or logs the secret value.
 */
export async function probeStoredSecret(): Promise<"set" | "not-set" | "unavailable"> {
  const keyring = await getKeyring();
  if (!keyring) return "unavailable";
  try {
    const value = await keyring.getPassword(SERVICE_NAME, ACCOUNT_NAME);
    return value ? "set" : "not-set";
  } catch {
    return "unavailable";
  }
}

/**
 * Store secret in OS keychain
 */
export async function storeSecret(secret: string): Promise<void> {
  if (!secret || secret.trim().length === 0) {
    throw new Error("Secret cannot be empty");
  }

  const keyring = await getKeyring();
  if (!keyring) {
    const hint =
      process.platform === "win32"
        ? "OS keychain is unavailable (native bindings not installed — may require Visual Studio Build Tools on Windows).\n  Set the PARTNER_CLIENT_SECRET environment variable or add it to .env instead."
        : "OS keychain is unavailable (native bindings not installed).\n  Set the PARTNER_CLIENT_SECRET environment variable or add it to .env instead.";
    throw new Error(hint);
  }

  try {
    await keyring.setPassword(SERVICE_NAME, ACCOUNT_NAME, secret);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to store secret in keychain: ${msg}`);
  }
}

/**
 * Remove secret from OS keychain
 */
export async function deleteSecret(): Promise<void> {
  try {
    const keyring = await getKeyring();
    if (!keyring) return;
    await keyring.deletePassword(SERVICE_NAME, ACCOUNT_NAME);
  } catch {
    // Ignore errors when deleting (secret may not exist)
  }
}

/**
 * Canonical environment variable names checked for the client secret,
 * in priority order.  PARTNER_CLIENT_SECRET is the primary name used
 * in .env files and documentation; PAX8_CTA_CLIENT_SECRET is kept as
 * a supported alias for backwards compatibility.
 */
const CLIENT_SECRET_ENV_VARS = ["PARTNER_CLIENT_SECRET", "PAX8_CTA_CLIENT_SECRET"] as const;

/**
 * Resolve the client secret using a single, well-defined fallback chain.
 *
 * Priority:
 *   1. Environment variables (PARTNER_CLIENT_SECRET, then PAX8_CTA_CLIENT_SECRET).
 *      These are populated either by the shell environment or by the .env loader
 *      in index.ts — so .env file values are included here automatically.
 *   2. OS keychain (stored via `pax8-cta auth login`).
 *
 * Every CLI command that needs a client secret MUST call this function
 * rather than reading process.env directly.
 *
 * @returns The client secret
 * @throws Error if secret not found in any location
 */
export async function getClientSecretWithFallback(): Promise<string> {
  // 1. Check environment variables (covers both shell env and .env file)
  for (const envVar of CLIENT_SECRET_ENV_VARS) {
    const value = process.env[envVar];
    if (value) {
      return value;
    }
  }

  // 2. Fall back to OS keychain
  const keychainSecret = await getStoredSecret();
  if (keychainSecret) {
    return keychainSecret;
  }

  throw new Error(
    `Client secret not found. Either:\n` +
      `  1. Set the PARTNER_CLIENT_SECRET environment variable (or add it to .env), OR\n` +
      `  2. Store it securely using: auth login`
  );
}

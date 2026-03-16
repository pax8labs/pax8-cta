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

/**
 * Shared Database Configuration
 * Ensures web and worker packages use the same SQLite database file
 */

import { join, resolve } from "path";

/**
 * Get the absolute path to the SQLite database file
 *
 * Resolution order:
 * 1. DATABASE_PATH environment variable (absolute path)
 * 2. Default: ./data/agentsync.db relative to process.cwd()
 *
 * Both web and worker MUST use this function to ensure they access
 * the same database file for deployment status synchronization.
 */
export function getDatabasePath(): string {
  const envPath = process.env.DATABASE_PATH;

  if (envPath) {
    // Use absolute path from environment variable
    return resolve(envPath);
  }

  // Default: resolve relative to current working directory
  // In monorepo, cwd is typically the repo root when using pnpm
  return join(process.cwd(), "data", "agentsync.db");
}

/**
 * Log database configuration on startup for verification
 * Call this from both web and worker to ensure they're using the same path
 */
export function logDatabaseConfig(): void {
  const path = getDatabasePath();
  const source = process.env.DATABASE_PATH ? "DATABASE_PATH env var" : "default path";

  console.log(`[Database] Using SQLite database: ${path}`);
  console.log(`[Database] Source: ${source}`);
  console.log(`[Database] Working directory: ${process.cwd()}`);
}

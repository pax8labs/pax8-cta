/**
 * Shared Database Configuration
 * Ensures web and worker packages use the same SQLite database file
 */

import { resolve } from 'path';

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
  return resolve(process.cwd(), 'data/agentsync.db');
}

/**
 * Log database configuration on startup for verification
 * Call this from both web and worker to ensure they're using the same path
 */
export function logDatabaseConfig(): void {
  const path = getDatabasePath();
  const source = process.env.DATABASE_PATH ? 'DATABASE_PATH env var' : 'default path';

  console.log(`[Database] Using SQLite database: ${path}`);
  console.log(`[Database] Source: ${source}`);
  console.log(`[Database] Working directory: ${process.cwd()}`);
}

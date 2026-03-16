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

/**
 * Deployment Repository
 * Shared database operations for deployment status tracking
 * Used by both web and worker packages
 */

import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "fs";
import { dirname } from "path";
import { getDatabasePath, logDatabaseConfig } from "../config/database.js";
import { DEFAULT_DB_RETRY_COUNT, DB_RETRY_BASE_DELAY_MS } from "../constants.js";

// Database file location (shared across web and worker)
const DB_PATH = getDatabasePath();

// Singleton database instance
let db: Database.Database | null = null;
let dbLoggedOnce = false;

/**
 * Retry database operation with exponential backoff for SQLITE_BUSY errors
 * SQLite can only handle limited concurrent writes, so we retry with backoff
 */
function retryDatabaseOperation<T>(operation: () => T, maxRetries = DEFAULT_DB_RETRY_COUNT): T {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return operation();
    } catch (error) {
      lastError = error as Error;
      const isBusyError =
        lastError.message?.includes("SQLITE_BUSY") ||
        lastError.message?.includes("database is locked");

      // Only retry on lock contention errors
      if (!isBusyError || attempt === maxRetries - 1) {
        throw lastError;
      }

      // Exponential backoff: 100ms, 200ms, 400ms
      const delayMs = DB_RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
      console.warn(
        `[Database] Retry attempt ${attempt + 1}/${maxRetries} after ${delayMs}ms due to: ${lastError.message}`
      );

      // Synchronous sleep (acceptable for short retry delays)
      const start = Date.now();
      while (Date.now() - start < delayMs) {
        // Busy wait
      }
    }
  }

  throw lastError;
}

/**
 * Get or create the database instance
 * Connects to the same SQLite file used by the web package
 */
function getDatabase(): Database.Database {
  if (!db) {
    // Log database configuration on first access
    if (!dbLoggedOnce) {
      console.log("[Worker] Initializing database connection");
      logDatabaseConfig();

      // Warn about SQLite limitations
      console.warn("[Database] SQLite is suitable for development and small deployments");
      console.warn("[Database] Worker concurrency limited to 3 to prevent lock contention");
      console.warn("[Database] For production with >3 concurrent workers, use PostgreSQL");

      dbLoggedOnce = true;
    }

    // Ensure data directory exists
    const dbDir = dirname(DB_PATH);
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }

    // Create database with WAL mode for better concurrency
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.pragma("busy_timeout = 10000"); // 10 second timeout for lock contention (increased for higher concurrency)
  }

  return db;
}

/**
 * Update deployment status in database
 * Called by worker when job completes or fails
 */
export function updateDeploymentStatus(
  deploymentId: string,
  status: "pending" | "in_progress" | "completed" | "failed" | "cancelled" | "rolled_back",
  error?: string
): void {
  const database = getDatabase();
  const now = new Date().toISOString();

  let query = "UPDATE deployments SET status = ?, updated_at = ?";
  const params: (string | null)[] = [status, now];

  if (error !== undefined) {
    query += ", error = ?";
    params.push(error);
  }

  if (status === "in_progress") {
    query += ", started_at = COALESCE(started_at, ?)";
    params.push(now);
  }

  if (
    status === "completed" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "rolled_back"
  ) {
    query += ", completed_at = ?";
    params.push(now);
  }

  query += " WHERE id = ?";
  params.push(deploymentId);

  retryDatabaseOperation(() => {
    database.prepare(query).run(...params);
  });
}

/**
 * Update batch status and counts
 * Called to update overall deployment batch progress
 */
export function updateBatchStatus(
  batchId: string,
  status: "pending" | "in_progress" | "completed" | "failed" | "cancelled",
  counts?: { completed?: number; failed?: number }
): void {
  const database = getDatabase();
  const now = new Date().toISOString();

  let query = "UPDATE deployment_batches SET status = ?, updated_at = ?";
  const params: (string | number)[] = [status, now];

  if (counts?.completed !== undefined) {
    query += ", completed_deployments = ?";
    params.push(counts.completed);
  }

  if (counts?.failed !== undefined) {
    query += ", failed_deployments = ?";
    params.push(counts.failed);
  }

  if (status === "in_progress") {
    query += ", started_at = COALESCE(started_at, ?)";
    params.push(now);
  }

  if (status === "completed" || status === "failed" || status === "cancelled") {
    query += ", completed_at = ?";
    params.push(now);
  }

  query += " WHERE id = ?";
  params.push(batchId);

  retryDatabaseOperation(() => {
    database.prepare(query).run(...params);
  });
}

/**
 * Close database connection
 * Call when shutting down worker or web server
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

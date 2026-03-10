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
 * Database migration runner
 * Manages schema versioning and applies migrations in order
 */

import Database from "better-sqlite3";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

export interface Migration {
  version: number;
  name: string;
  up: string;
  down?: string;
}

/**
 * Initialize the schema_migrations tracking table
 */
function initMigrationsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL,
      checksum TEXT
    );
  `);
}

/**
 * Get the current schema version
 */
function getCurrentVersion(db: Database.Database): number {
  const result = db.prepare("SELECT MAX(version) as version FROM schema_migrations").get() as {
    version: number | null;
  };

  return result.version ?? 0;
}

/**
 * Record a migration as applied
 */
function recordMigration(
  db: Database.Database,
  version: number,
  name: string,
  checksum: string
): void {
  db.prepare(
    `
    INSERT INTO schema_migrations (version, name, applied_at, checksum)
    VALUES (?, ?, ?, ?)
  `
  ).run(version, name, new Date().toISOString(), checksum);
}

/**
 * Load migration files from the migrations directory
 */
function loadMigrations(): Migration[] {
  const migrationsDir = join(__dirname);
  const files = readdirSync(migrationsDir)
    .filter((f) => f.match(/^\d{3}_.*\.sql$/))
    .sort();

  return files.map((file) => {
    const match = file.match(/^(\d{3})_(.*)\.sql$/);
    if (!match) {
      throw new Error(`Invalid migration filename: ${file}`);
    }

    const version = parseInt(match[1], 10);
    const name = match[2];
    const content = readFileSync(join(migrationsDir, file), "utf-8");

    // Split up and down migrations (separated by -- DOWN)
    const parts = content.split(/^-- DOWN$/m);
    const up = parts[0].trim();
    const down = parts[1]?.trim();

    return { version, name, up, down };
  });
}

/**
 * Simple checksum for migration content
 */
function checksum(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(36);
}

/**
 * Run pending migrations
 */
export function runMigrations(db: Database.Database): void {
  console.log("📦 Running database migrations...");

  // Ensure migrations table exists
  initMigrationsTable(db);

  // Get current version
  const currentVersion = getCurrentVersion(db);
  console.log(`   Current schema version: ${currentVersion}`);

  // Load all migrations
  const migrations = loadMigrations();

  // Filter to only pending migrations
  const pending = migrations.filter((m) => m.version > currentVersion);

  if (pending.length === 0) {
    console.log("✅ Database schema is up to date");
    return;
  }

  console.log(`   Found ${pending.length} pending migration(s)`);

  // Apply each migration in a transaction
  for (const migration of pending) {
    console.log(`   Applying ${migration.version}_${migration.name}...`);

    const transaction = db.transaction(() => {
      // Execute the migration
      db.exec(migration.up);

      // Record it as applied
      recordMigration(db, migration.version, migration.name, checksum(migration.up));
    });

    try {
      transaction();
      console.log(`   ✓ Applied ${migration.version}_${migration.name}`);
    } catch (error) {
      console.error(`   ✗ Failed to apply ${migration.version}_${migration.name}:`, error);
      throw error;
    }
  }

  console.log(`✅ Migrations complete! Schema version: ${getCurrentVersion(db)}`);
}

/**
 * Rollback the last migration (use with caution!)
 */
export function rollbackMigration(db: Database.Database): void {
  const currentVersion = getCurrentVersion(db);

  if (currentVersion === 0) {
    console.log("No migrations to rollback");
    return;
  }

  const migrations = loadMigrations();
  const migration = migrations.find((m) => m.version === currentVersion);

  if (!migration) {
    throw new Error(`Migration ${currentVersion} not found`);
  }

  if (!migration.down) {
    throw new Error(`Migration ${currentVersion} has no down script`);
  }

  console.log(`Rolling back ${migration.version}_${migration.name}...`);

  const transaction = db.transaction(() => {
    // Execute the down migration
    db.exec(migration.down!);

    // Remove from migrations table
    db.prepare("DELETE FROM schema_migrations WHERE version = ?").run(currentVersion);
  });

  transaction();
  console.log(`✓ Rolled back ${migration.version}_${migration.name}`);
}

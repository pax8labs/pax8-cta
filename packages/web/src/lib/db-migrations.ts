/**
 * Database migration utilities for AgentSync
 * Handles schema changes and data migrations
 */

import type Database from 'better-sqlite3'
import { createLogger } from './logger'

const logger = createLogger('Migrations')

/**
 * Check if a column exists in a table
 */
function columnExists(db: Database.Database, tableName: string, columnName: string): boolean {
  try {
    const tableInfo = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
      cid: number
      name: string
      type: string
      notnull: number
      dflt_value: string | null
      pk: number
    }>
    return tableInfo.some(col => col.name === columnName)
  } catch {
    return false
  }
}

/**
 * Run all pending migrations
 */
export function runMigrations(db: Database.Database): void {
  logger.info('Checking for pending migrations...')

  // Migration 001: Enhanced health checks
  migration001_enhancedHealthChecks(db)

  logger.info('All migrations completed')
}

/**
 * Migration 001: Add version drift and dependency tracking to health checks
 */
function migration001_enhancedHealthChecks(db: Database.Database): void {
  const migrationName = '001_enhanced_health_checks'

  try {
    // Check if migrations have already been applied
    const columnsToAdd = [
      { name: 'installed_version', type: 'TEXT' },
      { name: 'expected_version', type: 'TEXT' },
      { name: 'version_drift', type: 'INTEGER DEFAULT 0' },
      { name: 'dependencies_healthy', type: 'INTEGER DEFAULT 1' },
      { name: 'missing_dependencies', type: 'TEXT' },
    ]

    let addedColumns = 0
    for (const column of columnsToAdd) {
      if (!columnExists(db, 'health_check_results', column.name)) {
        logger.info('Adding column', { table: 'health_check_results', column: column.name })
        db.prepare(`ALTER TABLE health_check_results ADD COLUMN ${column.name} ${column.type}`).run()
        addedColumns++
      }
    }

    // Add index if it doesn't exist (SQLite will ignore if exists)
    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_health_version_drift
      ON health_check_results(version_drift, checked_at)
    `).run()

    if (addedColumns > 0) {
      logger.info('Migration completed', { migration: migrationName, columnsAdded: addedColumns })
    } else {
      logger.info('Migration already applied', { migration: migrationName })
    }
  } catch (error) {
    logger.error('Failed to apply migration', error as Error, { migration: migrationName })
    throw error
  }
}

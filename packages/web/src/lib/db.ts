/**
 * SQLite database client for AgentSync
 * Provides persistent storage for deployments, approvals, and audit logs
 */

import Database from 'better-sqlite3'
import { mkdirSync, existsSync } from 'fs'
import { dirname } from 'path'
import { getDatabasePath, logDatabaseConfig } from '@agentsync/core'
import { runMigrations } from './migrations/runner'

// Database file location (shared with worker via core package)
const DB_PATH = getDatabasePath()

// Singleton database instance
let db: Database.Database | null = null
let dbLoggedOnce = false

/**
 * Get or create the database instance
 */
export function getDatabase(): Database.Database {
  if (!db) {
    // Log database configuration on first access
    if (!dbLoggedOnce) {
      console.log('[Web] Initializing database connection')
      logDatabaseConfig()
      dbLoggedOnce = true
    }

    // Ensure data directory exists
    const dbDir = dirname(DB_PATH)
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true })
    }

    // Create database with WAL mode for better concurrency
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')

    // Run migrations to ensure schema is up to date
    initializeSchema(db)
  }

  return db
}

/**
 * Initialize database schema using migrations
 */
function initializeSchema(database: Database.Database): void {
  try {
    // Use migration system to apply schema
    runMigrations(database)
  } catch (error) {
    console.error('Failed to initialize database schema:', error)
    throw error
  }
}

/**
 * Close the database connection (for graceful shutdown)
 */
export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

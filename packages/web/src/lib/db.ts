/**
 * SQLite database client for AgentSync
 * Provides persistent storage for deployments, approvals, and audit logs
 */

import Database from 'better-sqlite3'
import { readFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'

// Database file location
const DB_PATH = process.env.DATABASE_PATH || './data/agentsync.db'

// Singleton database instance
let db: Database.Database | null = null

/**
 * Get or create the database instance
 */
export function getDatabase(): Database.Database {
  if (!db) {
    // Ensure data directory exists
    const dbDir = dirname(DB_PATH)
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true })
    }

    // Create database with WAL mode for better concurrency
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')

    // Initialize schema
    initializeSchema(db)
  }

  return db
}

/**
 * Initialize database schema from SQL file
 */
function initializeSchema(database: Database.Database): void {
  try {
    // Try to load schema from file
    const schemaPath = join(dirname(__filename), 'db-schema.sql')
    if (existsSync(schemaPath)) {
      const schema = readFileSync(schemaPath, 'utf-8')
      database.exec(schema)
    } else {
      // Fallback: create schema inline if file not found (e.g., in production build)
      database.exec(INLINE_SCHEMA)
    }
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

// Inline schema as fallback
const INLINE_SCHEMA = `
-- Deployment batches
CREATE TABLE IF NOT EXISTS deployment_batches (
  id TEXT PRIMARY KEY,
  solution_name TEXT NOT NULL,
  solution_version TEXT,
  solution_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  total_deployments INTEGER NOT NULL DEFAULT 0,
  completed_deployments INTEGER NOT NULL DEFAULT 0,
  failed_deployments INTEGER NOT NULL DEFAULT 0,
  triggered_by TEXT DEFAULT 'manual',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  current_wave INTEGER,
  total_waves INTEGER
);

CREATE INDEX IF NOT EXISTS idx_batches_status ON deployment_batches(status);
CREATE INDEX IF NOT EXISTS idx_batches_created ON deployment_batches(created_at);

-- Individual tenant deployments
CREATE TABLE IF NOT EXISTS deployments (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  solution_name TEXT NOT NULL,
  solution_version TEXT,
  solution_path TEXT,
  tenant_id TEXT NOT NULL,
  tenant_name TEXT NOT NULL,
  environment_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  wave_number INTEGER,
  previous_version TEXT,
  rollback_available INTEGER DEFAULT 0,
  solution_import_job_id TEXT,
  url_override TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (batch_id) REFERENCES deployment_batches(id)
);

CREATE INDEX IF NOT EXISTS idx_deployments_batch ON deployments(batch_id);
CREATE INDEX IF NOT EXISTS idx_deployments_tenant ON deployments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status);

-- Approval requests
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  deployment_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  required_approvals INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (deployment_id) REFERENCES deployment_batches(id)
);

CREATE INDEX IF NOT EXISTS idx_approvals_deployment ON approvals(deployment_id);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);

-- Individual approval votes
CREATE TABLE IF NOT EXISTS approval_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  approval_id TEXT NOT NULL,
  approver TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT,
  timestamp TEXT NOT NULL,
  FOREIGN KEY (approval_id) REFERENCES approvals(id)
);

CREATE INDEX IF NOT EXISTS idx_votes_approval ON approval_votes(approval_id);

-- Rollback snapshots
CREATE TABLE IF NOT EXISTS rollback_snapshots (
  id TEXT PRIMARY KEY,
  deployment_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  tenant_name TEXT NOT NULL,
  solution_name TEXT NOT NULL,
  previous_version TEXT,
  snapshot_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT,
  metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_snapshots_deployment ON rollback_snapshots(deployment_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_tenant ON rollback_snapshots(tenant_id);

-- Audit log
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  action TEXT NOT NULL,
  user_id TEXT,
  user_email TEXT,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  resource_name TEXT,
  details TEXT,
  success INTEGER NOT NULL DEFAULT 1,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_logs(resource_type, resource_id);

-- Health check results
CREATE TABLE IF NOT EXISTS health_check_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  tenant_name TEXT NOT NULL,
  healthy INTEGER NOT NULL,
  checks TEXT NOT NULL,
  total_duration_ms INTEGER,
  checked_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_health_tenant ON health_check_results(tenant_id);
CREATE INDEX IF NOT EXISTS idx_health_checked ON health_check_results(checked_at);
`

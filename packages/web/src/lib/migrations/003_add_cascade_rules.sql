-- Add CASCADE rules to foreign keys
-- Ensures referential integrity and automatic cleanup of orphaned records
-- Note: SQLite requires recreating tables to modify foreign keys

-- 1. Recreate deployments table with CASCADE
CREATE TABLE deployments_new (
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
  FOREIGN KEY (batch_id) REFERENCES deployment_batches(id) ON DELETE CASCADE
);

-- Copy data
INSERT INTO deployments_new SELECT * FROM deployments;

-- Drop old table and rename
DROP TABLE deployments;
ALTER TABLE deployments_new RENAME TO deployments;

-- Recreate indexes
CREATE INDEX idx_deployments_batch ON deployments(batch_id);
CREATE INDEX idx_deployments_tenant ON deployments(tenant_id);
CREATE INDEX idx_deployments_status ON deployments(status);
CREATE INDEX idx_deployments_batch_status ON deployments(batch_id, status);
CREATE INDEX idx_deployments_tenant_status ON deployments(tenant_id, status);
CREATE INDEX idx_deployments_created ON deployments(created_at DESC);

-- 2. Recreate approvals table with CASCADE
CREATE TABLE approvals_new (
  id TEXT PRIMARY KEY,
  deployment_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  required_approvals INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (deployment_id) REFERENCES deployment_batches(id) ON DELETE CASCADE
);

-- Copy data
INSERT INTO approvals_new SELECT * FROM approvals;

-- Drop old table and rename
DROP TABLE approvals;
ALTER TABLE approvals_new RENAME TO approvals;

-- Recreate indexes
CREATE INDEX idx_approvals_deployment ON approvals(deployment_id);
CREATE INDEX idx_approvals_status ON approvals(status);
CREATE INDEX idx_approvals_status_expires ON approvals(status, expires_at);
CREATE INDEX idx_approvals_created ON approvals(created_at DESC);

-- 3. Recreate approval_votes table with CASCADE
CREATE TABLE approval_votes_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  approval_id TEXT NOT NULL,
  approver TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT,
  timestamp TEXT NOT NULL,
  FOREIGN KEY (approval_id) REFERENCES approvals(id) ON DELETE CASCADE
);

-- Copy data
INSERT INTO approval_votes_new SELECT * FROM approval_votes;

-- Drop old table and rename
DROP TABLE approval_votes;
ALTER TABLE approval_votes_new RENAME TO approval_votes;

-- Recreate indexes
CREATE INDEX idx_votes_approval ON approval_votes(approval_id);

-- 4. Recreate webhook_invocations with SET NULL (preserve invocation history)
CREATE TABLE webhook_invocations_new (
  id TEXT PRIMARY KEY,
  webhook_id TEXT,
  payload TEXT NOT NULL,
  signature TEXT,
  status TEXT NOT NULL,
  batch_id TEXT,
  error_message TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  processed_at TEXT,
  FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE SET NULL,
  FOREIGN KEY (batch_id) REFERENCES deployment_batches(id) ON DELETE SET NULL
);

-- Copy data
INSERT INTO webhook_invocations_new SELECT * FROM webhook_invocations;

-- Drop old table and rename
DROP TABLE webhook_invocations;
ALTER TABLE webhook_invocations_new RENAME TO webhook_invocations;

-- Recreate indexes
CREATE INDEX idx_invocations_webhook ON webhook_invocations(webhook_id);
CREATE INDEX idx_invocations_status ON webhook_invocations(status);
CREATE INDEX idx_invocations_created ON webhook_invocations(created_at);
CREATE INDEX idx_invocations_batch ON webhook_invocations(batch_id);
CREATE INDEX idx_invocations_webhook_created ON webhook_invocations(webhook_id, created_at DESC);
CREATE INDEX idx_invocations_status_created ON webhook_invocations(status, created_at);

-- DOWN

-- Note: Rolling back this migration is complex as it requires recreating tables again
-- This rollback removes CASCADE rules and restores original behavior

-- 1. Restore deployments without CASCADE
CREATE TABLE deployments_old (
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

INSERT INTO deployments_old SELECT * FROM deployments;
DROP TABLE deployments;
ALTER TABLE deployments_old RENAME TO deployments;
CREATE INDEX idx_deployments_batch ON deployments(batch_id);
CREATE INDEX idx_deployments_tenant ON deployments(tenant_id);
CREATE INDEX idx_deployments_status ON deployments(status);

-- 2. Restore approvals without CASCADE
CREATE TABLE approvals_old (
  id TEXT PRIMARY KEY,
  deployment_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  required_approvals INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (deployment_id) REFERENCES deployment_batches(id)
);

INSERT INTO approvals_old SELECT * FROM approvals;
DROP TABLE approvals;
ALTER TABLE approvals_old RENAME TO approvals;
CREATE INDEX idx_approvals_deployment ON approvals(deployment_id);
CREATE INDEX idx_approvals_status ON approvals(status);

-- 3. Restore approval_votes without CASCADE
CREATE TABLE approval_votes_old (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  approval_id TEXT NOT NULL,
  approver TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT,
  timestamp TEXT NOT NULL,
  FOREIGN KEY (approval_id) REFERENCES approvals(id)
);

INSERT INTO approval_votes_old SELECT * FROM approval_votes;
DROP TABLE approval_votes;
ALTER TABLE approval_votes_old RENAME TO approval_votes;
CREATE INDEX idx_votes_approval ON approval_votes(approval_id);

-- 4. Restore webhook_invocations without SET NULL
CREATE TABLE webhook_invocations_old (
  id TEXT PRIMARY KEY,
  webhook_id TEXT,
  payload TEXT NOT NULL,
  signature TEXT,
  status TEXT NOT NULL,
  batch_id TEXT,
  error_message TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  processed_at TEXT,
  FOREIGN KEY (webhook_id) REFERENCES webhooks(id),
  FOREIGN KEY (batch_id) REFERENCES deployment_batches(id)
);

INSERT INTO webhook_invocations_old SELECT * FROM webhook_invocations;
DROP TABLE webhook_invocations;
ALTER TABLE webhook_invocations_old RENAME TO webhook_invocations;
CREATE INDEX idx_invocations_webhook ON webhook_invocations(webhook_id);
CREATE INDEX idx_invocations_status ON webhook_invocations(status);
CREATE INDEX idx_invocations_created ON webhook_invocations(created_at);

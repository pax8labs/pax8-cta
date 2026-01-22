-- AgentSync SQLite Schema
-- Stores deployment history, approvals, and audit logs

-- Deployment batches (groups of tenant deployments)
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

-- User-tenant assignments for tenant-scoped access control
CREATE TABLE IF NOT EXISTS user_tenant_assignments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'operator', 'viewer')),
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  UNIQUE(user_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_user_tenant_user ON user_tenant_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tenant_tenant ON user_tenant_assignments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_tenant_role ON user_tenant_assignments(role);

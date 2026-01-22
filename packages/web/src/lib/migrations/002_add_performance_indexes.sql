-- Add missing indexes for common query patterns
-- Improves performance for dashboard queries, filtering, and reporting

-- Composite index for deployment filtering by batch and status
-- Used by: GET /api/deployments?batch_id=X&status=Y
CREATE INDEX IF NOT EXISTS idx_deployments_batch_status
  ON deployments(batch_id, status);

-- Composite index for deployment filtering by tenant and status
-- Used by: Tenant-specific dashboard, filtering tenant deployment history
CREATE INDEX IF NOT EXISTS idx_deployments_tenant_status
  ON deployments(tenant_id, status);

-- Index for deployment ordering by created_at
-- Used by: Recent deployments list, deployment history
CREATE INDEX IF NOT EXISTS idx_deployments_created
  ON deployments(created_at DESC);

-- Composite index for finding expiring approvals
-- Used by: Approval expiration worker, dashboard alerts
CREATE INDEX IF NOT EXISTS idx_approvals_status_expires
  ON approvals(status, expires_at);

-- Index for approval ordering by created_at
-- Used by: Recent approvals list
CREATE INDEX IF NOT EXISTS idx_approvals_created
  ON approvals(created_at DESC);

-- Composite index for user activity queries
-- Used by: User activity dashboard, audit reports
CREATE INDEX IF NOT EXISTS idx_audit_user_timestamp
  ON audit_logs(user_email, timestamp DESC);

-- Composite index for finding errors in audit log
-- Used by: Error monitoring, troubleshooting
CREATE INDEX IF NOT EXISTS idx_audit_timestamp_success
  ON audit_logs(timestamp DESC, success);

-- Index for audit log filtering by user
-- Used by: User-specific audit trail
CREATE INDEX IF NOT EXISTS idx_audit_user
  ON audit_logs(user_email);

-- Composite index for recent tenant health checks
-- Used by: Tenant health dashboard, monitoring
CREATE INDEX IF NOT EXISTS idx_health_tenant_checked
  ON health_check_results(tenant_id, checked_at DESC);

-- Index for finding recent health check failures
-- Used by: Health monitoring, alerts
CREATE INDEX IF NOT EXISTS idx_health_healthy
  ON health_check_results(healthy, checked_at DESC);

-- Index for webhook invocations by batch
-- Used by: Tracking webhook-triggered deployments
CREATE INDEX IF NOT EXISTS idx_invocations_batch
  ON webhook_invocations(batch_id);

-- Composite index for webhook invocation history
-- Used by: Webhook debugging, recent invocations
CREATE INDEX IF NOT EXISTS idx_invocations_webhook_created
  ON webhook_invocations(webhook_id, created_at DESC);

-- Index for finding unprocessed webhook invocations
-- Used by: Webhook processing queue
CREATE INDEX IF NOT EXISTS idx_invocations_status_created
  ON webhook_invocations(status, created_at);

-- Index for deployment batch ordering
-- Used by: Recent deployments dashboard
CREATE INDEX IF NOT EXISTS idx_batches_updated
  ON deployment_batches(updated_at DESC);

-- Composite index for active deployment batches
-- Used by: Finding in-progress deployments
CREATE INDEX IF NOT EXISTS idx_batches_status_created
  ON deployment_batches(status, created_at DESC);

-- DOWN

-- Drop all added indexes
DROP INDEX IF EXISTS idx_deployments_batch_status;
DROP INDEX IF EXISTS idx_deployments_tenant_status;
DROP INDEX IF EXISTS idx_deployments_created;
DROP INDEX IF EXISTS idx_approvals_status_expires;
DROP INDEX IF EXISTS idx_approvals_created;
DROP INDEX IF EXISTS idx_audit_user_timestamp;
DROP INDEX IF EXISTS idx_audit_timestamp_success;
DROP INDEX IF EXISTS idx_audit_user;
DROP INDEX IF EXISTS idx_health_tenant_checked;
DROP INDEX IF EXISTS idx_health_healthy;
DROP INDEX IF EXISTS idx_invocations_batch;
DROP INDEX IF EXISTS idx_invocations_webhook_created;
DROP INDEX IF EXISTS idx_invocations_status_created;
DROP INDEX IF EXISTS idx_batches_updated;
DROP INDEX IF EXISTS idx_batches_status_created;

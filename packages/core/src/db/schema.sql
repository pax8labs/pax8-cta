-- Copilot Studio Deployer Database Schema
-- PostgreSQL 14+

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Deployments table
CREATE TABLE IF NOT EXISTS deployments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    solution_name VARCHAR(200) NOT NULL,
    solution_version VARCHAR(50),
    solution_path TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    total_tenants INTEGER NOT NULL DEFAULT 0,
    completed_tenants INTEGER NOT NULL DEFAULT 0,
    failed_tenants INTEGER NOT NULL DEFAULT 0,
    created_by VARCHAR(200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    options JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_deployments_status ON deployments(status);
CREATE INDEX idx_deployments_created_at ON deployments(created_at DESC);
CREATE INDEX idx_deployments_created_by ON deployments(created_by);

-- Tenant deployments table (individual tenant results)
CREATE TABLE IF NOT EXISTS tenant_deployments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deployment_id UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    tenant_name VARCHAR(200) NOT NULL,
    environment_url TEXT NOT NULL,
    wave_number INTEGER DEFAULT 1,
    wave_name VARCHAR(100),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    attempt_number INTEGER NOT NULL DEFAULT 1,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,
    error_message TEXT,
    error_code VARCHAR(100),
    import_job_id VARCHAR(100),
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_tenant_deployments_deployment ON tenant_deployments(deployment_id);
CREATE INDEX idx_tenant_deployments_tenant ON tenant_deployments(tenant_id);
CREATE INDEX idx_tenant_deployments_status ON tenant_deployments(status);

-- Rollback snapshots table
CREATE TABLE IF NOT EXISTS rollback_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    tenant_name VARCHAR(200) NOT NULL,
    solution_name VARCHAR(200) NOT NULL,
    solution_version VARCHAR(50) NOT NULL,
    snapshot_path TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(200),
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_rollback_snapshots_tenant ON rollback_snapshots(tenant_id);
CREATE INDEX idx_rollback_snapshots_solution ON rollback_snapshots(solution_name);
CREATE INDEX idx_rollback_snapshots_created ON rollback_snapshots(created_at DESC);

-- Audit log table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    action VARCHAR(100) NOT NULL,
    user_id VARCHAR(200) NOT NULL,
    user_email VARCHAR(200),
    user_roles TEXT[],
    resource_type VARCHAR(100) NOT NULL,
    resource_id VARCHAR(200),
    resource_name VARCHAR(200),
    details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    success BOOLEAN NOT NULL DEFAULT TRUE,
    error_message TEXT
);

CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

-- Scheduled deployments table
CREATE TABLE IF NOT EXISTS scheduled_deployments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    solution_name VARCHAR(200) NOT NULL,
    cron_expression VARCHAR(100),
    timezone VARCHAR(50) DEFAULT 'UTC',
    tenant_filter JSONB DEFAULT '{}',
    options JSONB DEFAULT '{}',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    created_by VARCHAR(200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scheduled_deployments_next_run ON scheduled_deployments(next_run_at) WHERE enabled = TRUE;

-- Approval workflows table
CREATE TABLE IF NOT EXISTS approval_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deployment_id UUID REFERENCES deployments(id) ON DELETE CASCADE,
    scheduled_deployment_id UUID REFERENCES scheduled_deployments(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    requested_by VARCHAR(200) NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_by VARCHAR(200),
    approved_at TIMESTAMPTZ,
    rejected_by VARCHAR(200),
    rejected_at TIMESTAMPTZ,
    rejection_reason TEXT,
    expires_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_approval_requests_status ON approval_requests(status);
CREATE INDEX idx_approval_requests_expires ON approval_requests(expires_at) WHERE status = 'pending';

-- Webhook deliveries table (for tracking webhook delivery attempts)
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    webhook_url TEXT NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMPTZ,
    last_error TEXT,
    next_retry_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX idx_webhook_deliveries_next_retry ON webhook_deliveries(next_retry_at) WHERE status = 'pending';

-- Health check results table
CREATE TABLE IF NOT EXISTS health_check_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    tenant_name VARCHAR(200) NOT NULL,
    check_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL,
    details JSONB DEFAULT '{}',
    duration_ms INTEGER,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_health_check_results_tenant ON health_check_results(tenant_id);
CREATE INDEX idx_health_check_results_checked ON health_check_results(checked_at DESC);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for scheduled_deployments
CREATE TRIGGER update_scheduled_deployments_updated_at
    BEFORE UPDATE ON scheduled_deployments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Views for common queries
CREATE OR REPLACE VIEW v_deployment_summary AS
SELECT
    d.id,
    d.solution_name,
    d.solution_version,
    d.status,
    d.total_tenants,
    d.completed_tenants,
    d.failed_tenants,
    d.created_by,
    d.created_at,
    d.started_at,
    d.completed_at,
    EXTRACT(EPOCH FROM (COALESCE(d.completed_at, NOW()) - d.started_at))::INTEGER AS duration_seconds,
    CASE
        WHEN d.total_tenants > 0
        THEN ROUND((d.completed_tenants::DECIMAL / d.total_tenants) * 100, 1)
        ELSE 0
    END AS completion_percentage
FROM deployments d
ORDER BY d.created_at DESC;

CREATE OR REPLACE VIEW v_recent_audit_activity AS
SELECT
    al.timestamp,
    al.action,
    al.user_email,
    al.resource_type,
    al.resource_name,
    al.success
FROM audit_logs al
WHERE al.timestamp > NOW() - INTERVAL '7 days'
ORDER BY al.timestamp DESC
LIMIT 100;

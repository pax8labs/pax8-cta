/**
 * Repository for deployment operations
 * Handles both batches and individual tenant deployments
 */

import { getDatabase } from '../db'
import type { Deployment, DeploymentBatch, DeploymentStatus } from '@agentsync/core'
import { getDeploymentNotifications } from '@agentsync/core'

export interface DbDeploymentBatch {
  id: string
  solution_name: string
  solution_version: string | null
  solution_path: string | null
  status: string
  total_deployments: number
  completed_deployments: number
  failed_deployments: number
  triggered_by: string
  created_at: string
  updated_at: string
  started_at: string | null
  completed_at: string | null
  current_wave: number | null
  total_waves: number | null
}

export interface DbDeployment {
  id: string
  batch_id: string
  solution_name: string
  solution_version: string | null
  solution_path: string | null
  tenant_id: string
  tenant_name: string
  environment_url: string
  status: string
  error: string | null
  attempt_number: number
  wave_number: number | null
  previous_version: string | null
  rollback_available: number
  solution_import_job_id: string | null
  url_override: string | null
  created_at: string
  updated_at: string
  started_at: string | null
  completed_at: string | null
}

/**
 * Create a new deployment batch
 */
export function createBatch(batch: DeploymentBatch): void {
  const db = getDatabase()
  const stmt = db.prepare(`
    INSERT INTO deployment_batches (
      id, solution_name, solution_version, solution_path, status,
      total_deployments, completed_deployments, failed_deployments,
      triggered_by, created_at, updated_at, started_at, completed_at,
      current_wave, total_waves
    ) VALUES (
      @id, @solution_name, @solution_version, @solution_path, @status,
      @total_deployments, @completed_deployments, @failed_deployments,
      @triggered_by, @created_at, @updated_at, @started_at, @completed_at,
      @current_wave, @total_waves
    )
  `)

  stmt.run({
    id: batch.id,
    solution_name: batch.solutionName,
    solution_version: batch.solutionVersion || null,
    solution_path: batch.solutionPath || null,
    status: batch.status,
    total_deployments: batch.totalDeployments,
    completed_deployments: batch.completedDeployments,
    failed_deployments: batch.failedDeployments,
    triggered_by: batch.triggeredBy || 'manual',
    created_at: batch.createdAt,
    updated_at: batch.updatedAt,
    started_at: batch.startedAt || null,
    completed_at: batch.completedAt || null,
    current_wave: batch.currentWave || null,
    total_waves: batch.totalWaves || null,
  })
}

/**
 * Create a new deployment (individual tenant deployment)
 */
export function createDeployment(deployment: Deployment): void {
  const db = getDatabase()
  const stmt = db.prepare(`
    INSERT INTO deployments (
      id, batch_id, solution_name, solution_version, solution_path,
      tenant_id, tenant_name, environment_url, status, error,
      attempt_number, wave_number, previous_version, rollback_available,
      solution_import_job_id, url_override, created_at, updated_at,
      started_at, completed_at
    ) VALUES (
      @id, @batch_id, @solution_name, @solution_version, @solution_path,
      @tenant_id, @tenant_name, @environment_url, @status, @error,
      @attempt_number, @wave_number, @previous_version, @rollback_available,
      @solution_import_job_id, @url_override, @created_at, @updated_at,
      @started_at, @completed_at
    )
  `)

  stmt.run({
    id: deployment.id,
    batch_id: deployment.batchId,
    solution_name: deployment.solutionName,
    solution_version: deployment.solutionVersion || null,
    solution_path: deployment.solutionPath || null,
    tenant_id: deployment.tenantId,
    tenant_name: deployment.tenantName,
    environment_url: deployment.environmentUrl,
    status: deployment.status,
    error: deployment.error || null,
    attempt_number: deployment.attemptNumber,
    wave_number: deployment.waveNumber || null,
    previous_version: deployment.previousVersion || null,
    rollback_available: deployment.rollbackAvailable ? 1 : 0,
    solution_import_job_id: deployment.solutionImportJobId || null,
    url_override: deployment.urlOverride ? JSON.stringify(deployment.urlOverride) : null,
    created_at: deployment.createdAt,
    updated_at: deployment.updatedAt,
    started_at: deployment.startedAt || null,
    completed_at: deployment.completedAt || null,
  })
}

/**
 * Get a batch by ID
 */
export function getBatch(id: string): DeploymentBatch | null {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM deployment_batches WHERE id = ?').get(id) as DbDeploymentBatch | undefined

  if (!row) return null

  return mapRowToBatch(row)
}

/**
 * Get a deployment by ID
 */
export function getDeployment(id: string): Deployment | null {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM deployments WHERE id = ?').get(id) as DbDeployment | undefined

  if (!row) return null

  return mapRowToDeployment(row)
}

/**
 * Get all deployments for a batch
 */
export function getDeploymentsByBatch(batchId: string): Deployment[] {
  const db = getDatabase()
  const rows = db.prepare('SELECT * FROM deployments WHERE batch_id = ? ORDER BY created_at').all(batchId) as DbDeployment[]

  return rows.map(mapRowToDeployment)
}

/**
 * Get all deployments for a tenant
 */
export function getDeploymentsByTenant(tenantId: string): Deployment[] {
  const db = getDatabase()
  const rows = db.prepare('SELECT * FROM deployments WHERE tenant_id = ? ORDER BY created_at DESC').all(tenantId) as DbDeployment[]

  return rows.map(mapRowToDeployment)
}

/**
 * List batches with pagination
 */
export function listBatches(options: { limit?: number; offset?: number; status?: string } = {}): DeploymentBatch[] {
  const db = getDatabase()
  const { limit = 20, offset = 0, status } = options

  let query = 'SELECT * FROM deployment_batches'
  const params: (string | number)[] = []

  if (status) {
    query += ' WHERE status = ?'
    params.push(status)
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
  params.push(limit, offset)

  const rows = db.prepare(query).all(...params) as DbDeploymentBatch[]

  return rows.map(mapRowToBatch)
}

/**
 * Update batch status
 */
export function updateBatchStatus(
  id: string,
  status: DeploymentStatus,
  counts?: { completed?: number; failed?: number }
): void {
  const db = getDatabase()
  const now = new Date().toISOString()

  // Get the batch before updating to check for status change
  const batch = getBatch(id)

  let query = 'UPDATE deployment_batches SET status = ?, updated_at = ?'
  const params: (string | number)[] = [status, now]

  if (counts?.completed !== undefined) {
    query += ', completed_deployments = ?'
    params.push(counts.completed)
  }

  if (counts?.failed !== undefined) {
    query += ', failed_deployments = ?'
    params.push(counts.failed)
  }

  if (status === 'in_progress' || status === 'rolling_back') {
    query += ', started_at = COALESCE(started_at, ?)'
    params.push(now)
  }

  if (status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'rolled_back') {
    query += ', completed_at = ?'
    params.push(now)
  }

  query += ' WHERE id = ?'
  params.push(id)

  db.prepare(query).run(...params)

  // Send notifications for status changes (async, fire and forget)
  if (batch && batch.status !== status) {
    const notificationService = getDeploymentNotifications()
    const durationMs = batch.startedAt ? Date.now() - new Date(batch.startedAt).getTime() : 0

    if (status === 'completed') {
      notificationService.notifyDeploymentComplete(
        id,
        batch.solutionName,
        counts?.completed || batch.completedDeployments,
        batch.totalDeployments,
        durationMs
      ).catch(() => {
        // Ignore notification errors
      })
    } else if (status === 'failed') {
      const failedCount = counts?.failed || batch.failedDeployments
      const deployments = getDeploymentsByBatch(id)
      const firstError = deployments.find(d => d.error)?.error

      notificationService.notifyDeploymentFailure(
        id,
        batch.solutionName,
        failedCount,
        batch.totalDeployments,
        firstError
      ).catch(() => {
        // Ignore notification errors
      })
    }
  }
}

/**
 * Update deployment status
 */
export function updateDeploymentStatus(
  id: string,
  status: DeploymentStatus,
  error?: string
): void {
  const db = getDatabase()
  const now = new Date().toISOString()

  let query = 'UPDATE deployments SET status = ?, updated_at = ?'
  const params: (string | number | null)[] = [status, now]

  if (error !== undefined) {
    query += ', error = ?'
    params.push(error)
  }

  if (status === 'in_progress') {
    query += ', started_at = COALESCE(started_at, ?)'
    params.push(now)
  }

  if (status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'rolled_back') {
    query += ', completed_at = ?'
    params.push(now)
  }

  query += ' WHERE id = ?'
  params.push(id)

  db.prepare(query).run(...params)
}

/**
 * Get batch statistics
 */
export function getBatchStats(): {
  total: number
  pending: number
  inProgress: number
  completed: number
  failed: number
  awaitingApproval: number
} {
  const db = getDatabase()
  const row = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status = 'awaiting_approval' THEN 1 ELSE 0 END) as awaiting_approval
    FROM deployment_batches
  `).get() as {
    total: number
    pending: number
    in_progress: number
    completed: number
    failed: number
    awaiting_approval: number
  }

  return {
    total: row.total || 0,
    pending: row.pending || 0,
    inProgress: row.in_progress || 0,
    completed: row.completed || 0,
    failed: row.failed || 0,
    awaitingApproval: row.awaiting_approval || 0,
  }
}

/**
 * Get batches completed today
 */
export function getCompletedToday(): number {
  const db = getDatabase()
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

  const row = db.prepare(`
    SELECT COUNT(*) as count
    FROM deployment_batches
    WHERE status = 'completed'
    AND completed_at >= ?
  `).get(today + 'T00:00:00.000Z') as { count: number }

  return row.count || 0
}

// Helper functions

function mapRowToBatch(row: DbDeploymentBatch): DeploymentBatch {
  return {
    id: row.id,
    solutionName: row.solution_name,
    solutionVersion: row.solution_version || undefined,
    solutionPath: row.solution_path || '', // Required field, default to empty string
    status: row.status as DeploymentStatus,
    totalDeployments: row.total_deployments,
    completedDeployments: row.completed_deployments,
    failedDeployments: row.failed_deployments,
    triggeredBy: row.triggered_by as 'manual' | 'scheduled' | 'webhook' | 'api' | 'cli',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at || undefined,
    completedAt: row.completed_at || undefined,
    currentWave: row.current_wave || undefined,
    totalWaves: row.total_waves || undefined,
  }
}

function mapRowToDeployment(row: DbDeployment): Deployment {
  return {
    id: row.id,
    batchId: row.batch_id,
    solutionName: row.solution_name,
    solutionVersion: row.solution_version || undefined,
    solutionPath: row.solution_path || undefined,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    environmentUrl: row.environment_url,
    status: row.status as DeploymentStatus,
    error: row.error || undefined,
    attemptNumber: row.attempt_number,
    waveNumber: row.wave_number || undefined,
    previousVersion: row.previous_version || undefined,
    rollbackAvailable: row.rollback_available === 1,
    solutionImportJobId: row.solution_import_job_id || undefined,
    urlOverride: row.url_override ? JSON.parse(row.url_override) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at || undefined,
    completedAt: row.completed_at || undefined,
    triggeredBy: 'manual', // Not stored separately per deployment
  }
}

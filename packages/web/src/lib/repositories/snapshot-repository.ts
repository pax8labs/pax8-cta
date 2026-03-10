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
 * Repository for rollback snapshot operations
 * Tracks solution snapshots created before deployments for rollback capability
 */

import { getDatabase } from "../db";

export interface DbSnapshot {
  id: string;
  deployment_id: string;
  tenant_id: string;
  tenant_name: string;
  solution_name: string;
  previous_version: string | null;
  snapshot_path: string;
  created_at: string;
  expires_at: string | null;
  metadata: string | null;
}

export interface Snapshot {
  id: string;
  deploymentId: string;
  tenantId: string;
  tenantName: string;
  solutionName: string;
  previousVersion?: string;
  snapshotPath: string;
  createdAt: string;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Create a new snapshot record
 */
export function createSnapshot(snapshot: Snapshot): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO rollback_snapshots (
      id, deployment_id, tenant_id, tenant_name, solution_name,
      previous_version, snapshot_path, created_at, expires_at, metadata
    ) VALUES (
      @id, @deployment_id, @tenant_id, @tenant_name, @solution_name,
      @previous_version, @snapshot_path, @created_at, @expires_at, @metadata
    )
  `);

  stmt.run({
    id: snapshot.id,
    deployment_id: snapshot.deploymentId,
    tenant_id: snapshot.tenantId,
    tenant_name: snapshot.tenantName,
    solution_name: snapshot.solutionName,
    previous_version: snapshot.previousVersion || null,
    snapshot_path: snapshot.snapshotPath,
    created_at: snapshot.createdAt,
    expires_at: snapshot.expiresAt || null,
    metadata: snapshot.metadata ? JSON.stringify(snapshot.metadata) : null,
  });
}

/**
 * Get a snapshot by ID
 */
export function getSnapshot(id: string): Snapshot | null {
  const db = getDatabase();
  const row = db.prepare("SELECT * FROM rollback_snapshots WHERE id = ?").get(id) as
    | DbSnapshot
    | undefined;

  if (!row) return null;

  return mapRowToSnapshot(row);
}

/**
 * Get all snapshots for a deployment
 */
export function getSnapshotsByDeployment(deploymentId: string): Snapshot[] {
  const db = getDatabase();
  const rows = db
    .prepare("SELECT * FROM rollback_snapshots WHERE deployment_id = ? ORDER BY created_at DESC")
    .all(deploymentId) as DbSnapshot[];

  return rows.map(mapRowToSnapshot);
}

/**
 * Get all snapshots for a tenant
 */
export function getSnapshotsByTenant(tenantId: string): Snapshot[] {
  const db = getDatabase();
  const rows = db
    .prepare("SELECT * FROM rollback_snapshots WHERE tenant_id = ? ORDER BY created_at DESC")
    .all(tenantId) as DbSnapshot[];

  return rows.map(mapRowToSnapshot);
}

/**
 * Get the most recent snapshot for a tenant and solution
 */
export function getLatestSnapshot(tenantId: string, solutionName: string): Snapshot | null {
  const db = getDatabase();
  const row = db
    .prepare(
      `
    SELECT * FROM rollback_snapshots
    WHERE tenant_id = ? AND solution_name = ?
    ORDER BY created_at DESC
    LIMIT 1
  `
    )
    .get(tenantId, solutionName) as DbSnapshot | undefined;

  if (!row) return null;

  return mapRowToSnapshot(row);
}

/**
 * Delete a snapshot
 */
export function deleteSnapshot(id: string): boolean {
  const db = getDatabase();
  const result = db.prepare("DELETE FROM rollback_snapshots WHERE id = ?").run(id);
  return result.changes > 0;
}

/**
 * Delete expired snapshots
 */
export function deleteExpiredSnapshots(): number {
  const db = getDatabase();
  const now = new Date().toISOString();
  const result = db
    .prepare("DELETE FROM rollback_snapshots WHERE expires_at IS NOT NULL AND expires_at < ?")
    .run(now);
  return result.changes;
}

/**
 * Count snapshots for a tenant/solution (for cleanup)
 */
export function countSnapshotsForTenantSolution(tenantId: string, solutionName: string): number {
  const db = getDatabase();
  const row = db
    .prepare(
      `
    SELECT COUNT(*) as count FROM rollback_snapshots
    WHERE tenant_id = ? AND solution_name = ?
  `
    )
    .get(tenantId, solutionName) as { count: number };
  return row.count;
}

/**
 * Delete old snapshots beyond a limit
 */
export function deleteOldSnapshots(
  tenantId: string,
  solutionName: string,
  keepCount: number
): number {
  const db = getDatabase();

  // Get IDs of snapshots to keep (most recent ones)
  const keepIds = db
    .prepare(
      `
    SELECT id FROM rollback_snapshots
    WHERE tenant_id = ? AND solution_name = ?
    ORDER BY created_at DESC
    LIMIT ?
  `
    )
    .all(tenantId, solutionName, keepCount) as { id: string }[];

  if (keepIds.length === 0) return 0;

  // Delete all except the ones we want to keep
  const keepIdList = keepIds.map((r) => r.id);
  const placeholders = keepIdList.map(() => "?").join(",");

  const result = db
    .prepare(
      `
    DELETE FROM rollback_snapshots
    WHERE tenant_id = ? AND solution_name = ? AND id NOT IN (${placeholders})
  `
    )
    .run(tenantId, solutionName, ...keepIdList);

  return result.changes;
}

// Helper function
function mapRowToSnapshot(row: DbSnapshot): Snapshot {
  return {
    id: row.id,
    deploymentId: row.deployment_id,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    solutionName: row.solution_name,
    previousVersion: row.previous_version || undefined,
    snapshotPath: row.snapshot_path,
    createdAt: row.created_at,
    expiresAt: row.expires_at || undefined,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  };
}

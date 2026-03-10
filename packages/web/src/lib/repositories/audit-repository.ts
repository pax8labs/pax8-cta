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
 * Repository for audit log operations
 */

import { getDatabase } from "../db";

export interface AuditLogEntry {
  id?: number;
  timestamp: string;
  action: string;
  userId?: string;
  userEmail?: string;
  resourceType: string;
  resourceId?: string;
  resourceName?: string;
  details?: Record<string, unknown>;
  success: boolean;
  errorMessage?: string;
}

/**
 * Write an audit log entry
 */
export function writeAuditLog(entry: Omit<AuditLogEntry, "id">): void {
  const db = getDatabase();

  db.prepare(
    `
    INSERT INTO audit_logs (
      timestamp, action, user_id, user_email, resource_type,
      resource_id, resource_name, details, success, error_message
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    entry.timestamp,
    entry.action,
    entry.userId || null,
    entry.userEmail || null,
    entry.resourceType,
    entry.resourceId || null,
    entry.resourceName || null,
    entry.details ? JSON.stringify(entry.details) : null,
    entry.success ? 1 : 0,
    entry.errorMessage || null
  );
}

/**
 * Get recent audit log entries
 */
export function getRecentAuditLogs(
  options: {
    limit?: number;
    action?: string;
    resourceType?: string;
    resourceId?: string;
    userId?: string;
  } = {}
): AuditLogEntry[] {
  const db = getDatabase();
  const { limit = 100, action, resourceType, resourceId, userId } = options;

  // Cap maximum limit to prevent memory issues
  const cappedLimit = Math.min(limit, 1000);

  let query = "SELECT * FROM audit_logs WHERE 1=1";
  const params: (string | number)[] = [];

  if (action) {
    query += " AND action = ?";
    params.push(action);
  }

  if (resourceType) {
    query += " AND resource_type = ?";
    params.push(resourceType);
  }

  if (resourceId) {
    query += " AND resource_id = ?";
    params.push(resourceId);
  }

  if (userId) {
    query += " AND user_id = ?";
    params.push(userId);
  }

  query += " ORDER BY timestamp DESC LIMIT ?";
  params.push(cappedLimit);

  const rows = db.prepare(query).all(...params) as {
    id: number;
    timestamp: string;
    action: string;
    user_id: string | null;
    user_email: string | null;
    resource_type: string;
    resource_id: string | null;
    resource_name: string | null;
    details: string | null;
    success: number;
    error_message: string | null;
  }[];

  return rows.map((row) => ({
    id: row.id,
    timestamp: row.timestamp,
    action: row.action,
    userId: row.user_id || undefined,
    userEmail: row.user_email || undefined,
    resourceType: row.resource_type,
    resourceId: row.resource_id || undefined,
    resourceName: row.resource_name || undefined,
    details: row.details ? JSON.parse(row.details) : undefined,
    success: row.success === 1,
    errorMessage: row.error_message || undefined,
  }));
}

/**
 * Get audit logs for a specific resource
 */
export function getAuditLogsForResource(
  resourceType: string,
  resourceId: string,
  limit = 50
): AuditLogEntry[] {
  return getRecentAuditLogs({ resourceType, resourceId, limit });
}

/**
 * Log a deployment action
 */
export function logDeploymentAction(
  action:
    | "deployment.created"
    | "deployment.started"
    | "deployment.completed"
    | "deployment.failed"
    | "deployment.cancelled"
    | "deployment.rolled_back",
  deploymentId: string,
  deploymentName: string,
  options: {
    userId?: string;
    userEmail?: string;
    details?: Record<string, unknown>;
    success?: boolean;
    errorMessage?: string;
  } = {}
): void {
  writeAuditLog({
    timestamp: new Date().toISOString(),
    action,
    resourceType: "deployment",
    resourceId: deploymentId,
    resourceName: deploymentName,
    userId: options.userId,
    userEmail: options.userEmail,
    details: options.details,
    success: options.success ?? true,
    errorMessage: options.errorMessage,
  });
}

/**
 * Log an approval action
 */
export function logApprovalAction(
  action: "approval.requested" | "approval.approved" | "approval.rejected" | "approval.expired",
  deploymentId: string,
  approver?: string,
  reason?: string
): void {
  writeAuditLog({
    timestamp: new Date().toISOString(),
    action,
    resourceType: "approval",
    resourceId: deploymentId,
    userEmail: approver,
    details: reason ? { reason } : undefined,
    success: true,
  });
}

/**
 * Log a rollback action
 */
export function logRollbackAction(
  action: "rollback.initiated" | "rollback.completed" | "rollback.failed",
  deploymentId: string,
  options: {
    userId?: string;
    userEmail?: string;
    tenantId?: string;
    tenantName?: string;
    error?: string;
  } = {}
): void {
  writeAuditLog({
    timestamp: new Date().toISOString(),
    action,
    resourceType: "rollback",
    resourceId: deploymentId,
    userId: options.userId,
    userEmail: options.userEmail,
    details: {
      tenantId: options.tenantId,
      tenantName: options.tenantName,
    },
    success: action !== "rollback.failed",
    errorMessage: options.error,
  });
}

/**
 * Clean up old audit logs (keep last N days)
 */
export function cleanupOldAuditLogs(daysToKeep = 90): number {
  const db = getDatabase();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  const result = db
    .prepare(
      `
    DELETE FROM audit_logs WHERE timestamp < ?
  `
    )
    .run(cutoffDate.toISOString());

  return result.changes;
}

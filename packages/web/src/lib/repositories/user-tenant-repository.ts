/**
 * Repository for user-tenant assignment operations
 * Manages tenant-scoped access control
 */

import { getDatabase } from '../db'

export interface UserTenantAssignment {
  id: string
  userId: string
  tenantId: string
  role: 'admin' | 'operator' | 'viewer'
  createdAt: string
  createdBy: string
}

/**
 * Check if a user has access to a specific tenant
 */
export function hasUserTenantAccess(userId: string, tenantId: string): boolean {
  const db = getDatabase()

  const result = db.prepare(`
    SELECT COUNT(*) as count
    FROM user_tenant_assignments
    WHERE user_id = ? AND tenant_id = ?
  `).get(userId, tenantId) as { count: number }

  return result.count > 0
}

/**
 * Get all tenant IDs a user has access to
 */
export function getUserTenantIds(userId: string): string[] {
  const db = getDatabase()

  const results = db.prepare(`
    SELECT tenant_id
    FROM user_tenant_assignments
    WHERE user_id = ?
  `).all(userId) as Array<{ tenant_id: string }>

  return results.map(r => r.tenant_id)
}

/**
 * Get all assignments for a user
 */
export function getUserTenantAssignments(userId: string): UserTenantAssignment[] {
  const db = getDatabase()

  const results = db.prepare(`
    SELECT id, user_id as userId, tenant_id as tenantId, role, created_at as createdAt, created_by as createdBy
    FROM user_tenant_assignments
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(userId) as UserTenantAssignment[]

  return results
}

/**
 * Get all users assigned to a tenant
 */
export function getTenantUserAssignments(tenantId: string): UserTenantAssignment[] {
  const db = getDatabase()

  const results = db.prepare(`
    SELECT id, user_id as userId, tenant_id as tenantId, role, created_at as createdAt, created_by as createdBy
    FROM user_tenant_assignments
    WHERE tenant_id = ?
    ORDER BY created_at DESC
  `).all(tenantId) as UserTenantAssignment[]

  return results
}

/**
 * Assign a user to a tenant with a specific role
 */
export function assignUserToTenant(assignment: Omit<UserTenantAssignment, 'id' | 'createdAt'>): UserTenantAssignment {
  const db = getDatabase()

  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()

  db.prepare(`
    INSERT INTO user_tenant_assignments (id, user_id, tenant_id, role, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, tenant_id) DO UPDATE SET
      role = excluded.role,
      created_at = excluded.created_at,
      created_by = excluded.created_by
  `).run(
    id,
    assignment.userId,
    assignment.tenantId,
    assignment.role,
    createdAt,
    assignment.createdBy
  )

  return {
    id,
    ...assignment,
    createdAt
  }
}

/**
 * Remove a user's access to a tenant
 */
export function removeUserTenantAssignment(userId: string, tenantId: string): boolean {
  const db = getDatabase()

  const result = db.prepare(`
    DELETE FROM user_tenant_assignments
    WHERE user_id = ? AND tenant_id = ?
  `).run(userId, tenantId)

  return result.changes > 0
}

/**
 * Remove all assignments for a user
 */
export function removeAllUserAssignments(userId: string): number {
  const db = getDatabase()

  const result = db.prepare(`
    DELETE FROM user_tenant_assignments
    WHERE user_id = ?
  `).run(userId)

  return result.changes
}

/**
 * Remove all assignments for a tenant
 */
export function removeAllTenantAssignments(tenantId: string): number {
  const db = getDatabase()

  const result = db.prepare(`
    DELETE FROM user_tenant_assignments
    WHERE tenant_id = ?
  `).run(tenantId)

  return result.changes
}

/**
 * Get a specific assignment
 */
export function getUserTenantAssignment(userId: string, tenantId: string): UserTenantAssignment | null {
  const db = getDatabase()

  const result = db.prepare(`
    SELECT id, user_id as userId, tenant_id as tenantId, role, created_at as createdAt, created_by as createdBy
    FROM user_tenant_assignments
    WHERE user_id = ? AND tenant_id = ?
  `).get(userId, tenantId) as UserTenantAssignment | undefined

  return result || null
}

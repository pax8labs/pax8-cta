/**
 * Repository for approval workflow operations
 */

import { getDatabase } from '../db'

export interface Approval {
  id: string
  deploymentId: string
  status: 'pending' | 'approved' | 'rejected'
  requiredApprovals: number
  createdAt: string
  expiresAt: string
}

export interface ApprovalVote {
  id: number
  approvalId: string
  approver: string
  action: 'approve' | 'reject'
  reason?: string
  timestamp: string
}

export interface ApprovalWithVotes extends Approval {
  approvals: ApprovalVote[]
  rejections: ApprovalVote[]
}

/**
 * Create a new approval request
 */
export function createApproval(approval: Omit<Approval, 'id'>): Approval {
  const db = getDatabase()
  const id = crypto.randomUUID()

  db.prepare(`
    INSERT INTO approvals (id, deployment_id, status, required_approvals, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id,
    approval.deploymentId,
    approval.status,
    approval.requiredApprovals,
    approval.createdAt,
    approval.expiresAt
  )

  return { id, ...approval }
}

/**
 * Get approval by deployment ID
 */
export function getApprovalByDeployment(deploymentId: string): ApprovalWithVotes | null {
  const db = getDatabase()

  const approval = db.prepare(`
    SELECT * FROM approvals WHERE deployment_id = ?
  `).get(deploymentId) as {
    id: string
    deployment_id: string
    status: string
    required_approvals: number
    created_at: string
    expires_at: string
  } | undefined

  if (!approval) return null

  const votes = db.prepare(`
    SELECT * FROM approval_votes WHERE approval_id = ?
  `).all(approval.id) as {
    id: number
    approval_id: string
    approver: string
    action: string
    reason: string | null
    timestamp: string
  }[]

  return {
    id: approval.id,
    deploymentId: approval.deployment_id,
    status: approval.status as 'pending' | 'approved' | 'rejected',
    requiredApprovals: approval.required_approvals,
    createdAt: approval.created_at,
    expiresAt: approval.expires_at,
    approvals: votes
      .filter(v => v.action === 'approve')
      .map(v => ({
        id: v.id,
        approvalId: v.approval_id,
        approver: v.approver,
        action: 'approve' as const,
        reason: v.reason || undefined,
        timestamp: v.timestamp,
      })),
    rejections: votes
      .filter(v => v.action === 'reject')
      .map(v => ({
        id: v.id,
        approvalId: v.approval_id,
        approver: v.approver,
        action: 'reject' as const,
        reason: v.reason || undefined,
        timestamp: v.timestamp,
      })),
  }
}

/**
 * Add a vote to an approval
 */
export function addVote(
  approvalId: string,
  approver: string,
  action: 'approve' | 'reject',
  reason?: string
): void {
  const db = getDatabase()
  const timestamp = new Date().toISOString()

  db.prepare(`
    INSERT INTO approval_votes (approval_id, approver, action, reason, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `).run(approvalId, approver, action, reason || null, timestamp)
}

/**
 * Update approval status
 */
export function updateApprovalStatus(id: string, status: 'pending' | 'approved' | 'rejected'): void {
  const db = getDatabase()
  db.prepare('UPDATE approvals SET status = ? WHERE id = ?').run(status, id)
}

/**
 * Check if an approver has already voted
 */
export function hasVoted(approvalId: string, approver: string): boolean {
  const db = getDatabase()
  const row = db.prepare(`
    SELECT COUNT(*) as count FROM approval_votes
    WHERE approval_id = ? AND approver = ?
  `).get(approvalId, approver) as { count: number }

  return row.count > 0
}

/**
 * Get all pending approvals
 */
export function getPendingApprovals(options: {
  limit?: number
  offset?: number
} = {}): ApprovalWithVotes[] {
  const db = getDatabase()
  const { limit = 100, offset = 0 } = options

  // Cap maximum limit to prevent memory issues
  const cappedLimit = Math.min(limit, 500)

  const approvals = db.prepare(`
    SELECT * FROM approvals WHERE status = 'pending'
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(cappedLimit, offset) as {
    id: string
    deployment_id: string
    status: string
    required_approvals: number
    created_at: string
    expires_at: string
  }[]

  return approvals.map(approval => {
    const votes = db.prepare(`
      SELECT * FROM approval_votes WHERE approval_id = ?
    `).all(approval.id) as {
      id: number
      approval_id: string
      approver: string
      action: string
      reason: string | null
      timestamp: string
    }[]

    return {
      id: approval.id,
      deploymentId: approval.deployment_id,
      status: approval.status as 'pending' | 'approved' | 'rejected',
      requiredApprovals: approval.required_approvals,
      createdAt: approval.created_at,
      expiresAt: approval.expires_at,
      approvals: votes
        .filter(v => v.action === 'approve')
        .map(v => ({
          id: v.id,
          approvalId: v.approval_id,
          approver: v.approver,
          action: 'approve' as const,
          reason: v.reason || undefined,
          timestamp: v.timestamp,
        })),
      rejections: votes
        .filter(v => v.action === 'reject')
        .map(v => ({
          id: v.id,
          approvalId: v.approval_id,
          approver: v.approver,
          action: 'reject' as const,
          reason: v.reason || undefined,
          timestamp: v.timestamp,
        })),
    }
  })
}

/**
 * Count pending approvals
 */
export function countPendingApprovals(): number {
  const db = getDatabase()
  const row = db.prepare(`
    SELECT COUNT(*) as count FROM approvals WHERE status = 'pending'
  `).get() as { count: number }

  return row.count
}

/**
 * Delete expired approvals (mark as rejected)
 */
export function expireApprovals(): number {
  const db = getDatabase()
  const now = new Date().toISOString()

  const result = db.prepare(`
    UPDATE approvals SET status = 'rejected'
    WHERE status = 'pending' AND expires_at < ?
  `).run(now)

  return result.changes
}

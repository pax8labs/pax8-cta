import { NextRequest, NextResponse } from 'next/server'
import { loadConfig, isDemoMode } from '@agentsync/core'
import { resolve } from 'path'
import * as approvalRepo from '@/lib/repositories/approval-repository'
import { logApprovalAction } from '@/lib/repositories/audit-repository'
import { demoDeployments, demoBatches } from '@/lib/demo-store'
import * as deploymentRepo from '@/lib/repositories/deployment-repository'
import { requireAuth, requireApproverEmail, logAuthFailure } from '@/lib/api-middleware'

export const dynamic = 'force-dynamic'

const CONFIG_PATH = process.env.CONFIG_PATH || './config/tenants.yaml'

/**
 * GET /api/deployments/[id]/approve - Get approval status
 * Requires authentication
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireAuth()
  if (session instanceof NextResponse) {
    logAuthFailure(undefined, `/api/deployments/${params.id}/approve`, 'unauthorized')
    return session
  }
  try {
    const approval = approvalRepo.getApprovalByDeployment(params.id)

    if (!approval) {
      return NextResponse.json({
        requiresApproval: false,
        message: 'No approval required or not found',
      })
    }

    return NextResponse.json({
      requiresApproval: true,
      status: approval.status,
      requiredApprovals: approval.requiredApprovals,
      currentApprovals: approval.approvals.length,
      approvals: approval.approvals.map(a => ({
        approver: a.approver,
        timestamp: a.timestamp,
      })),
      rejections: approval.rejections.map(r => ({
        approver: r.approver,
        reason: r.reason,
        timestamp: r.timestamp,
      })),
      expiresAt: approval.expiresAt,
    })
  } catch (error) {
    console.error('Get approval error:', error)
    return NextResponse.json(
      { error: 'Failed to get approval status' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/deployments/[id]/approve - Approve or reject a deployment
 * Body: { action: 'approve' | 'reject', reason?: string }
 *
 * SECURITY: The approver email is taken from the authenticated session, not from the request body.
 * This prevents users from approving deployments with someone else's email.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Load config first to get approvers list
  // In DEMO_MODE, use demo approvers if config file is missing
  let approvalConfig: { approvers?: string[] } | undefined
  try {
    const config = await loadConfig(resolve(CONFIG_PATH))
    approvalConfig = config.settings?.approval
  } catch (error) {
    if (isDemoMode()) {
      // In DEMO_MODE, allow any authenticated user to approve
      approvalConfig = { approvers: ['demo@agentsync.test'] }
    } else {
      throw error
    }
  }
  const allowedApprovers = approvalConfig?.approvers || []

  // Check if user is an authorized approver
  const session = await requireApproverEmail(allowedApprovers)
  if (session instanceof NextResponse) {
    logAuthFailure(undefined, `/api/deployments/${params.id}/approve`, 'forbidden', {
      action: 'approve_deployment',
      deploymentId: params.id
    })
    return session
  }

  // SECURITY: Use the authenticated user's email, not from request body
  const approver = session.user.email!

  try {
    const body = await request.json()
    const { action, reason } = body

    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'action must be "approve" or "reject"' },
        { status: 400 }
      )
    }

    let approval = approvalRepo.getApprovalByDeployment(params.id)

    // Create new approval record if doesn't exist
    if (!approval) {
      const timeout = approvalConfig?.timeout || '24h'
      const timeoutMs = parseTimeout(timeout)
      const expiresAt = new Date(Date.now() + timeoutMs)

      const newApproval = approvalRepo.createApproval({
        deploymentId: params.id,
        status: 'pending',
        requiredApprovals: approvalConfig?.minApprovals || 1,
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString(),
      })

      approval = {
        ...newApproval,
        approvals: [],
        rejections: [],
      }
    }

    // Check if already decided
    if (approval.status !== 'pending') {
      return NextResponse.json(
        { error: `Deployment already ${approval.status}` },
        { status: 400 }
      )
    }

    // Check expiration
    if (new Date() > new Date(approval.expiresAt)) {
      approvalRepo.updateApprovalStatus(approval.id, 'rejected')
      logApprovalAction('approval.expired', params.id)
      return NextResponse.json(
        { error: 'Approval request has expired' },
        { status: 400 }
      )
    }

    // Check if this approver already voted
    if (approvalRepo.hasVoted(approval.id, approver)) {
      return NextResponse.json(
        { error: `${approver} has already voted on this deployment` },
        { status: 400 }
      )
    }

    // Add the vote
    approvalRepo.addVote(approval.id, approver, action, reason)

    // Get updated approval state
    const updatedApproval = approvalRepo.getApprovalByDeployment(params.id)!

    let newStatus: 'pending' | 'approved' | 'rejected' = 'pending'

    if (action === 'approve') {
      // Check if we have enough approvals
      if (updatedApproval.approvals.length >= updatedApproval.requiredApprovals) {
        newStatus = 'approved'
      }
    } else {
      // Single rejection rejects the deployment
      newStatus = 'rejected'
    }

    // Update approval status
    if (newStatus !== 'pending') {
      approvalRepo.updateApprovalStatus(approval.id, newStatus)

      // Update deployment status
      const deploymentStatus = newStatus === 'approved' ? 'in_progress' : 'rejected'

      // Update in database
      try {
        deploymentRepo.updateBatchStatus(params.id, deploymentStatus)
      } catch (e) {
        console.warn('Failed to update batch status in DB:', e)
      }

      // Update in demo stores (if demo mode)
      if (isDemoMode()) {
        const legacyDep = demoDeployments.get(params.id)
        if (legacyDep) {
          legacyDep.status = deploymentStatus
          legacyDep.updatedAt = new Date().toISOString()
          if (newStatus === 'approved') {
            legacyDep.startedAt = new Date().toISOString()
          }
          demoDeployments.set(params.id, legacyDep)
        }

        const batch = demoBatches.get(params.id)
        if (batch) {
          batch.status = deploymentStatus
          batch.updatedAt = new Date().toISOString()
          if (newStatus === 'approved') {
            batch.startedAt = new Date().toISOString()
          }
          demoBatches.set(params.id, batch)
        }
      }

      logApprovalAction(
        newStatus === 'approved' ? 'approval.approved' : 'approval.rejected',
        params.id,
        approver,
        reason
      )
    }

    return NextResponse.json({
      status: newStatus,
      message: action === 'approve'
        ? `Deployment ${newStatus === 'approved' ? 'approved' : 'approval recorded'}`
        : 'Deployment rejected',
      currentApprovals: updatedApproval.approvals.length,
      requiredApprovals: updatedApproval.requiredApprovals,
    })
  } catch (error) {
    console.error('Approval error:', error)
    return NextResponse.json(
      { error: 'Failed to process approval' },
      { status: 500 }
    )
  }
}

/**
 * Parse timeout string like "24h", "30m", "7d"
 */
function parseTimeout(timeout: string): number {
  const match = timeout.match(/^(\d+)([mhd])$/)
  if (!match) {
    return 24 * 60 * 60 * 1000 // Default 24 hours
  }

  const value = parseInt(match[1], 10)
  const unit = match[2]

  switch (unit) {
    case 'm':
      return value * 60 * 1000
    case 'h':
      return value * 60 * 60 * 1000
    case 'd':
      return value * 24 * 60 * 60 * 1000
    default:
      return 24 * 60 * 60 * 1000
  }
}


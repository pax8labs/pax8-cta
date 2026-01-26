import { NextRequest, NextResponse } from 'next/server'
import { loadConfig } from '@agentcrate/core'
import { resolve } from 'path'

export const dynamic = 'force-dynamic'

const CONFIG_PATH = process.env.CONFIG_PATH || './config/tenants.yaml'

// In-memory approval store (in production, use Redis or a database)
const approvalStore = new Map<string, {
  deploymentId: string;
  status: 'pending' | 'approved' | 'rejected';
  requiredApprovals: number;
  approvals: Array<{ approver: string; timestamp: string; }>;
  rejections: Array<{ approver: string; reason: string; timestamp: string; }>;
  createdAt: string;
  expiresAt: string;
}>()

/**
 * GET /api/deployments/[id]/approve - Get approval status
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const approval = approvalStore.get(params.id)

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
      approvals: approval.approvals,
      rejections: approval.rejections,
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
 * Body: { action: 'approve' | 'reject', approver: string, reason?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { action, approver, reason } = body

    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'action must be "approve" or "reject"' },
        { status: 400 }
      )
    }

    if (!approver) {
      return NextResponse.json(
        { error: 'approver is required' },
        { status: 400 }
      )
    }

    const config = await loadConfig(resolve(CONFIG_PATH))
    const approvalConfig = config.settings?.approval

    // Check if approver is authorized
    if (approvalConfig?.approvers && !approvalConfig.approvers.includes(approver)) {
      return NextResponse.json(
        { error: `${approver} is not authorized to approve deployments` },
        { status: 403 }
      )
    }

    let approval = approvalStore.get(params.id)

    // Create new approval record if doesn't exist
    if (!approval) {
      const timeout = approvalConfig?.timeout || '24h'
      const timeoutMs = parseTimeout(timeout)
      const expiresAt = new Date(Date.now() + timeoutMs)

      approval = {
        deploymentId: params.id,
        status: 'pending',
        requiredApprovals: approvalConfig?.minApprovals || 1,
        approvals: [],
        rejections: [],
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString(),
      }
      approvalStore.set(params.id, approval)
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
      approval.status = 'rejected'
      approvalStore.set(params.id, approval)
      return NextResponse.json(
        { error: 'Approval request has expired' },
        { status: 400 }
      )
    }

    // Check if this approver already voted
    const alreadyApproved = approval.approvals.some(a => a.approver === approver)
    const alreadyRejected = approval.rejections.some(r => r.approver === approver)

    if (alreadyApproved || alreadyRejected) {
      return NextResponse.json(
        { error: `${approver} has already voted on this deployment` },
        { status: 400 }
      )
    }

    if (action === 'approve') {
      approval.approvals.push({
        approver,
        timestamp: new Date().toISOString(),
      })

      // Check if we have enough approvals
      if (approval.approvals.length >= approval.requiredApprovals) {
        approval.status = 'approved'
      }
    } else {
      approval.rejections.push({
        approver,
        reason: reason || 'No reason provided',
        timestamp: new Date().toISOString(),
      })
      approval.status = 'rejected'
    }

    approvalStore.set(params.id, approval)

    return NextResponse.json({
      status: approval.status,
      message: action === 'approve'
        ? `Deployment ${approval.status === 'approved' ? 'approved' : 'approval recorded'}`
        : 'Deployment rejected',
      currentApprovals: approval.approvals.length,
      requiredApprovals: approval.requiredApprovals,
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


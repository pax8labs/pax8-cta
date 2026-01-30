'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'

interface ApprovalStatus {
  requiresApproval: boolean
  status?: 'pending' | 'approved' | 'rejected'
  requiredApprovals?: number
  currentApprovals?: number
  approvals?: Array<{ approver: string; timestamp: string }>
  rejections?: Array<{ approver: string; reason: string; timestamp: string }>
  expiresAt?: string
}

interface ApprovalPanelProps {
  deploymentId: string
  onStatusChange?: (status: 'approved' | 'rejected') => void
}

export function ApprovalPanel({ deploymentId, onStatusChange }: ApprovalPanelProps) {
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [approverEmail, setApproverEmail] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)

  const fetchApprovalStatus = useCallback(async () => {
    try {
      const response = await fetch(`/api/deployments/${deploymentId}/approve`)
      const data = await response.json()
      setApprovalStatus(data)
    } catch (error) {
      console.error('Failed to fetch approval status:', error)
    } finally {
      setLoading(false)
    }
  }, [deploymentId])

  useEffect(() => {
    fetchApprovalStatus()
  }, [fetchApprovalStatus])

  const handleApprove = async () => {
    if (!approverEmail.trim()) {
      toast.error('Please enter your email address')
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch(`/api/deployments/${deploymentId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          approver: approverEmail.trim(),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        toast.error(data.error || 'Failed to approve')
        return
      }

      toast.success(data.message)
      await fetchApprovalStatus()

      if (data.status === 'approved') {
        onStatusChange?.('approved')
      }
    } catch (error) {
      console.error('Approval error:', error)
      toast.error('Failed to submit approval')
    } finally {
      setSubmitting(false)
    }
  }

  const handleReject = async () => {
    if (!approverEmail.trim()) {
      toast.error('Please enter your email address')
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch(`/api/deployments/${deploymentId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reject',
          approver: approverEmail.trim(),
          reason: rejectReason.trim() || 'No reason provided',
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        toast.error(data.error || 'Failed to reject')
        return
      }

      toast.success('Deployment rejected')
      await fetchApprovalStatus()
      onStatusChange?.('rejected')
      setShowRejectForm(false)
    } catch (error) {
      console.error('Rejection error:', error)
      toast.error('Failed to submit rejection')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-violet-50 border border-violet-200 rounded-lg p-4">
        <div className="animate-pulse flex space-x-2">
          <div className="h-4 w-4 bg-violet-200 rounded-full"></div>
          <div className="h-4 w-32 bg-violet-200 rounded"></div>
        </div>
      </div>
    )
  }

  if (!approvalStatus?.requiresApproval) {
    return null
  }

  const { status, requiredApprovals, currentApprovals, approvals, rejections, expiresAt } = approvalStatus

  // Calculate time remaining
  const timeRemaining = expiresAt ? new Date(expiresAt).getTime() - Date.now() : 0
  const hoursRemaining = Math.max(0, Math.floor(timeRemaining / (1000 * 60 * 60)))
  const minutesRemaining = Math.max(0, Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60)))

  return (
    <div className={`border rounded-lg p-4 ${
      status === 'approved' ? 'bg-emerald-50 border-emerald-200' :
      status === 'rejected' ? 'bg-rose-50 border-rose-200' :
      'bg-violet-50 border-violet-200'
    }`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {status === 'pending' && (
            <span className="w-2 h-2 bg-violet-500 rounded-full animate-pulse"></span>
          )}
          {status === 'approved' && (
            <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
          {status === 'rejected' && (
            <svg className="w-5 h-5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          <h3 className={`font-medium ${
            status === 'approved' ? 'text-emerald-800' :
            status === 'rejected' ? 'text-rose-800' :
            'text-violet-800'
          }`}>
            {status === 'pending' && 'Awaiting Approval'}
            {status === 'approved' && 'Approved'}
            {status === 'rejected' && 'Rejected'}
          </h3>
        </div>

        {status === 'pending' && timeRemaining > 0 && (
          <span className="text-xs text-violet-600">
            Expires in {hoursRemaining}h {minutesRemaining}m
          </span>
        )}
      </div>

      {/* Progress indicator */}
      {status === 'pending' && requiredApprovals && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-sm text-violet-700 mb-1">
            <span>{currentApprovals || 0} of {requiredApprovals} approval{requiredApprovals > 1 ? 's' : ''}</span>
          </div>
          <div className="w-full h-2 bg-violet-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500 transition-all duration-300"
              style={{ width: `${Math.min(100, ((currentApprovals || 0) / requiredApprovals) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Approval history */}
      {approvals && approvals.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-medium text-slate-600 mb-1">Approvals:</p>
          <div className="space-y-1">
            {approvals.map((a, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-emerald-700">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>{a.approver}</span>
                <span className="text-slate-400">
                  {new Date(a.timestamp).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rejection history */}
      {rejections && rejections.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-medium text-slate-600 mb-1">Rejections:</p>
          <div className="space-y-1">
            {rejections.map((r, i) => (
              <div key={i} className="text-xs text-rose-700">
                <div className="flex items-center gap-2">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span>{r.approver}</span>
                  <span className="text-slate-400">
                    {new Date(r.timestamp).toLocaleString()}
                  </span>
                </div>
                {r.reason && <p className="ml-5 text-rose-600">{r.reason}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Approval form */}
      {status === 'pending' && (
        <div className="border-t border-violet-200 pt-3 mt-3">
          <div className="mb-3">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Your email (must be an authorized approver)
            </label>
            <input
              type="email"
              value={approverEmail}
              onChange={(e) => setApproverEmail(e.target.value)}
              placeholder="approver@company.com"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-violet-500"
              disabled={submitting}
            />
          </div>

          {showRejectForm ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Reason for rejection (optional)
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Explain why this deployment should not proceed..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-rose-500 resize-none"
                  rows={2}
                  disabled={submitting}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleReject}
                  disabled={submitting || !approverEmail.trim()}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-rose-600 rounded hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Submitting...' : 'Confirm Rejection'}
                </button>
                <button
                  onClick={() => setShowRejectForm(false)}
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded hover:bg-slate-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={handleApprove}
                disabled={submitting || !approverEmail.trim()}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Submitting...' : 'Approve'}
              </button>
              <button
                onClick={() => setShowRejectForm(true)}
                disabled={submitting}
                className="flex-1 px-4 py-2 text-sm font-medium text-rose-700 bg-rose-100 rounded hover:bg-rose-200"
              >
                Reject
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

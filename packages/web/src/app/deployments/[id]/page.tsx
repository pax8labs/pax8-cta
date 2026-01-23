'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import useSWR from 'swr'
import { TenantDeploymentResult } from '@agentcrate/core'

const fetcher = (url: string) => fetch(url).then((res) => res.json())

const statusStyles: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-800',
  scheduled: 'bg-blue-100 text-blue-800',
  awaiting_approval: 'bg-purple-100 text-purple-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-600',
  rolling_back: 'bg-orange-100 text-orange-800',
  rolled_back: 'bg-blue-100 text-blue-800',
}

const statusLabels: Record<string, string> = {
  pending: 'Pending',
  scheduled: 'Scheduled',
  awaiting_approval: 'Awaiting Approval',
  approved: 'Approved',
  rejected: 'Rejected',
  in_progress: 'In Progress',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
  rolling_back: 'Rolling Back',
  rolled_back: 'Rolled Back',
}

export default function DeploymentDetailPage() {
  const params = useParams()
  const id = params.id as string
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const { data: deployment, error, isLoading, mutate } = useSWR(
    `/api/deployments/${id}`,
    fetcher,
    { refreshInterval: 3000 }
  )

  const handleRetry = async () => {
    setActionLoading('retry')
    setActionMessage(null)
    try {
      const response = await fetch(`/api/deployments/${id}/retry`, { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setActionMessage({ type: 'success', text: data.message })
      mutate() // Refresh deployment data
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to retry' })
    } finally {
      setActionLoading(null)
    }
  }

  const handleCancel = async () => {
    setActionLoading('cancel')
    setActionMessage(null)
    try {
      const response = await fetch(`/api/deployments/${id}/cancel`, { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setActionMessage({ type: 'success', text: data.message })
      mutate() // Refresh deployment data
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to cancel' })
    } finally {
      setActionLoading(null)
    }
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700">Failed to load deployment details.</p>
      </div>
    )
  }

  if (isLoading || !deployment) {
    return <div className="text-gray-500">Loading...</div>
  }

  const progress = Math.round(
    (deployment.completedTenants / deployment.totalTenants) * 100
  )

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <a
          href="/deployments"
          className="text-blue-600 hover:text-blue-800 text-sm mb-2 inline-block"
        >
          &larr; Back to Deployments
        </a>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-900">
            {deployment.solutionName}
          </h1>
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
              statusStyles[deployment.status as keyof typeof statusStyles]
            }`}
          >
            {statusLabels[deployment.status as keyof typeof statusLabels]}
          </span>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          Deployment ID: {deployment.id}
        </p>
      </div>

      {/* Action Buttons */}
      {(deployment.failedTenants > 0 || deployment.status === 'in_progress' || deployment.status === 'pending') && (
        <div className="flex gap-3 mb-6">
          {deployment.failedTenants > 0 && (
            <button
              onClick={handleRetry}
              disabled={actionLoading !== null}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {actionLoading === 'retry' ? 'Retrying...' : `Retry ${deployment.failedTenants} Failed`}
            </button>
          )}
          {(deployment.status === 'in_progress' || deployment.status === 'pending') && (
            <button
              onClick={handleCancel}
              disabled={actionLoading !== null}
              className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {actionLoading === 'cancel' ? 'Cancelling...' : 'Cancel Pending'}
            </button>
          )}
        </div>
      )}

      {/* Action Message */}
      {actionMessage && (
        <div
          className={`mb-6 p-4 rounded-lg ${
            actionMessage.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {actionMessage.text}
        </div>
      )}

      {/* Progress Overview */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Progress</h2>

        <div className="grid grid-cols-4 gap-4 mb-4">
          <div className="text-center">
            <p className="text-3xl font-bold text-gray-900">
              {deployment.totalTenants}
            </p>
            <p className="text-sm text-gray-500">Total</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-green-600">
              {deployment.completedTenants}
            </p>
            <p className="text-sm text-gray-500">Completed</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-red-600">
              {deployment.failedTenants}
            </p>
            <p className="text-sm text-gray-500">Failed</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-yellow-600">
              {deployment.totalTenants -
                deployment.completedTenants -
                deployment.failedTenants}
            </p>
            <p className="text-sm text-gray-500">Pending</p>
          </div>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-4">
          <div
            className={`h-4 rounded-full transition-all ${
              deployment.failedTenants > 0 ? 'bg-yellow-500' : 'bg-green-500'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-sm text-gray-500 mt-2 text-center">{progress}% complete</p>
      </div>

      {/* Tenant Results */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-medium text-gray-900">Tenant Results</h2>
        </div>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tenant
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Started
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Duration
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Error
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {deployment.tenantResults
              ?.sort((a: TenantDeploymentResult, b: TenantDeploymentResult) => {
                const order: Record<string, number> = {
                  in_progress: 0,
                  rolling_back: 0,
                  pending: 1,
                  scheduled: 1,
                  awaiting_approval: 1,
                  approved: 1,
                  completed: 2,
                  rolled_back: 2,
                  failed: 3,
                  rejected: 3,
                  cancelled: 4,
                }
                return (order[a.status] ?? 5) - (order[b.status] ?? 5)
              })
              .map((result: TenantDeploymentResult) => (
                <tr key={result.tenantId} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <p className="font-medium text-gray-900">
                        {result.tenantName}
                      </p>
                      <p className="text-xs text-gray-500">
                        {result.tenantId.slice(0, 8)}...
                      </p>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        statusStyles[result.status]
                      }`}
                    >
                      {result.status === 'in_progress' && (
                        <svg
                          className="animate-spin -ml-0.5 mr-1.5 h-3 w-3"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                      )}
                      {statusLabels[result.status]}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {result.startedAt
                      ? new Date(result.startedAt).toLocaleTimeString()
                      : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {calculateDuration(result.startedAt, result.completedAt)}
                  </td>
                  <td className="px-6 py-4 text-sm text-red-600 max-w-xs truncate">
                    {result.error || '-'}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Metadata */}
      <div className="mt-6 text-sm text-gray-500">
        <p>Created: {new Date(deployment.createdAt).toLocaleString()}</p>
        <p>Last Updated: {new Date(deployment.updatedAt).toLocaleString()}</p>
      </div>
    </div>
  )
}

function calculateDuration(startedAt?: string, completedAt?: string): string {
  if (!startedAt) return '-'

  const start = new Date(startedAt).getTime()
  const end = completedAt ? new Date(completedAt).getTime() : Date.now()
  const durationMs = end - start

  if (durationMs < 1000) return `${durationMs}ms`
  if (durationMs < 60000) return `${Math.round(durationMs / 1000)}s`
  return `${Math.round(durationMs / 60000)}m ${Math.round(
    (durationMs % 60000) / 1000
  )}s`
}

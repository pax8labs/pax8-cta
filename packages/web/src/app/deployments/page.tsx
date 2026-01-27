'use client'

import { Suspense, useState, useMemo } from 'react'
import useSWR from 'swr'
import Link from 'next/link'

const fetcher = (url: string) => fetch(url).then((res) => res.json())

type StatusFilter = 'all' | 'deployed' | 'failed' | 'in_progress'

// Extract tenant-agent deployment records from deployment jobs
function extractDeploymentRecords(deployments: any[]) {
  const records: {
    tenantId: string
    tenantName: string
    agentName: string
    agentVersion?: string
    status: string
    deployedAt?: string
    deploymentId: string
  }[] = []

  // Track seen tenant-agent pairs to only keep most recent
  const seen = new Set<string>()

  // Process newest first
  const sorted = [...deployments].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )

  for (const deployment of sorted) {
    for (const result of deployment.tenantResults || []) {
      const key = `${result.tenantId}-${deployment.solutionName}`
      if (!seen.has(key)) {
        seen.add(key)
        records.push({
          tenantId: result.tenantId,
          tenantName: result.tenantName,
          agentName: deployment.solutionName,
          agentVersion: deployment.solutionVersion,
          status: result.status,
          deployedAt: result.completedAt || result.startedAt || deployment.createdAt,
          deploymentId: deployment.id,
        })
      }
    }
  }

  return records
}

function formatTimeAgo(dateString?: string) {
  if (!dateString) return '—'
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const statusStyles: Record<string, { bg: string; text: string; dot: string }> = {
  completed: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  in_progress: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  failed: { bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500' },
  pending: { bg: 'bg-slate-50', text: 'text-slate-600', dot: 'bg-slate-400' },
}

function StatusBadge({ status }: { status: string }) {
  const style = statusStyles[status] || statusStyles.pending
  const label = status === 'completed' ? 'deployed' : status.replace('_', ' ')

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${style.bg} ${style.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {label}
    </span>
  )
}

function DeploymentsContent() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const { data, error, isLoading } = useSWR('/api/deployments?limit=100', fetcher, { refreshInterval: 5000 })
  const deployments = data?.deployments ?? []

  const records = useMemo(() => extractDeploymentRecords(deployments), [deployments])

  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      // Status filter
      if (statusFilter === 'deployed' && r.status !== 'completed') return false
      if (statusFilter === 'failed' && r.status !== 'failed') return false
      if (statusFilter === 'in_progress' && r.status !== 'in_progress' && r.status !== 'pending') return false

      // Search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        if (!r.tenantName.toLowerCase().includes(q) && !r.agentName.toLowerCase().includes(q)) {
          return false
        }
      }

      return true
    })
  }, [records, statusFilter, searchQuery])

  // Stats
  const stats = useMemo(() => {
    const deployed = records.filter(r => r.status === 'completed').length
    const failed = records.filter(r => r.status === 'failed').length
    const inProgress = records.filter(r => r.status === 'in_progress' || r.status === 'pending').length
    return { deployed, failed, inProgress, total: records.length }
  }, [records])

  const statusOptions: { value: StatusFilter; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: stats.total },
    { value: 'deployed', label: 'Deployed', count: stats.deployed },
    { value: 'failed', label: 'Failed', count: stats.failed },
    { value: 'in_progress', label: 'In Progress', count: stats.inProgress },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Deployments</h1>
          <p className="text-sm text-gray-500 mt-1">
            Agent deployments across all tenants
          </p>
        </div>
        <Link
          href="/deployments/new"
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          New Deployment
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {statusOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                statusFilter === opt.value
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {opt.label}
              {opt.count > 0 && (
                <span className={`ml-1.5 ${statusFilter === opt.value ? 'text-gray-500' : 'text-gray-400'}`}>
                  {opt.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <input
          type="text"
          placeholder="Search tenants or agents..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Content */}
      {error ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-rose-600 font-medium">Failed to load deployments</p>
          <p className="text-sm text-gray-500 mt-1">Please try refreshing the page</p>
        </div>
      ) : isLoading ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <div className="w-6 h-6 mx-auto mb-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500">Loading deployments...</p>
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <div className="w-12 h-12 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h3 className="font-medium text-gray-900 mb-1">
            {searchQuery || statusFilter !== 'all' ? 'No matching deployments' : 'No deployments yet'}
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            {searchQuery || statusFilter !== 'all'
              ? 'Try adjusting your filters'
              : 'Deploy an agent to a tenant to get started'
            }
          </p>
          {!searchQuery && statusFilter === 'all' && (
            <Link
              href="/deployments/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
            >
              New Deployment
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tenant
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Agent
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Deployed
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">

                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredRecords.map((record, idx) => (
                <tr key={`${record.tenantId}-${record.agentName}-${idx}`} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-900">{record.tenantName}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-900">{record.agentName}</span>
                      {record.agentVersion && (
                        <span className="text-xs text-gray-400 font-mono">v{record.agentVersion}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={record.status} />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {formatTimeAgo(record.deployedAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/deployments/${record.deploymentId}`}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function LoadingFallback() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Deployments</h1>
          <p className="text-sm text-gray-500 mt-1">Agent deployments across all tenants</p>
        </div>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <div className="w-6 h-6 mx-auto mb-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500">Loading...</p>
      </div>
    </div>
  )
}

export default function DeploymentsPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <DeploymentsContent />
    </Suspense>
  )
}

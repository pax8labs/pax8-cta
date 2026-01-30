'use client'

import React, { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import { toast } from 'sonner'
import { FlaskSpinner } from '@/components/ui/flask-spinner'

const fetcher = (url: string) => fetch(url).then((res) => res.json())

interface DeployedAgent {
  solutionName: string
  version: string
  deployedAt: string
  status: 'active' | 'failed' | 'updating'
}

interface Tenant {
  name: string
  tenantId: string
  environmentUrl: string
  tags?: string[]
  enabled: boolean
  metadata?: Record<string, unknown>
  deployedAgents?: DeployedAgent[]
}

export default function TenantsPage() {
  const router = useRouter()
  const { data, error, isLoading } = useSWR('/api/tenants', fetcher)
  const { data: tagsData } = useSWR('/api/tenants/tags', fetcher)

  const [tagFilter, setTagFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedTenantId, setExpandedTenantId] = useState<string | null>(null)
  const [showDisableWarning, setShowDisableWarning] = useState<string | null>(null)
  const [isTogglingStatus, setIsTogglingStatus] = useState<string | null>(null)

  const allTags: string[] = tagsData?.tags ?? []
  const tenants: Tenant[] = data?.tenants ?? []

  // Apply filters
  const filteredTenants = useMemo(() => {
    return tenants.filter((tenant) => {
      // Tag filter
      if (tagFilter !== 'all' && !tenant.tags?.includes(tagFilter)) {
        return false
      }

      // Status filter
      if (statusFilter === 'enabled' && !tenant.enabled) return false
      if (statusFilter === 'disabled' && tenant.enabled) return false

      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matchesName = tenant.name.toLowerCase().includes(query)
        const matchesId = tenant.tenantId.toLowerCase().includes(query)
        const matchesUrl = tenant.environmentUrl.toLowerCase().includes(query)
        if (!matchesName && !matchesId && !matchesUrl) return false
      }

      return true
    })
  }, [tenants, tagFilter, statusFilter, searchQuery])

  const enabledCount = tenants.filter((t) => t.enabled).length
  const totalCount = tenants.length

  const handleRowClick = (tenantId: string) => {
    router.push(`/tenants/${tenantId}`)
  }

  const handleToggleExpand = (e: React.MouseEvent, tenantId: string) => {
    e.stopPropagation()
    setExpandedTenantId(expandedTenantId === tenantId ? null : tenantId)
  }

  const handleToggleEnabled = async (tenant: Tenant) => {
    if (tenant.enabled) {
      setShowDisableWarning(tenant.tenantId)
    } else {
      confirmToggleEnabled(tenant)
    }
  }

  const confirmToggleEnabled = async (tenant: Tenant) => {
    setIsTogglingStatus(tenant.tenantId)
    try {
      const response = await fetch(`/api/tenants/${tenant.tenantId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !tenant.enabled }),
      })
      if (!response.ok) throw new Error('Failed to update status')
      toast.success(`Tenant ${tenant.enabled ? 'disabled' : 'enabled'}`)
      mutate('/api/tenants')
      setShowDisableWarning(null)
    } catch (err) {
      console.error(err)
      toast.error('Failed to update tenant status')
    } finally {
      setIsTogglingStatus(null)
    }
  }

  if (error) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-xl p-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-rose-100 rounded-full flex items-center justify-center">
            <svg className="w-5 h-5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-rose-700 font-medium">Failed to load tenant configuration</p>
            <p className="text-rose-600 text-sm">Make sure the config file exists.</p>
          </div>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <FlaskSpinner size="md" message="Loading tenants..." />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Tenants</h1>
          <p className="text-slate-500 mt-1">Manage your customer tenant configurations</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg px-4 py-2 shadow-sm">
          <span className="text-2xl font-bold text-blue-600">{enabledCount}</span>
          <span className="text-slate-400 text-lg"> / {totalCount}</span>
          <p className="text-xs text-slate-500">enabled tenants</p>
        </div>
      </div>

      {/* Source Environment */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium text-slate-700">Source Environment</h2>
            <p className="text-slate-500 text-xs mt-0.5">Agents are deployed from this environment to customer tenants</p>
          </div>
          <code className="text-sm text-slate-600 bg-white px-3 py-1.5 rounded border border-slate-200 font-mono">
            {data?.source?.environmentUrl}
          </code>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white shadow-sm rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search tenants..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Tag Filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-600">Tag:</span>
            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 bg-white hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Tags</option>
              {allTags.map((tag) => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-600">Status:</span>
            <div className="flex gap-1">
              {[
                { value: 'all', label: 'All' },
                { value: 'enabled', label: 'Enabled' },
                { value: 'disabled', label: 'Disabled' },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setStatusFilter(option.value as typeof statusFilter)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    statusFilter === option.value
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Filter summary */}
        {(tagFilter !== 'all' || statusFilter !== 'all' || searchQuery) && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-sm">
            <span className="text-slate-500">
              Showing <span className="font-medium text-slate-900">{filteredTenants.length}</span> of {totalCount} tenants
            </span>
            <button
              onClick={() => {
                setTagFilter('all')
                setStatusFilter('all')
                setSearchQuery('')
              }}
              className="text-slate-500 hover:text-slate-700 flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* Tenant List */}
      <div className="bg-white shadow-md rounded-xl border border-slate-200 overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Tenant
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Tenant ID
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Environment
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Tags
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-4 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredTenants.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center">
                  <div className="w-12 h-12 mx-auto mb-3 bg-slate-100 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <p className="text-slate-500 font-medium">No tenants match your filters</p>
                  <p className="text-slate-400 text-sm mt-1">Try adjusting your search or filter criteria</p>
                </td>
              </tr>
            ) : (
              filteredTenants.map((tenant) => {
                const isExpanded = expandedTenantId === tenant.tenantId
                return (
                  <React.Fragment key={tenant.tenantId}>
                    <tr
                      onClick={() => handleRowClick(tenant.tenantId)}
                      className="hover:bg-slate-50 transition-colors cursor-pointer group"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={(e) => handleToggleExpand(e, tenant.tenantId)}
                            className="text-slate-400 hover:text-slate-600 transition-transform"
                            style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                          <div className="w-8 h-8 bg-gradient-to-br from-slate-100 to-slate-200 rounded-lg flex items-center justify-center group-hover:from-blue-100 group-hover:to-blue-200 transition-colors">
                            <span className="text-sm font-semibold text-slate-600 group-hover:text-blue-600">
                              {tenant.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <span className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                            {tenant.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <code className="text-sm text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md font-mono">
                          {tenant.tenantId.slice(0, 8)}
                        </code>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                        {new URL(tenant.environmentUrl).hostname}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex gap-1.5 flex-wrap">
                          {tenant.tags?.map((tag: string) => (
                            <span
                              key={tag}
                              className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {tenant.enabled ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                            Enabled
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
                            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full"></span>
                            Disabled
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleRowClick(tenant.tenantId)
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          Manage
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                    {/* Expanded Row */}
                    {isExpanded && (
                      <tr className="bg-slate-50">
                        <td colSpan={6} className="px-6 py-4">
                          <div className="ml-7 grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Quick Actions */}
                            <div className="bg-white rounded-lg p-4 border border-slate-200">
                              <h4 className="text-sm font-medium text-slate-700 mb-3">Quick Actions</h4>
                              <div className="flex flex-col gap-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleToggleEnabled(tenant)
                                  }}
                                  disabled={isTogglingStatus === tenant.tenantId}
                                  className={`w-full px-3 py-2 text-sm font-medium rounded-lg transition-colors text-left ${
                                    tenant.enabled
                                      ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                                      : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                  } disabled:opacity-50`}
                                >
                                  {isTogglingStatus === tenant.tenantId
                                    ? 'Processing...'
                                    : tenant.enabled
                                    ? 'Disable Tenant'
                                    : 'Enable Tenant'}
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    router.push(`/deployments/new?tenants=${tenant.tenantId}`)
                                  }}
                                  className="w-full px-3 py-2 text-sm font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg transition-colors text-left"
                                >
                                  Deploy Agent
                                </button>
                              </div>
                            </div>

                            {/* Deployed Agents */}
                            <div className="bg-white rounded-lg p-4 border border-slate-200">
                              <h4 className="text-sm font-medium text-slate-700 mb-3">
                                Deployed Agents
                                {tenant.deployedAgents && (
                                  <span className="ml-2 text-xs text-slate-400">({tenant.deployedAgents.length})</span>
                                )}
                              </h4>
                              {tenant.deployedAgents && tenant.deployedAgents.length > 0 ? (
                                <div className="space-y-2">
                                  {tenant.deployedAgents.slice(0, 3).map(agent => (
                                    <div key={agent.solutionName} className="flex items-center justify-between text-sm">
                                      <span className="text-slate-700">{agent.solutionName}</span>
                                      <span className={`text-xs ${
                                        agent.status === 'active' ? 'text-emerald-600' :
                                        agent.status === 'updating' ? 'text-amber-600' : 'text-rose-600'
                                      }`}>
                                        {agent.status === 'active' ? 'Active' :
                                         agent.status === 'updating' ? 'Updating' : 'Failed'}
                                      </span>
                                    </div>
                                  ))}
                                  {tenant.deployedAgents.length > 3 && (
                                    <p className="text-xs text-slate-400">+{tenant.deployedAgents.length - 3} more</p>
                                  )}
                                </div>
                              ) : (
                                <p className="text-sm text-slate-400">No agents deployed</p>
                              )}
                            </div>

                            {/* Metadata Preview */}
                            <div className="bg-white rounded-lg p-4 border border-slate-200">
                              <h4 className="text-sm font-medium text-slate-700 mb-3">Info</h4>
                              <div className="space-y-2 text-sm">
                                {(() => {
                                  const meta = tenant.metadata as Record<string, string | number | undefined> | undefined
                                  const hasContent = meta?.industry || meta?.contractTier || meta?.employees
                                  if (!hasContent) return <p className="text-slate-400">No metadata</p>
                                  return (
                                    <>
                                      {meta?.industry && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-500">Industry</span>
                                          <span className="text-slate-700">{String(meta.industry)}</span>
                                        </div>
                                      )}
                                      {meta?.contractTier && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-500">Tier</span>
                                          <span className="text-slate-700">{String(meta.contractTier)}</span>
                                        </div>
                                      )}
                                      {meta?.employees && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-500">Employees</span>
                                          <span className="text-slate-700">{String(meta.employees)}</span>
                                        </div>
                                      )}
                                    </>
                                  )
                                })()}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-slate-400 text-center">
        Click a row to view tenant details and deployed agents
      </div>

      {/* Disable Warning Modal */}
      {showDisableWarning && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Disable Tenant</h3>
                  <p className="text-sm text-slate-500">This will affect deployments</p>
                </div>
              </div>

              {(() => {
                const tenant = tenants.find(t => t.tenantId === showDisableWarning)
                if (!tenant) return null
                return (
                  <>
                    <div className="bg-amber-50 rounded-lg p-4 mb-4 border border-amber-100">
                      <p className="text-sm text-slate-700">
                        You are about to disable <span className="font-semibold text-slate-900">{tenant.name}</span>.
                      </p>
                      <ul className="mt-3 text-sm text-slate-600 space-y-1.5">
                        <li className="flex items-start gap-2">
                          <svg className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          This tenant will be excluded from future deployments
                        </li>
                        <li className="flex items-start gap-2">
                          <svg className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          You can re-enable this tenant at any time
                        </li>
                      </ul>
                    </div>

                    <p className="text-sm text-slate-600">
                      Are you sure you want to disable this tenant?
                    </p>
                  </>
                )
              })()}
            </div>

            <div className="flex gap-3 p-4 bg-slate-50 border-t border-slate-200">
              <button
                onClick={() => setShowDisableWarning(null)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const tenant = tenants.find(t => t.tenantId === showDisableWarning)
                  if (tenant) confirmToggleEnabled(tenant)
                }}
                disabled={isTogglingStatus !== null}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                {isTogglingStatus ? 'Disabling...' : 'Yes, Disable'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, Search, Filter, TrendingUp, AlertCircle, CheckCircle } from 'lucide-react'
import type { TenantHealth } from '@agentsync/core'
import { TenantHealthCard } from '@/components/tenants/TenantHealthCard'
import { TenantHealthDetail } from '@/components/tenants/TenantHealthDetail'

interface HealthResponse {
  tenants: TenantHealth[]
  summary: {
    total: number
    healthy: number
    warning: number
    critical: number
    averageHealthScore: number
  }
  timestamp: string
}

export default function HealthPage() {
  const [data, setData] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'healthy' | 'warning' | 'critical'>('all')
  const [sortBy, setSortBy] = useState<'health' | 'name' | 'recent'>('health')
  const [selectedTenant, setSelectedTenant] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const fetchHealth = async () => {
    try {
      setError(null)
      const response = await fetch('/api/tenants/health')

      if (!response.ok) {
        throw new Error('Failed to fetch tenant health')
      }

      const json = await response.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchHealth()

    const interval = setInterval(fetchHealth, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchHealth()
  }

  const filteredTenants = data?.tenants.filter(tenant => {
    if (searchQuery && !tenant.tenantName.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false
    }

    if (filterStatus !== 'all' && tenant.status !== filterStatus) {
      return false
    }

    return true
  }).sort((a, b) => {
    switch (sortBy) {
      case 'health':
        return b.healthScore - a.healthScore
      case 'name':
        return a.tenantName.localeCompare(b.tenantName)
      case 'recent':
        return new Date(b.lastChecked).getTime() - new Date(a.lastChecked).getTime()
      default:
        return 0
    }
  }) || []

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin inline-block w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full" />
            <p className="mt-4 text-gray-600 dark:text-gray-400">Loading tenant health...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-red-900 dark:text-red-200 mb-2">Failed to Load</h2>
            <p className="text-red-700 dark:text-red-300">{error}</p>
            <button
              onClick={fetchHealth}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Tenant Health</h1>
                <p className="text-gray-600 dark:text-gray-400 mt-1">
                  Monitor health and deployment readiness across all tenants
                </p>
              </div>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh All
              </button>
            </div>

            {data && (
              <div className="grid grid-cols-5 gap-4">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900/50 p-4 border border-gray-200 dark:border-gray-700">
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">{data.summary.total}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Total Tenants</div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900/50 p-4 border border-gray-200 dark:border-gray-700">
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">{data.summary.healthy}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">
                    <CheckCircle className="h-4 w-4" />
                    Healthy
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900/50 p-4 border border-gray-200 dark:border-gray-700">
                  <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{data.summary.warning}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" />
                    Warnings
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900/50 p-4 border border-gray-200 dark:border-gray-700">
                  <div className="text-2xl font-bold text-red-600 dark:text-red-400">{data.summary.critical}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" />
                    Critical
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900/50 p-4 border border-gray-200 dark:border-gray-700">
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{data.summary.averageHealthScore}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">
                    <TrendingUp className="h-4 w-4" />
                    Avg Score
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900/50 p-4 mb-6 border border-gray-200 dark:border-gray-700">
            <div className="flex gap-4 items-center">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-gray-500" />
                <input
                  type="text"
                  placeholder="Search tenants..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <Filter className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value as any)}
                  className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Status</option>
                  <option value="healthy">Healthy</option>
                  <option value="warning">Warning</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as any)}
                className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="health">Sort by Health Score</option>
                <option value="name">Sort by Name</option>
                <option value="recent">Sort by Last Checked</option>
              </select>
            </div>
          </div>

          {filteredTenants.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900/50 p-12 text-center border border-gray-200 dark:border-gray-700">
              <p className="text-gray-600 dark:text-gray-400">No tenants match your filters</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredTenants.map(tenant => (
                <TenantHealthCard
                  key={tenant.tenantId}
                  tenant={tenant}
                  onClick={() => setSelectedTenant(tenant.tenantId)}
                />
              ))}
            </div>
          )}

          {data && (
            <div className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
              Last updated: {new Date(data.timestamp).toLocaleString()}
            </div>
          )}
        </div>
      </div>

      {selectedTenant && (
        <TenantHealthDetail
          tenantId={selectedTenant}
          onClose={() => setSelectedTenant(null)}
        />
      )}
    </>
  )
}

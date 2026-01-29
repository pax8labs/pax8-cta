'use client'

import useSWR from 'swr'
import { DeploymentCard } from '@/components/DeploymentCard'
import { StatsCard } from '@/components/StatsCard'

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export default function Dashboard() {
  const { data: stats, error: statsError } = useSWR('/api/stats', fetcher, {
    refreshInterval: 5000,
  })

  const { data: recentDeployments, error: deploymentsError } = useSWR(
    '/api/deployments?limit=5',
    fetcher,
    { refreshInterval: 5000 }
  )

  const deployments = recentDeployments?.deployments ?? []

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Dashboard</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatsCard
          title="Total Tenants"
          value={stats?.totalTenants ?? '-'}
          color="blue"
          href="/tenants"
        />
        <StatsCard
          title="Active Deployments"
          value={stats?.activeDeployments ?? '-'}
          color="yellow"
          href="/deployments?filter=active"
        />
        <StatsCard
          title="Completed Today"
          value={stats?.completedToday ?? '-'}
          color="green"
          href="/deployments?period=today"
        />
        <StatsCard
          title="Failed Today"
          value={stats?.failedToday ?? '-'}
          color="red"
          href="/deployments?filter=issues"
        />
      </div>

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <a
            href="/agents/new"
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg p-4 text-center transition-colors"
          >
            <span className="text-2xl block mb-2">+</span>
            <span className="font-medium">New Agent</span>
          </a>
          <a
            href="/deployments/new"
            className="bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg p-4 text-center transition-colors"
          >
            <span className="text-2xl block mb-2">+</span>
            <span className="font-medium">New Deployment</span>
          </a>
          <a
            href="/tenants"
            className="bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg p-4 text-center transition-colors"
          >
            <span className="text-2xl block mb-2">&#9881;</span>
            <span className="font-medium">Manage Tenants</span>
          </a>
        </div>
      </div>

      {/* Recent Deployments */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:px-6 border-b">
          <h2 className="text-lg font-medium text-gray-900">
            Recent Deployments
          </h2>
        </div>
        <div className="divide-y divide-gray-200">
          {deploymentsError ? (
            <p className="p-4 text-red-600">Failed to load deployments</p>
          ) : !recentDeployments ? (
            <p className="p-4 text-gray-500">Loading...</p>
          ) : deployments.length === 0 ? (
            <p className="p-4 text-gray-500">No deployments yet</p>
          ) : (
            deployments.map((deployment: any) => (
              <DeploymentCard key={deployment.id} deployment={deployment} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

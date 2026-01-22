'use client'

import useSWR from 'swr'
import { DeploymentCard } from '@/components/DeploymentCard'

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export default function DeploymentsPage() {
  const { data: deployments, error, isLoading } = useSWR(
    '/api/deployments?limit=50',
    fetcher,
    { refreshInterval: 5000 }
  )

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Deployments</h1>
        <a
          href="/deployments/new"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          New Deployment
        </a>
      </div>

      <div className="bg-white shadow rounded-lg">
        {error ? (
          <div className="p-4 text-red-600">Failed to load deployments</div>
        ) : isLoading ? (
          <div className="p-4 text-gray-500">Loading...</div>
        ) : deployments?.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p className="text-lg mb-2">No deployments yet</p>
            <p className="text-sm">
              Create your first deployment using the CLI or web interface.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {deployments?.map((deployment: any) => (
              <DeploymentCard key={deployment.id} deployment={deployment} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

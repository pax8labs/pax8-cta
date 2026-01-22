import { DeploymentJob } from '@csd/core'

interface DeploymentCardProps {
  deployment: DeploymentJob
}

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

export function DeploymentCard({ deployment }: DeploymentCardProps) {
  const progress = Math.round(
    (deployment.completedTenants / deployment.totalTenants) * 100
  )

  return (
    <a
      href={`/deployments/${deployment.id}`}
      className="block p-4 hover:bg-gray-50 transition-colors"
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <span className="font-medium text-gray-900">
              {deployment.solutionName}
            </span>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                statusStyles[deployment.status]
              }`}
            >
              {statusLabels[deployment.status]}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {deployment.completedTenants} of {deployment.totalTenants} tenants
            {deployment.failedTenants > 0 && (
              <span className="text-red-600 ml-2">
                ({deployment.failedTenants} failed)
              </span>
            )}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-500">
            {new Date(deployment.createdAt).toLocaleDateString()}
          </p>
          <p className="text-xs text-gray-400">
            {deployment.id.slice(0, 8)}...
          </p>
        </div>
      </div>
      {deployment.status === 'in_progress' && (
        <div className="mt-3">
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </a>
  )
}

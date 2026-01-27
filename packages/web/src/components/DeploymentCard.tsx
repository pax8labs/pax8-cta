import { DeploymentJob, DeploymentTrigger } from '@agentsync/core'

interface DeploymentCardProps {
  deployment: DeploymentJob
}

const statusStyles: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-700',
  scheduled: 'bg-blue-100 text-blue-700',
  awaiting_approval: 'bg-violet-100 text-violet-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-rose-100 text-rose-700',
  in_progress: 'bg-amber-100 text-amber-700',
  completed: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-rose-100 text-rose-700',
  cancelled: 'bg-slate-100 text-slate-500',
  rolling_back: 'bg-orange-100 text-orange-700',
  rolled_back: 'bg-sky-100 text-sky-700',
}

const statusIcons: Record<string, JSX.Element> = {
  pending: <span className="w-2 h-2 bg-slate-400 rounded-full"></span>,
  scheduled: <span className="w-2 h-2 bg-blue-500 rounded-full"></span>,
  awaiting_approval: <span className="w-2 h-2 bg-violet-500 rounded-full animate-pulse"></span>,
  approved: <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>,
  rejected: <span className="w-2 h-2 bg-rose-500 rounded-full"></span>,
  in_progress: <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span>,
  completed: <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>,
  failed: <span className="w-2 h-2 bg-rose-500 rounded-full"></span>,
  cancelled: <span className="w-2 h-2 bg-slate-400 rounded-full"></span>,
  rolling_back: <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></span>,
  rolled_back: <span className="w-2 h-2 bg-sky-500 rounded-full"></span>,
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

const triggerIcons: Record<DeploymentTrigger, JSX.Element> = {
  manual: (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ),
  scheduled: (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  webhook: (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  ),
  cli: (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  api: (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
  ),
}

const triggerLabels: Record<DeploymentTrigger, string> = {
  manual: 'Manual',
  scheduled: 'Scheduled',
  webhook: 'Webhook',
  cli: 'CLI',
  api: 'API',
}

const triggerDescriptions: Record<DeploymentTrigger, string> = {
  manual: 'Started manually by a user through the dashboard',
  scheduled: 'Automatically triggered at a scheduled time',
  webhook: 'Triggered by an external webhook call (e.g., CI/CD)',
  cli: 'Started from the command line interface',
  api: 'Triggered programmatically via the REST API',
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  } else {
    return `${seconds}s`
  }
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

export function DeploymentCard({ deployment }: DeploymentCardProps) {
  const progress = Math.round(
    (deployment.completedTenants / deployment.totalTenants) * 100
  )
  const successRate = deployment.totalTenants > 0
    ? Math.round(((deployment.completedTenants) / (deployment.completedTenants + deployment.failedTenants || 1)) * 100)
    : 0

  return (
    <a
      href={`/deployments/${deployment.id}`}
      className="block p-4 hover:bg-slate-50 transition-colors"
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-slate-900">
              {deployment.solutionName}
            </span>
            {deployment.solutionVersion && (
              <span className="text-xs text-slate-400 font-mono">
                v{deployment.solutionVersion}
              </span>
            )}
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                statusStyles[deployment.status]
              }`}
            >
              {statusIcons[deployment.status]}
              {statusLabels[deployment.status]}
            </span>
            {deployment.canRollback && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
                Rollback
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 mt-2 flex-wrap">
            <p className="text-sm text-slate-500">
              <span className="font-medium text-slate-700">{deployment.completedTenants}</span> of{' '}
              <span className="font-medium text-slate-700">{deployment.totalTenants}</span> tenants
              {(deployment.status === 'completed' || deployment.status === 'failed') && deployment.failedTenants === 0 && (
                <span className="ml-1.5 text-emerald-600 font-medium">({successRate}%)</span>
              )}
            </p>
            {deployment.failedTenants > 0 && (
              <span className="inline-flex items-center gap-1 text-sm text-rose-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {deployment.failedTenants} failed
              </span>
            )}
            {deployment.durationMs && (
              <span className="inline-flex items-center gap-1 text-sm text-slate-500">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {formatDuration(deployment.durationMs)}
              </span>
            )}
            {deployment.triggeredBy && (
              <span
                className="inline-flex items-center gap-1 text-xs text-slate-400 px-2 py-0.5 rounded bg-slate-50 hover:bg-slate-100 cursor-help transition-colors"
                title={triggerDescriptions[deployment.triggeredBy]}
              >
                {triggerIcons[deployment.triggeredBy]}
                {triggerLabels[deployment.triggeredBy]}
              </span>
            )}
          </div>
        </div>
        <div className="text-right flex-shrink-0 ml-4">
          <p className="text-sm text-slate-600 font-medium">
            {formatRelativeTime(deployment.createdAt)}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {new Date(deployment.createdAt).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
          <p className="text-xs text-slate-400 font-mono mt-1">
            {deployment.id.slice(0, 8)}
          </p>
        </div>
      </div>
      {deployment.status === 'in_progress' && (
        <div className="mt-3">
          <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
            <div
              className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-slate-500 mt-1 text-right">{progress}% complete</p>
        </div>
      )}
    </a>
  )
}

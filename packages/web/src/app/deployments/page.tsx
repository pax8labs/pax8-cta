'use client'

import React, { Suspense, useState, useMemo, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import useSWR from 'swr'
import Link from 'next/link'
import { toast } from 'sonner'
import { trackEvent, trackDeployment, trackError } from '@/lib/posthog-client'
import { DEPLOYMENT_STATUS_CATEGORIES, DeploymentJob, TenantDeploymentResult } from '@agentsync/core/client'
import { FlaskSpinner } from '@/components/ui/flask-spinner'

const fetcher = (url: string) => fetch(url).then((res) => res.json())

type StatusFilter = 'all' | 'active' | 'pending' | 'issues'

// Map URL param values to internal filter values
const filterUrlMap: Record<string, StatusFilter> = {
  'all': 'all',
  'active': 'active',
  'pending': 'pending',
  'issues': 'issues',
}

interface DeploymentRecord {
  tenantId: string
  tenantName: string
  agentName: string
  agentVersion?: string
  status: string
  deployedAt?: string
  deploymentId: string
  error?: string
}

// Extract tenant-agent deployment records from deployment jobs
function extractDeploymentRecords(deployments: DeploymentJob[]): DeploymentRecord[] {
  const records: DeploymentRecord[] = []

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
          error: result.error,
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

const statusStyles: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  // Active/completed states
  completed: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'deployed' },
  in_progress: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500', label: 'deploying' },

  // Pending action states
  pending: { bg: 'bg-slate-50', text: 'text-slate-600', dot: 'bg-slate-400', label: 'pending' },
  scheduled: { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500', label: 'scheduled' },
  awaiting_approval: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500', label: 'needs approval' },
  approved: { bg: 'bg-teal-50', text: 'text-teal-700', dot: 'bg-teal-500', label: 'approved' },

  // Terminal failure states
  failed: { bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500', label: 'failed' },
  rejected: { bg: 'bg-rose-50', text: 'text-rose-600', dot: 'bg-rose-400', label: 'rejected' },
  cancelled: { bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-500', label: 'cancelled' },

  // Rollback states
  rolling_back: { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500', label: 'rolling back' },
  rolled_back: { bg: 'bg-slate-100', text: 'text-slate-700', dot: 'bg-slate-500', label: 'rolled back' },
}

function StatusBadge({ status, error }: { status: string; error?: string }) {
  const style = statusStyles[status] || statusStyles.pending
  const hasError = error && FAILED_STATUSES.includes(status)

  return (
    <span className="relative group inline-flex items-center">
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${style.bg} ${style.text} ${hasError ? 'cursor-help' : ''}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
        {style.label}
        {hasError && (
          <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
      </span>
      {hasError && (
        <span className="absolute left-0 bottom-full mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-normal max-w-xs z-50 pointer-events-none">
          {error}
          <span className="absolute top-full left-4 border-4 border-transparent border-t-gray-900" />
        </span>
      )}
    </span>
  )
}

// Status categories imported from @agentsync/core for consistency across the app
const ACTIVE_STATUSES = DEPLOYMENT_STATUS_CATEGORIES.ACTIVE as readonly string[]
const PENDING_ACTION_STATUSES = DEPLOYMENT_STATUS_CATEGORIES.PENDING_ACTION as readonly string[]
const FAILED_STATUSES = DEPLOYMENT_STATUS_CATEGORIES.FAILED as readonly string[]
const RETRYABLE_STATUSES = DEPLOYMENT_STATUS_CATEGORIES.RETRYABLE as readonly string[]

// Types for deployment progress tracking
type DeploymentStepId =
  | 'authenticating'
  | 'validating'
  | 'exporting'
  | 'uploading'
  | 'importing'
  | 'configuring'
  | 'verifying'
  | 'completing'

interface TenantProgress {
  tenantId: string
  tenantName: string
  environmentUrl?: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  currentStep: DeploymentStepId | null
  steps: Record<DeploymentStepId, { status: 'pending' | 'in_progress' | 'completed' | 'failed'; startedAt?: string; completedAt?: string; error?: string }>
  error?: string
  startedAt?: string
  completedAt?: string
}

const DEPLOYMENT_STEPS: Record<DeploymentStepId, { label: string; description: string }> = {
  authenticating: { label: 'Authenticating', description: 'Connecting to tenant with GDAP credentials' },
  validating: { label: 'Validating', description: 'Checking environment compatibility and permissions' },
  exporting: { label: 'Exporting', description: 'Exporting solution from source environment' },
  uploading: { label: 'Uploading', description: 'Transferring solution package to target' },
  importing: { label: 'Importing', description: 'Installing solution in target environment' },
  configuring: { label: 'Configuring', description: 'Setting up connection references and variables' },
  verifying: { label: 'Verifying', description: 'Confirming deployment was successful' },
  completing: { label: 'Completing', description: 'Finalizing deployment and cleaning up' },
}

const STEP_ORDER: DeploymentStepId[] = [
  'authenticating', 'validating', 'exporting', 'uploading',
  'importing', 'configuring', 'verifying', 'completing',
]

function calculateDuration(startedAt?: string, completedAt?: string): string {
  if (!startedAt) return '-'
  const start = new Date(startedAt).getTime()
  const end = completedAt ? new Date(completedAt).getTime() : Date.now()
  const durationMs = end - start
  if (durationMs < 1000) return `${durationMs}ms`
  if (durationMs < 60000) return `${Math.round(durationMs / 1000)}s`
  return `${Math.round(durationMs / 60000)}m ${Math.round((durationMs % 60000) / 1000)}s`
}

function getDetailedLogMessage(
  stepId: DeploymentStepId,
  tenant: TenantProgress,
  status: 'started' | 'completed' | 'failed',
  solutionName?: string
): string {
  const tenantShort = tenant.tenantId.slice(0, 8)
  const envDomain = tenant.environmentUrl
    ? new URL(tenant.environmentUrl).hostname.split('.')[0]
    : 'environment'
  const solution = solutionName || 'solution'

  const messages: Record<DeploymentStepId, { started: string; completed: string }> = {
    authenticating: {
      started: `Acquiring GDAP token for tenant ${tenantShort}...`,
      completed: `Authenticated with delegated admin access`,
    },
    validating: {
      started: `Checking ${envDomain} compatibility for ${solution}...`,
      completed: `Environment validated: Power Platform license OK`,
    },
    exporting: {
      started: `Packaging ${solution} from source environment...`,
      completed: `${solution} exported (managed package ready)`,
    },
    uploading: {
      started: `Transferring ${solution} to ${envDomain}.crm.dynamics.com...`,
      completed: `Package uploaded successfully`,
    },
    importing: {
      started: `Installing ${solution} in ${tenant.tenantName}...`,
      completed: `${solution} imported, components registered`,
    },
    configuring: {
      started: `Configuring ${solution} connections and variables...`,
      completed: `Connections bound, environment variables configured`,
    },
    verifying: {
      started: `Running ${solution} health checks...`,
      completed: `All ${solution} components verified healthy`,
    },
    completing: {
      started: `Finalizing ${solution} deployment...`,
      completed: `${solution} deployed to ${tenant.tenantName}`,
    },
  }

  const stepMessages = messages[stepId]
  return status === 'started' ? stepMessages.started : stepMessages.completed
}

// SSE Message types for type-safe parsing
interface SSEMessage {
  type: string
  tenantId?: string
  tenantName?: string
  environmentUrl?: string
  timestamp?: string
  stepId?: string
  error?: string
  message?: string
}

// Retry Progress Modal - shows live terminal log when retrying deployments
function RetryProgressModal({
  isOpen,
  onClose,
  deploymentIds,
  onComplete,
}: {
  isOpen: boolean
  onClose: () => void
  deploymentIds: string[]
  onComplete: () => void
}) {
  const [tenantProgress, setTenantProgress] = React.useState<Map<string, TenantProgress>>(new Map())
  const [deploymentStatus, setDeploymentStatus] = React.useState<'connecting' | 'in_progress' | 'completed' | 'failed'>('connecting')
  const [selectedTenantId, setSelectedTenantId] = React.useState<string | null>(null)
  const eventSourceRef = React.useRef<EventSource | null>(null)
  const [completedDeployments, setCompletedDeployments] = React.useState(0)
  const mountedRef = React.useRef(true)

  // Track mounted state to prevent state updates after unmount
  React.useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Connect to SSE for each deployment being retried
  React.useEffect(() => {
    if (!isOpen || deploymentIds.length === 0) return

    setDeploymentStatus('connecting')
    setTenantProgress(new Map())
    setCompletedDeployments(0)

    let completedCount = 0

    // For now, just connect to the first deployment's progress
    // (Multi-deployment support can be added later)
    const deploymentId = deploymentIds[0]
    const eventSource = new EventSource(`/api/deployments/${deploymentId}/progress?k=${Date.now()}`)
    eventSourceRef.current = eventSource

    eventSource.onopen = () => {
      if (mountedRef.current) {
        setDeploymentStatus('in_progress')
      }
    }

    eventSource.onmessage = (event) => {
      // Don't process messages if component is unmounted
      if (!mountedRef.current) return

      // Parse SSE data with error handling
      let data: SSEMessage
      try {
        data = JSON.parse(event.data) as SSEMessage
      } catch (parseError) {
        console.error('Failed to parse SSE message:', parseError, event.data)
        return
      }

      // Validate required fields for tenant events
      const tenantId = data.tenantId
      if (!tenantId && data.type !== 'deployment_completed' && data.type !== 'error') {
        console.warn('SSE message missing tenantId:', data)
        return
      }

      switch (data.type) {
        case 'tenant_started':
          if (!tenantId) return
          setTenantProgress(prev => {
            const newMap = new Map(prev)
            newMap.set(tenantId, {
              tenantId,
              tenantName: data.tenantName || 'Unknown',
              environmentUrl: data.environmentUrl,
              status: 'in_progress',
              currentStep: null,
              startedAt: data.timestamp,
              steps: Object.keys(DEPLOYMENT_STEPS).reduce((acc, key) => ({
                ...acc,
                [key]: { status: 'pending' }
              }), {} as TenantProgress['steps'])
            })
            // Auto-select first tenant
            setSelectedTenantId(prev => prev || tenantId)
            return newMap
          })
          break

        case 'step_started':
          if (!tenantId) return
          setTenantProgress(prev => {
            const newMap = new Map(prev)
            const tenant = newMap.get(tenantId)
            if (tenant && data.stepId) {
              newMap.set(tenantId, {
                ...tenant,
                currentStep: data.stepId as DeploymentStepId,
                steps: {
                  ...tenant.steps,
                  [data.stepId]: { status: 'in_progress', startedAt: data.timestamp }
                }
              })
            }
            return newMap
          })
          break

        case 'step_completed':
          if (!tenantId) return
          setTenantProgress(prev => {
            const newMap = new Map(prev)
            const tenant = newMap.get(tenantId)
            if (tenant && data.stepId) {
              newMap.set(tenantId, {
                ...tenant,
                steps: {
                  ...tenant.steps,
                  [data.stepId]: { status: 'completed', startedAt: tenant.steps[data.stepId as DeploymentStepId]?.startedAt, completedAt: data.timestamp }
                }
              })
            }
            return newMap
          })
          break

        case 'step_failed':
          if (!tenantId) return
          setTenantProgress(prev => {
            const newMap = new Map(prev)
            const tenant = newMap.get(tenantId)
            if (tenant && data.stepId) {
              newMap.set(tenantId, {
                ...tenant,
                status: 'failed',
                error: data.error,
                steps: {
                  ...tenant.steps,
                  [data.stepId]: { status: 'failed', error: data.error, startedAt: tenant.steps[data.stepId as DeploymentStepId]?.startedAt, completedAt: data.timestamp }
                }
              })
            }
            return newMap
          })
          break

        case 'tenant_completed':
          if (!tenantId) return
          setTenantProgress(prev => {
            const newMap = new Map(prev)
            const tenant = newMap.get(tenantId)
            if (tenant) {
              newMap.set(tenantId, {
                ...tenant,
                status: 'completed',
                completedAt: data.timestamp,
                currentStep: null,
              })
            }
            return newMap
          })
          break

        case 'tenant_failed':
          if (!tenantId) return
          setTenantProgress(prev => {
            const newMap = new Map(prev)
            const tenant = newMap.get(tenantId)
            if (tenant) {
              newMap.set(tenantId, {
                ...tenant,
                status: 'failed',
                error: data.error,
                completedAt: data.timestamp,
                currentStep: null,
              })
            }
            return newMap
          })
          break

        case 'deployment_completed':
          completedCount++
          setCompletedDeployments(completedCount)
          if (completedCount >= deploymentIds.length) {
            setDeploymentStatus('completed')
          }
          break

        case 'error':
          console.error('SSE error:', data.message)
          break
      }
    }

    eventSource.onerror = () => {
      eventSource.close()
      // If we never got past connecting, mark as failed
      if (mountedRef.current) {
        setDeploymentStatus(prev => prev === 'connecting' ? 'failed' : prev)
      }
    }

    return () => {
      eventSource.close()
      eventSourceRef.current = null
    }
  }, [isOpen, deploymentIds])

  // Get current tenant progress
  const tenants = Array.from(tenantProgress.values())
  const selectedTenant = selectedTenantId ? tenantProgress.get(selectedTenantId) : tenants[0]
  const completedTenants = tenants.filter(t => t.status === 'completed').length
  const failedTenants = tenants.filter(t => t.status === 'failed').length
  const inProgressTenants = tenants.filter(t => t.status === 'in_progress').length
  const isComplete = deploymentStatus === 'completed' || deploymentStatus === 'failed'

  if (!isOpen) return null

  const formatLogTime = (timestamp?: string) => {
    if (!timestamp) return ''
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black/50" onClick={isComplete ? onClose : undefined} />

        {/* Modal */}
        <div className="relative bg-slate-900 rounded-lg shadow-xl w-full max-w-3xl overflow-hidden">
          {/* Mac-style title bar */}
          <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={onClose}
                  className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-600 transition-colors"
                  title="Close"
                />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
              </div>
              <span className="ml-3 text-slate-400 text-sm font-medium">
                Retry Progress
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              {inProgressTenants > 0 && (
                <span className="text-yellow-400">{inProgressTenants} in progress</span>
              )}
              {completedTenants > 0 && (
                <span className="text-emerald-400">{completedTenants} done</span>
              )}
              {failedTenants > 0 && (
                <span className="text-red-400">{failedTenants} failed</span>
              )}
            </div>
          </div>

          {/* Tenant tabs */}
          {tenants.length > 1 && (
            <div className="flex gap-1 px-4 pt-2 bg-slate-850 border-b border-slate-700 overflow-x-auto">
              {tenants.map(tenant => (
                <button
                  key={tenant.tenantId}
                  onClick={() => setSelectedTenantId(tenant.tenantId)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-t transition-colors flex items-center gap-1.5 ${
                    selectedTenantId === tenant.tenantId
                      ? 'bg-slate-900 text-slate-200'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-300'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    tenant.status === 'completed' ? 'bg-emerald-400' :
                    tenant.status === 'failed' ? 'bg-red-400' :
                    tenant.status === 'in_progress' ? 'bg-yellow-400 animate-pulse' :
                    'bg-slate-500'
                  }`} />
                  {tenant.tenantName.length > 20 ? tenant.tenantName.slice(0, 20) + '...' : tenant.tenantName}
                </button>
              ))}
            </div>
          )}

          {/* Terminal content */}
          <div className="p-4 font-mono text-sm min-h-[300px] max-h-[400px] overflow-y-auto">
            {deploymentStatus === 'connecting' ? (
              <div className="flex items-center justify-center h-full text-slate-500">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
                  Connecting to deployment stream...
                </div>
              </div>
            ) : tenants.length === 0 ? (
              <div className="flex items-center justify-center h-full text-slate-500">
                Waiting for deployment to start...
              </div>
            ) : selectedTenant ? (
              <div className="text-slate-300">
                {/* Tenant header line */}
                <div className="flex items-center gap-2 mb-3 text-slate-400">
                  <span className="text-blue-400">$</span>
                  <span>
                    agentsync deploy <span className="text-emerald-400">solution</span>{' '}
                    --tenant <span className="text-cyan-400">{selectedTenant.tenantId.slice(0, 8)}</span>{' '}
                    <span className="text-slate-500"># {selectedTenant.tenantName}</span>
                  </span>
                  {selectedTenant.startedAt && (
                    <span className="ml-auto text-slate-500">[{calculateDuration(selectedTenant.startedAt, selectedTenant.completedAt)}]</span>
                  )}
                </div>

                {/* Error banner if failed */}
                {selectedTenant.status === 'failed' && selectedTenant.error && (
                  <div className="mb-3 px-3 py-2 bg-red-950/50 border border-red-800/50 rounded text-red-300">
                    <span className="text-red-400">ERROR:</span> {selectedTenant.error}
                  </div>
                )}

                {/* Step logs */}
                <div className="space-y-1">
                  {STEP_ORDER.map(stepId => {
                    const step = selectedTenant.steps[stepId]
                    const isStepActive = step?.status === 'in_progress'
                    const isStepDone = step?.status === 'completed'
                    const isStepFailed = step?.status === 'failed'
                    const isPending = !step || step.status === 'pending'

                    if (isPending) return null

                    const logMessage = getDetailedLogMessage(
                      stepId,
                      selectedTenant,
                      isStepActive ? 'started' : isStepDone ? 'completed' : 'failed'
                    )

                    return (
                      <div key={stepId} className="flex items-start gap-3">
                        <span className="text-slate-600 shrink-0 w-16">
                          {step?.startedAt ? formatLogTime(step.startedAt) : ''}
                        </span>
                        <span className="shrink-0 w-4">
                          {isStepActive ? (
                            <span className="text-yellow-400">●</span>
                          ) : isStepDone ? (
                            <span className="text-emerald-400">✓</span>
                          ) : isStepFailed ? (
                            <span className="text-red-400">✗</span>
                          ) : null}
                        </span>
                        <span className={`flex-1 ${
                          isStepActive ? 'text-yellow-200' :
                          isStepDone ? 'text-slate-400' :
                          isStepFailed ? 'text-red-300' :
                          'text-slate-500'
                        }`}>
                          {logMessage}
                          {isStepActive && <span className="animate-pulse">...</span>}
                        </span>
                      </div>
                    )
                  })}
                </div>

                {/* Blinking cursor when active */}
                {selectedTenant.status === 'in_progress' && (
                  <div className="flex items-center gap-3 mt-3 text-slate-500">
                    <span className="w-16"></span>
                    <span className="w-4"></span>
                    <span className="animate-pulse">▋</span>
                  </div>
                )}

                {/* Completion message */}
                {selectedTenant.status === 'completed' && (
                  <div className="mt-3 text-emerald-400">
                    ✓ Deployment completed successfully
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-t border-slate-700">
            <div className="text-xs text-slate-500">
              {isComplete ? (
                completedTenants === tenants.length ? (
                  <span className="text-emerald-400">All deployments completed successfully</span>
                ) : failedTenants > 0 ? (
                  <span className="text-amber-400">{completedTenants} succeeded, {failedTenants} failed</span>
                ) : (
                  <span>Deployment finished</span>
                )
              ) : (
                <span>Deploying to {tenants.length} tenant{tenants.length !== 1 ? 's' : ''}...</span>
              )}
            </div>
            <button
              onClick={() => {
                onClose()
                if (isComplete) onComplete()
              }}
              className={`px-4 py-1.5 text-sm font-medium rounded transition-colors ${
                isComplete
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
              }`}
            >
              {isComplete ? 'Done' : 'Close'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

type ViewMode = 'tenants' | 'batches'

function DeploymentsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  // Initialize filter from URL param
  const initialFilter = filterUrlMap[searchParams.get('filter') || ''] || 'all'
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialFilter)
  const [viewMode, setViewMode] = useState<ViewMode>('batches')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRecords, setSelectedRecords] = useState<Set<string>>(new Set())
  const [expandedRecords, setExpandedRecords] = useState<Set<string>>(new Set())
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set())
  const [bulkRetrying, setBulkRetrying] = useState(false)
  const [bulkMessage, setBulkMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [retryModalOpen, setRetryModalOpen] = useState(false)
  const [retryDeploymentIds, setRetryDeploymentIds] = useState<string[]>([])

  // Sync URL with filter changes
  useEffect(() => {
    const currentParam = searchParams.get('filter')
    const expectedParam = statusFilter === 'all' ? null : statusFilter
    if (currentParam !== expectedParam) {
      const params = new URLSearchParams(searchParams.toString())
      if (expectedParam) {
        params.set('filter', expectedParam)
      } else {
        params.delete('filter')
      }
      router.replace(`/deployments${params.toString() ? '?' + params.toString() : ''}`, { scroll: false })
    }
  }, [statusFilter, searchParams, router])

  // Disable auto-refresh on Issues tab to prevent confusion after retries
  const refreshInterval = statusFilter === 'issues' ? 30000 : 5000
  const { data, error, isLoading, mutate } = useSWR('/api/deployments?limit=100', fetcher, { refreshInterval })
  const deployments = data?.deployments ?? []

  const records = useMemo(() => extractDeploymentRecords(deployments), [deployments])

  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      // Status filter - using category groupings
      if (statusFilter === 'active' && !ACTIVE_STATUSES.includes(r.status)) return false
      if (statusFilter === 'pending' && !PENDING_ACTION_STATUSES.includes(r.status)) return false
      if (statusFilter === 'issues' && !FAILED_STATUSES.includes(r.status)) return false

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

  // Get retryable records (failed or cancelled)
  const retryableRecords = useMemo(() => {
    return filteredRecords.filter(r => RETRYABLE_STATUSES.includes(r.status))
  }, [filteredRecords])

  // Stats using category groupings
  const stats = useMemo(() => {
    const active = records.filter(r => ACTIVE_STATUSES.includes(r.status)).length
    const pendingAction = records.filter(r => PENDING_ACTION_STATUSES.includes(r.status)).length
    const failed = records.filter(r => FAILED_STATUSES.includes(r.status)).length
    return { active, pendingAction, failed, total: records.length }
  }, [records])

  // Batch-level stats
  const batchStats = useMemo(() => {
    const inProgress = deployments.filter((d: DeploymentJob) => d.status === 'in_progress').length
    const completed = deployments.filter((d: DeploymentJob) => d.status === 'completed').length
    const withFailures = deployments.filter((d: DeploymentJob) =>
      d.status === 'completed' && d.tenantResults?.some((r: TenantDeploymentResult) => FAILED_STATUSES.includes(r.status))
    ).length
    return { inProgress, completed, withFailures, total: deployments.length }
  }, [deployments])

  // Filter batches based on status filter
  const filteredBatches = useMemo(() => {
    return deployments.filter((d: DeploymentJob) => {
      if (statusFilter === 'all') return true
      if (statusFilter === 'active') return d.status === 'in_progress' || d.status === 'completed'
      if (statusFilter === 'pending') return d.status === 'pending' || d.status === 'scheduled'
      if (statusFilter === 'issues') {
        return d.tenantResults?.some((r: TenantDeploymentResult) => FAILED_STATUSES.includes(r.status))
      }
      return true
    }).filter((d: DeploymentJob) => {
      if (!searchQuery) return true
      const q = searchQuery.toLowerCase()
      return d.solutionName?.toLowerCase().includes(q) ||
        d.tenantResults?.some((r: TenantDeploymentResult) => r.tenantName?.toLowerCase().includes(q))
    })
  }, [deployments, statusFilter, searchQuery])

  const statusOptions: { value: StatusFilter; label: string; count: number }[] = viewMode === 'tenants' ? [
    { value: 'all', label: 'All', count: stats.total },
    { value: 'active', label: 'Active', count: stats.active },
    { value: 'pending', label: 'Pending', count: stats.pendingAction },
    { value: 'issues', label: 'Issues', count: stats.failed },
  ] : [
    { value: 'all', label: 'All', count: batchStats.total },
    { value: 'active', label: 'Active', count: batchStats.inProgress + batchStats.completed },
    { value: 'pending', label: 'Pending', count: deployments.filter((d: DeploymentJob) => d.status === 'pending').length },
    { value: 'issues', label: 'Issues', count: batchStats.withFailures },
  ]

  // Clear selection when filter changes
  const handleFilterChange = (filter: StatusFilter) => {
    setStatusFilter(filter)
    setSelectedRecords(new Set())
    setBulkMessage(null)

    // Track filter change
    trackEvent('filter_applied', {
      properties: {
        filter_type: 'status',
        filter_value: filter,
        result_count: filter === 'all' ? stats.total :
          filter === 'active' ? stats.active :
          filter === 'pending' ? stats.pendingAction : stats.failed,
      },
    })
  }

  // Toggle record selection
  const toggleRecord = (recordKey: string) => {
    setSelectedRecords(prev => {
      const next = new Set(prev)
      if (next.has(recordKey)) {
        next.delete(recordKey)
      } else {
        next.add(recordKey)
      }
      return next
    })
  }

  // Toggle expanded row (for showing error details)
  const toggleExpanded = (recordKey: string) => {
    setExpandedRecords(prev => {
      const next = new Set(prev)
      if (next.has(recordKey)) {
        next.delete(recordKey)
      } else {
        next.add(recordKey)
      }
      return next
    })
  }

  // Toggle expanded batch
  const toggleBatchExpanded = (batchId: string) => {
    setExpandedBatches(prev => {
      const next = new Set(prev)
      if (next.has(batchId)) {
        next.delete(batchId)
      } else {
        next.add(batchId)
      }
      return next
    })
  }

  // Select all retryable records
  const selectAllRetryable = () => {
    if (selectedRecords.size === retryableRecords.length) {
      setSelectedRecords(new Set())
    } else {
      setSelectedRecords(new Set(retryableRecords.map(r => `${r.deploymentId}:${r.tenantId}`)))
    }
  }

  // Bulk retry selected deployments
  const handleBulkRetry = async () => {
    if (selectedRecords.size === 0) return

    setBulkRetrying(true)
    setBulkMessage(null)

    // Group selected records by deploymentId
    // Key format is "deploymentId:tenantId" (using colon as separator since IDs can contain hyphens)
    const byDeployment = new Map<string, string[]>()
    for (const key of selectedRecords) {
      const separatorIndex = key.lastIndexOf(':')
      if (separatorIndex === -1) continue
      const deploymentId = key.substring(0, separatorIndex)
      const tenantId = key.substring(separatorIndex + 1)
      if (!byDeployment.has(deploymentId)) {
        byDeployment.set(deploymentId, [])
      }
      byDeployment.get(deploymentId)!.push(tenantId)
    }

    const deploymentIds = Array.from(byDeployment.keys())
    let successCount = 0
    let errorCount = 0
    const errors: string[] = []
    const successfulIds: string[] = []

    // Retry each deployment
    for (const deploymentId of deploymentIds) {
      try {
        const response = await fetch(`/api/deployments/${deploymentId}/retry`, { method: 'POST' })
        if (response.ok) {
          successCount++
          successfulIds.push(deploymentId)
        } else {
          errorCount++
          const data = await response.json().catch(() => ({}))
          errors.push(data.error || `Failed to retry ${deploymentId}`)
        }
      } catch (err) {
        errorCount++
        errors.push(err instanceof Error ? err.message : 'Network error')
      }
    }

    // Log errors for debugging
    if (errors.length > 0) {
      console.error('Retry errors:', errors)
    }

    setBulkRetrying(false)
    setSelectedRecords(new Set())

    // Track bulk retry action
    trackEvent('bulk_action_used', {
      properties: {
        action: 'retry',
        total_count: byDeployment.size,
        success_count: successCount,
        error_count: errorCount,
      },
    })

    // If we had successful retries, show the progress modal
    if (successfulIds.length > 0) {
      setRetryDeploymentIds(successfulIds)
      setRetryModalOpen(true)
      if (errorCount > 0) {
        toast.warning(`Retrying ${successCount} deployments. ${errorCount} failed to start.`)
      } else {
        toast.success(`Retrying ${successCount} deployment${successCount > 1 ? 's' : ''}`)
      }
    } else if (errorCount > 0) {
      // Only show error message if all retries failed
      const errorDetail = errors[0] || 'Unknown error'
      toast.error(`Failed to retry: ${errorDetail}`)
      trackError('Bulk retry failed', { deployment_count: errorCount, first_error: errorDetail })
    }
  }

  // Handle modal close and refresh
  const handleRetryModalClose = () => {
    setRetryModalOpen(false)
    setRetryDeploymentIds([])
  }

  const handleRetryComplete = () => {
    mutate() // Refresh the deployment list
  }

  // Show selection UI when viewing Issues filter (always show button, but disable when empty)
  const showSelectionUI = statusFilter === 'issues'

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
        {/* View mode toggle */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setViewMode('batches')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 ${
              viewMode === 'batches'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            Batches
          </button>
          <button
            onClick={() => setViewMode('tenants')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 ${
              viewMode === 'tenants'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            By Tenant
          </button>
        </div>

        <div className="border-l border-gray-300 h-6" />

        {/* Status filter */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {statusOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleFilterChange(opt.value)}
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

        {/* Bulk actions for Issues view */}
        {showSelectionUI && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => { mutate(); setBulkMessage(null); }}
              className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
            <button
              onClick={handleBulkRetry}
              disabled={bulkRetrying || selectedRecords.size === 0}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {bulkRetrying ? 'Retrying...' : selectedRecords.size > 0 ? `Retry ${selectedRecords.size} Selected` : 'Retry Selected'}
            </button>
            {bulkMessage && (
              <span className={`text-sm ${bulkMessage.type === 'error' ? 'text-rose-600' : 'text-emerald-600'}`}>
                {bulkMessage.text}
              </span>
            )}
          </div>
        )}

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
        <div className="bg-white rounded-lg border border-gray-200 p-8">
          <FlaskSpinner size="md" message="Loading deployments..." className="py-4" />
        </div>
      ) : (viewMode === 'batches' ? filteredBatches.length : filteredRecords.length) === 0 ? (
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
      ) : viewMode === 'batches' ? (
        /* Batch View - Shows deployment jobs with inline progress */
        <div className="space-y-3">
          {filteredBatches.map((deployment: DeploymentJob) => {
            const isExpanded = expandedBatches.has(deployment.id)
            const tenantResults = deployment.tenantResults || []
            const totalTenants = tenantResults.length
            const completedTenants = tenantResults.filter((r: TenantDeploymentResult) => r.status === 'completed').length
            const failedTenants = tenantResults.filter((r: TenantDeploymentResult) => FAILED_STATUSES.includes(r.status)).length
            const pendingTenants = totalTenants - completedTenants - failedTenants
            const isInProgress = deployment.status === 'in_progress'
            const hasIssues = failedTenants > 0

            return (
              <div key={deployment.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                {/* Batch header row */}
                <div
                  className={`px-4 py-3 flex items-center gap-4 cursor-pointer hover:bg-gray-50 ${isExpanded ? 'border-b border-gray-200' : ''}`}
                  onClick={() => toggleBatchExpanded(deployment.id)}
                >
                  {/* Expand/collapse icon */}
                  <svg
                    className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>

                  {/* Agent name and version */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{deployment.solutionName}</span>
                      {deployment.solutionVersion && (
                        <span className="text-xs text-gray-400 font-mono">v{deployment.solutionVersion}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5" suppressHydrationWarning>
                      {formatTimeAgo(deployment.createdAt)} · {totalTenants} tenant{totalTenants !== 1 ? 's' : ''}
                    </p>
                  </div>

                  {/* Progress counters - Total / Pending / Succeeded / Failed */}
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-gray-600 font-medium">{totalTenants}</span>
                    <span className="text-gray-300">/</span>
                    <span className={`${pendingTenants > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                      {pendingTenants}
                    </span>
                    <span className="text-gray-300">/</span>
                    <span className={`${completedTenants > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                      {completedTenants}
                    </span>
                    <span className="text-gray-300">/</span>
                    <span className={`${failedTenants > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {failedTenants}
                    </span>
                  </div>

                  {/* Mini progress bar */}
                  <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden flex">
                    {completedTenants > 0 && (
                      <div
                        className="h-full bg-green-500"
                        style={{ width: `${(completedTenants / totalTenants) * 100}%` }}
                      />
                    )}
                    {failedTenants > 0 && (
                      <div
                        className="h-full bg-red-500"
                        style={{ width: `${(failedTenants / totalTenants) * 100}%` }}
                      />
                    )}
                  </div>

                  {/* Status badge */}
                  <span
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${
                      isInProgress
                        ? 'bg-blue-50 text-blue-700'
                        : hasIssues
                        ? 'bg-red-50 text-red-700'
                        : 'bg-green-50 text-green-700'
                    }`}
                  >
                    {isInProgress && (
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                    )}
                    {isInProgress ? 'In Progress' : hasIssues ? `${failedTenants} Failed` : 'Completed'}
                  </span>

                  {/* View details link */}
                  <Link
                    href={`/deployments/${deployment.id}`}
                    className="text-sm text-blue-600 hover:text-blue-800"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Details
                  </Link>
                </div>

                {/* Expanded tenant details */}
                {isExpanded && (
                  <div className="divide-y divide-gray-100">
                    {tenantResults.map((result: TenantDeploymentResult) => {
                      const isFailed = FAILED_STATUSES.includes(result.status)
                      return (
                        <div
                          key={result.tenantId}
                          className={`px-4 py-2 flex items-center gap-4 ${isFailed ? 'bg-red-50' : 'bg-gray-50'}`}
                        >
                          <div className="w-4" /> {/* Spacer to align with chevron */}
                          <div className="flex-1">
                            <span className="text-sm text-gray-900">{result.tenantName}</span>
                            {isFailed && result.error && (
                              <p className="text-xs text-red-600 mt-0.5 truncate" title={result.error}>
                                {result.error}
                              </p>
                            )}
                          </div>
                          <StatusBadge status={result.status} error={result.error} />
                          <span className="text-xs text-gray-400 w-16 text-right" suppressHydrationWarning>
                            {formatTimeAgo(result.completedAt || result.startedAt)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        /* Tenant View - Original table showing individual tenant-agent records */
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {showSelectionUI && (
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={selectedRecords.size === retryableRecords.length && retryableRecords.length > 0}
                      onChange={selectAllRetryable}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                )}
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
              {filteredRecords.map((record, idx) => {
                const recordKey = `${record.deploymentId}:${record.tenantId}`
                const isRetryable = RETRYABLE_STATUSES.includes(record.status)
                const isSelected = selectedRecords.has(recordKey)
                const isExpanded = expandedRecords.has(recordKey)
                const hasError = record.error && FAILED_STATUSES.includes(record.status)

                return (
                  <React.Fragment key={recordKey}>
                    <tr
                      className={`hover:bg-gray-50 ${hasError ? 'cursor-pointer' : ''} ${isExpanded ? 'bg-gray-50' : ''}`}
                      onClick={() => hasError && toggleExpanded(recordKey)}
                    >
                      {showSelectionUI && (
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          {isRetryable ? (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleRecord(recordKey)}
                              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                          ) : (
                            <span className="w-4 h-4 block" />
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {hasError && (
                            <svg
                              className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          )}
                          <span className="font-medium text-gray-900">{record.tenantName}</span>
                        </div>
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
                        <StatusBadge status={record.status} error={record.error} />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500" suppressHydrationWarning>
                        {formatTimeAgo(record.deployedAt)}
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <Link
                          href={`/deployments/${record.deploymentId}`}
                          className="text-sm text-blue-600 hover:text-blue-800"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                    {/* Expanded error details row */}
                    {isExpanded && hasError && (
                      <tr className="bg-slate-900">
                        <td colSpan={showSelectionUI ? 6 : 5} className="px-4 py-3">
                          <div className="font-mono text-sm">
                            <div className="flex items-center gap-2 text-slate-400 mb-2">
                              <span className="text-blue-400">$</span>
                              <span>
                                agentsync deploy <span className="text-emerald-400">{record.agentName}</span>{' '}
                                --tenant <span className="text-cyan-400">{record.tenantId.slice(0, 8)}</span>{' '}
                                <span className="text-slate-500"># {record.tenantName}</span>
                              </span>
                            </div>
                            <div className="flex items-start gap-2 text-red-300">
                              <span className="text-red-400 shrink-0">✗</span>
                              <span className="break-words">{record.error}</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Retry Progress Modal */}
      <RetryProgressModal
        isOpen={retryModalOpen}
        onClose={handleRetryModalClose}
        deploymentIds={retryDeploymentIds}
        onComplete={handleRetryComplete}
      />
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
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <FlaskSpinner size="md" message="Loading..." className="py-4" />
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

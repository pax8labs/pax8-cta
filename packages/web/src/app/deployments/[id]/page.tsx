'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useParams } from 'next/navigation'
import useSWR from 'swr'

// Animated counter that smoothly transitions between values
function AnimatedCounter({
  value,
  duration = 500,
  className = '',
}: {
  value: number
  duration?: number
  className?: string
}) {
  const [displayValue, setDisplayValue] = useState(value)
  const previousValue = useRef(value)

  useEffect(() => {
    if (previousValue.current === value) return

    const startValue = previousValue.current
    const endValue = value
    const startTime = Date.now()

    const animate = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)

      // Ease out cubic for smooth deceleration
      const easeOut = 1 - Math.pow(1 - progress, 3)
      const currentValue = Math.round(startValue + (endValue - startValue) * easeOut)

      setDisplayValue(currentValue)

      if (progress < 1) {
        requestAnimationFrame(animate)
      } else {
        previousValue.current = value
      }
    }

    requestAnimationFrame(animate)
  }, [value, duration])

  return <span className={className}>{displayValue}</span>
}

// Client-safe type definitions (duplicated to avoid importing Node.js code from core)
type DeploymentStepId =
  | 'authenticating'
  | 'validating'
  | 'exporting'
  | 'uploading'
  | 'importing'
  | 'configuring'
  | 'verifying'
  | 'completing'

interface TenantDeploymentResult {
  tenantId: string
  tenantName: string
  status: string
  startedAt?: string
  completedAt?: string
  error?: string
}

const DEPLOYMENT_STEPS: Record<DeploymentStepId, { label: string; description: string }> = {
  authenticating: {
    label: 'Authenticating',
    description: 'Connecting to tenant with GDAP credentials',
  },
  validating: {
    label: 'Validating',
    description: 'Checking environment compatibility and permissions',
  },
  exporting: {
    label: 'Exporting',
    description: 'Exporting solution from source environment',
  },
  uploading: {
    label: 'Uploading',
    description: 'Transferring solution package to target',
  },
  importing: {
    label: 'Importing',
    description: 'Installing solution in target environment',
  },
  configuring: {
    label: 'Configuring',
    description: 'Setting up connection references and variables',
  },
  verifying: {
    label: 'Verifying',
    description: 'Confirming deployment was successful',
  },
  completing: {
    label: 'Completing',
    description: 'Finalizing deployment and cleaning up',
  },
}

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

export default function DeploymentDetailPage() {
  const params = useParams()
  const id = params.id as string
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showLiveProgress, setShowLiveProgress] = useState(false)
  const [liveProgress, setLiveProgress] = useState<Map<string, TenantProgress>>(new Map())
  const [liveComplete, setLiveComplete] = useState(false)
  const [selectedTenant, setSelectedTenant] = useState<TenantProgress | null>(null)
  const [sseKey, setSseKey] = useState(0) // Used to force new SSE connections
  const eventSourceRef = useRef<EventSource | null>(null)

  const { data: deployment, error, isLoading, mutate } = useSWR(
    `/api/deployments/${id}`,
    fetcher,
    { refreshInterval: showLiveProgress ? 0 : 3000 }
  )

  // Initialize live progress when deployment is in progress or pending
  useEffect(() => {
    if (deployment && (deployment.status === 'in_progress' || deployment.status === 'pending') && !showLiveProgress && !liveComplete) {
      // Show live progress for any active deployment
      setShowLiveProgress(true)
    }
  }, [deployment, showLiveProgress, liveComplete])

  // Connect to SSE for live progress updates
  useEffect(() => {
    if (!showLiveProgress || liveComplete) return

    // Add sseKey to URL to bust any caching and force fresh connection
    const eventSource = new EventSource(`/api/deployments/${id}/progress?k=${sseKey}`)
    eventSourceRef.current = eventSource

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data)

      switch (data.type) {
        case 'tenant_started':
          setLiveProgress(prev => {
            const newMap = new Map(prev)
            newMap.set(data.tenantId, {
              tenantId: data.tenantId,
              tenantName: data.tenantName,
              environmentUrl: data.environmentUrl,
              status: 'in_progress',
              currentStep: null,
              startedAt: data.timestamp,
              steps: Object.keys(DEPLOYMENT_STEPS).reduce((acc, key) => ({
                ...acc,
                [key]: { status: 'pending' }
              }), {} as TenantProgress['steps'])
            })
            return newMap
          })
          break

        case 'step_started':
          setLiveProgress(prev => {
            const newMap = new Map(prev)
            let tenant = newMap.get(data.tenantId)
            // Create tenant if it doesn't exist (in case tenant_started was missed)
            if (!tenant) {
              tenant = {
                tenantId: data.tenantId,
                tenantName: data.tenantName || 'Unknown',
                environmentUrl: data.environmentUrl,
                status: 'in_progress',
                currentStep: null,
                startedAt: data.timestamp,
                steps: Object.keys(DEPLOYMENT_STEPS).reduce((acc, key) => ({
                  ...acc,
                  [key]: { status: 'pending' }
                }), {} as TenantProgress['steps'])
              }
            }
            tenant.currentStep = data.stepId
            tenant.steps[data.stepId as DeploymentStepId] = {
              ...tenant.steps[data.stepId as DeploymentStepId],
              status: 'in_progress',
              startedAt: data.timestamp
            }
            newMap.set(data.tenantId, { ...tenant })
            return newMap
          })
          break

        case 'step_completed':
          setLiveProgress(prev => {
            const newMap = new Map(prev)
            let tenant = newMap.get(data.tenantId)
            // Create tenant if it doesn't exist (in case tenant_started was missed)
            if (!tenant) {
              tenant = {
                tenantId: data.tenantId,
                tenantName: data.tenantName || 'Unknown',
                environmentUrl: data.environmentUrl,
                status: 'in_progress',
                currentStep: null,
                startedAt: data.timestamp,
                steps: Object.keys(DEPLOYMENT_STEPS).reduce((acc, key) => ({
                  ...acc,
                  [key]: { status: 'pending' }
                }), {} as TenantProgress['steps'])
              }
            }
            tenant.steps[data.stepId as DeploymentStepId] = {
              ...tenant.steps[data.stepId as DeploymentStepId],
              status: 'completed',
              completedAt: data.timestamp
            }
            newMap.set(data.tenantId, { ...tenant })
            return newMap
          })
          break

        case 'step_failed':
          setLiveProgress(prev => {
            const newMap = new Map(prev)
            const tenant = newMap.get(data.tenantId)
            if (tenant) {
              tenant.steps[data.stepId as DeploymentStepId] = {
                ...tenant.steps[data.stepId as DeploymentStepId],
                status: 'failed',
                completedAt: data.timestamp,
                error: data.error
              }
              newMap.set(data.tenantId, { ...tenant })
            }
            return newMap
          })
          break

        case 'tenant_completed':
          setLiveProgress(prev => {
            const newMap = new Map(prev)
            let tenant = newMap.get(data.tenantId)
            // Create tenant if it doesn't exist
            if (!tenant) {
              tenant = {
                tenantId: data.tenantId,
                tenantName: data.tenantName || 'Unknown',
                environmentUrl: data.environmentUrl,
                status: 'in_progress',
                currentStep: null,
                startedAt: data.timestamp,
                steps: Object.keys(DEPLOYMENT_STEPS).reduce((acc, key) => ({
                  ...acc,
                  [key]: { status: 'pending' }
                }), {} as TenantProgress['steps'])
              }
            }
            tenant.status = 'completed'
            tenant.currentStep = null
            tenant.completedAt = data.timestamp
            // Mark all pending steps as completed (in case step events were missed)
            Object.keys(tenant.steps).forEach(stepId => {
              if (tenant!.steps[stepId as DeploymentStepId].status === 'pending' ||
                  tenant!.steps[stepId as DeploymentStepId].status === 'in_progress') {
                tenant!.steps[stepId as DeploymentStepId] = {
                  ...tenant!.steps[stepId as DeploymentStepId],
                  status: 'completed',
                  completedAt: data.timestamp
                }
              }
            })
            newMap.set(data.tenantId, { ...tenant })
            return newMap
          })
          break

        case 'tenant_failed':
          setLiveProgress(prev => {
            const newMap = new Map(prev)
            let tenant = newMap.get(data.tenantId)
            // Create tenant if it doesn't exist (in case step events were missed)
            if (!tenant) {
              tenant = {
                tenantId: data.tenantId,
                tenantName: data.tenantName || 'Unknown',
                environmentUrl: data.environmentUrl,
                status: 'in_progress',
                currentStep: null,
                startedAt: data.timestamp,
                steps: Object.keys(DEPLOYMENT_STEPS).reduce((acc, key) => ({
                  ...acc,
                  [key]: { status: 'pending' }
                }), {} as TenantProgress['steps'])
              }
            }
            tenant.status = 'failed'
            tenant.currentStep = null
            tenant.error = data.error
            tenant.completedAt = data.timestamp
            newMap.set(data.tenantId, { ...tenant })
            return newMap
          })
          break

        case 'deployment_completed':
          setLiveComplete(true)
          setShowLiveProgress(false)
          mutate() // Refresh final deployment data
          eventSource.close()
          break

        case 'info':
          // No pending tenants or other info - close and refresh
          console.log('SSE info:', data.message)
          setLiveComplete(true)
          setShowLiveProgress(false)
          mutate()
          eventSource.close()
          break

        case 'error':
          // Error occurred - close and refresh
          console.error('SSE error:', data.message)
          setLiveComplete(true)
          setShowLiveProgress(false)
          mutate()
          eventSource.close()
          break
      }
    }

    eventSource.onerror = () => {
      eventSource.close()
      setShowLiveProgress(false)
      mutate()
    }

    return () => {
      eventSource.close()
    }
  }, [showLiveProgress, liveComplete, id, mutate, sseKey])

  const handleRetry = async () => {
    setActionLoading('retry')
    setActionMessage(null)
    try {
      const response = await fetch(`/api/deployments/${id}/retry`, { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)

      // Close existing SSE connection if any
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }

      // IMPORTANT: Clear all live progress state BEFORE triggering new SSE
      // This prevents showing old failed data if SSE responds quickly
      setLiveComplete(false)
      setLiveProgress(new Map())
      setSelectedTenant(null)
      setShowLiveProgress(false) // Temporarily disable to clear UI

      // Refresh deployment data first
      await mutate()

      // Small delay to ensure state is cleared before new SSE connection
      await new Promise(resolve => setTimeout(resolve, 100))

      // Now increment key and trigger SSE connection
      setSseKey(k => k + 1)
      setShowLiveProgress(true)
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
      mutate()
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to cancel' })
    } finally {
      setActionLoading(null)
    }
  }

  const [showRollbackConfirm, setShowRollbackConfirm] = useState(false)

  const handleRollback = async () => {
    setShowRollbackConfirm(false)
    setActionLoading('rollback')
    setActionMessage(null)
    try {
      const response = await fetch(`/api/deployments/${id}/rollback`, { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Rollback failed')
      setActionMessage({
        type: 'success',
        text: data.message || `Rollback initiated for ${deployment?.completedTenants || 0} tenant(s). This may take a few minutes.`
      })
      mutate()
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to initiate rollback' })
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

  const liveProgressArray = Array.from(liveProgress.values())
  const showingLive = showLiveProgress && liveProgressArray.length > 0

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-4 mb-2">
          <a
            href="/deployments"
            className="text-blue-600 hover:text-blue-800 text-sm"
          >
            &larr; All Deployments
          </a>
          <span className="text-slate-300">|</span>
          <a
            href="/deployments/new"
            className="text-blue-600 hover:text-blue-800 text-sm"
          >
            + New Deployment
          </a>
        </div>
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
      {(deployment.failedTenants > 0 || deployment.status === 'in_progress' || deployment.status === 'pending' || deployment.completedTenants > 0) && (
        <div className="flex gap-3 mb-6 flex-wrap">
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
          {deployment.completedTenants > 0 && deployment.status !== 'in_progress' && deployment.status !== 'rolling_back' && (
            <button
              onClick={() => setShowRollbackConfirm(true)}
              disabled={actionLoading !== null}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
              {actionLoading === 'rollback' ? 'Rolling back...' : 'Undo Deployment'}
            </button>
          )}
        </div>
      )}

      {/* Rollback Confirmation Modal */}
      {showRollbackConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 overflow-hidden">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Undo Deployment?</h3>
              </div>
              <p className="text-gray-600 mb-2">
                This will roll back <strong>{deployment.solutionName}</strong> from {deployment.completedTenants} tenant{deployment.completedTenants !== 1 ? 's' : ''}.
              </p>
              <p className="text-sm text-gray-500 mb-4">
                The solution will be uninstalled and any configuration changes will be reverted. This action may take several minutes to complete.
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-amber-800">
                  <strong>Note:</strong> Data created by users while the solution was active will not be deleted, but may become inaccessible.
                </p>
              </div>
            </div>
            <div className="flex gap-3 p-4 bg-gray-50 border-t">
              <button
                onClick={() => setShowRollbackConfirm(false)}
                className="flex-1 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRollback}
                className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 transition-colors"
              >
                Yes, Undo Deployment
              </button>
            </div>
          </div>
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

      {/* Live Progress View - Two panel layout */}
      {showingLive && (
        <div className="mb-6">
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-blue-200 bg-blue-50/50">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              <span className="text-sm font-medium text-blue-800">Live Deployment Progress</span>
              <span className="text-xs text-blue-600 ml-auto">
                {liveProgressArray.filter(t => t.status === 'in_progress').length} active
                {liveProgressArray.filter(t => t.status === 'completed').length > 0 &&
                  ` · ${liveProgressArray.filter(t => t.status === 'completed').length} done`}
                {liveProgressArray.filter(t => t.status === 'failed').length > 0 &&
                  ` · ${liveProgressArray.filter(t => t.status === 'failed').length} failed`}
              </span>
            </div>

            {/* Two-panel content */}
            <div className="flex flex-col lg:flex-row">
              {/* Left: Tenant list (compact) */}
              <div className="lg:w-64 lg:border-r border-blue-200 p-3 lg:max-h-96 lg:overflow-y-auto">
                <div className="space-y-2">
                  {liveProgressArray.map(tenant => (
                    <CompactTenantRow
                      key={tenant.tenantId}
                      tenant={tenant}
                      isSelected={selectedTenant?.tenantId === tenant.tenantId}
                      onClick={() => setSelectedTenant(tenant)}
                    />
                  ))}
                </div>
              </div>

              {/* Right: Live log panel */}
              <div className="flex-1 p-4 bg-white/50">
                <LiveLogPanel
                  tenant={selectedTenant || liveProgressArray.find(t => t.status === 'in_progress') || liveProgressArray[liveProgressArray.length - 1]}
                  allTenants={liveProgressArray}
                  solutionName={deployment.solutionName}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Show completed deployment history after live progress ends - same layout as live */}
      {!showingLive && liveComplete && liveProgressArray.length > 0 && (
        <DeploymentHistory
          tenants={liveProgressArray}
          selectedTenant={selectedTenant}
          onSelectTenant={setSelectedTenant}
          solutionName={deployment.solutionName}
        />
      )}

      {/* Progress Overview */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-gray-900">Progress</h2>
          {deployment.status === 'completed' && deployment.failedTenants === 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-700">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              All tenants deployed successfully
            </span>
          )}
          {deployment.status === 'completed' && deployment.failedTenants > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-700">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              {deployment.failedTenants} tenant{deployment.failedTenants !== 1 ? 's' : ''} failed
            </span>
          )}
          {deployment.status === 'in_progress' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-700">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Deployment in progress...
            </span>
          )}
        </div>

        <div className="grid grid-cols-4 gap-4 mb-4">
          <div className="text-center">
            <p className="text-3xl font-bold text-gray-900">
              {deployment.totalTenants}
            </p>
            <p className="text-sm text-gray-500">Total</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-green-600">
              <AnimatedCounter value={deployment.completedTenants} duration={600} />
            </p>
            <p className="text-sm text-gray-500">Succeeded</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-red-600">
              <AnimatedCounter value={deployment.failedTenants} duration={600} />
            </p>
            <p className="text-sm text-gray-500">Failed</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-blue-600">
              <AnimatedCounter
                value={deployment.totalTenants - deployment.completedTenants - deployment.failedTenants}
                duration={600}
              />
            </p>
            <p className="text-sm text-gray-500">Pending</p>
          </div>
        </div>

        {/* Segmented Progress Bar */}
        <div className="w-full bg-gray-200 rounded-full h-4 flex overflow-hidden">
          {deployment.completedTenants > 0 && (
            <div
              className="h-4 bg-green-500 transition-all duration-500"
              style={{ width: `${(deployment.completedTenants / deployment.totalTenants) * 100}%` }}
            />
          )}
          {deployment.failedTenants > 0 && (
            <div
              className="h-4 bg-red-500 transition-all duration-500"
              style={{ width: `${(deployment.failedTenants / deployment.totalTenants) * 100}%` }}
            />
          )}
        </div>
        <div className="flex justify-between mt-2 text-xs text-gray-500">
          <span><AnimatedCounter value={deployment.completedTenants} duration={600} /> succeeded</span>
          {deployment.failedTenants > 0 && (
            <span className="text-red-600">
              <AnimatedCounter value={deployment.failedTenants} duration={600} /> failed
            </span>
          )}
          <span>
            <AnimatedCounter
              value={deployment.totalTenants - deployment.completedTenants - deployment.failedTenants}
              duration={600}
            /> pending
          </span>
        </div>
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
                <tr
                  key={result.tenantId}
                  className={`hover:bg-gray-50 ${result.status === 'failed' ? 'bg-red-50/50' : ''}`}
                >
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
                  <td className="px-6 py-4 text-sm max-w-md">
                    {result.error ? (
                      <div className="flex items-start gap-2">
                        <svg className="w-4 h-4 text-red-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-red-700 break-words">{result.error}</span>
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
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

function LiveTenantCard({ tenant, onClick }: { tenant: TenantProgress; onClick: () => void }) {
  const isActive = tenant.status === 'in_progress'
  const isCompleted = tenant.status === 'completed'
  const isFailed = tenant.status === 'failed'

  const stepOrder: DeploymentStepId[] = [
    'authenticating',
    'validating',
    'exporting',
    'uploading',
    'importing',
    'configuring',
    'verifying',
    'completing',
  ]

  const completedSteps = stepOrder.filter(s => tenant.steps[s]?.status === 'completed').length
  // If tenant is done (completed or failed), show appropriate progress even if step events were missed
  const progress = isCompleted ? 100 : Math.round((completedSteps / stepOrder.length) * 100)
  const totalElapsed = tenant.startedAt ? calculateDuration(tenant.startedAt, tenant.completedAt) : null

  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-white rounded-lg border p-3 transition-all duration-300 hover:shadow-md ${
        isActive
          ? 'border-blue-300 shadow-sm ring-1 ring-blue-100'
          : isCompleted
          ? 'border-emerald-200 hover:border-emerald-300'
          : isFailed
          ? 'border-rose-200 hover:border-rose-300'
          : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <div className="flex items-center gap-3">
        {/* Status Icon */}
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
            isActive
              ? 'bg-blue-100'
              : isCompleted
              ? 'bg-emerald-100'
              : isFailed
              ? 'bg-rose-100'
              : 'bg-slate-100'
          }`}
        >
          {isActive ? (
            <svg className="w-5 h-5 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : isCompleted ? (
            <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : isFailed ? (
            <svg className="w-5 h-5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
        </div>

        {/* Tenant Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-medium text-slate-900 text-sm truncate">{tenant.tenantName}</h4>
            <span
              className={`text-sm font-bold shrink-0 ${
                isCompleted ? 'text-emerald-600' : isFailed ? 'text-rose-600' : 'text-blue-600'
              }`}
            >
              {progress}%
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {isActive && tenant.currentStep && (
              <span className="text-xs text-blue-600 animate-pulse">
                {DEPLOYMENT_STEPS[tenant.currentStep].label}...
              </span>
            )}
            {!isActive && totalElapsed && (
              <span className="text-xs text-slate-500">{totalElapsed}</span>
            )}
            {isFailed && tenant.error && (
              <span className="text-xs text-rose-600 truncate">{tenant.error}</span>
            )}
          </div>
          {/* Progress bar */}
          <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                isCompleted
                  ? 'bg-emerald-500'
                  : isFailed
                  ? 'bg-rose-500'
                  : 'bg-blue-500'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </button>
  )
}

// Compact tenant row for the left sidebar during live progress
function CompactTenantRow({
  tenant,
  isSelected,
  onClick,
}: {
  tenant: TenantProgress
  isSelected: boolean
  onClick: () => void
}) {
  const isActive = tenant.status === 'in_progress'
  const isCompleted = tenant.status === 'completed'
  const isFailed = tenant.status === 'failed'

  const stepOrder: DeploymentStepId[] = [
    'authenticating', 'validating', 'exporting', 'uploading',
    'importing', 'configuring', 'verifying', 'completing',
  ]
  const completedSteps = stepOrder.filter(s => tenant.steps[s]?.status === 'completed').length
  // If tenant is done (completed or failed), show appropriate progress even if step events were missed
  const progress = isCompleted ? 100 : Math.round((completedSteps / stepOrder.length) * 100)

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded-lg transition-all ${
        isSelected
          ? 'bg-white shadow-sm ring-2 ring-blue-400'
          : 'hover:bg-white/70'
      } ${
        isActive ? 'border-l-2 border-blue-500' :
        isCompleted ? 'border-l-2 border-emerald-500' :
        isFailed ? 'border-l-2 border-rose-500' :
        'border-l-2 border-transparent'
      }`}
    >
      <div className="flex items-center gap-2">
        {/* Status indicator */}
        <span className="shrink-0">
          {isActive ? (
            <span className="w-2 h-2 bg-blue-500 rounded-full block animate-pulse" />
          ) : isCompleted ? (
            <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : isFailed ? (
            <svg className="w-4 h-4 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <span className="w-2 h-2 bg-slate-300 rounded-full block" />
          )}
        </span>
        <span className="flex-1 truncate text-sm font-medium text-slate-700">
          {tenant.tenantName}
        </span>
        <span className={`text-xs font-semibold ${
          isCompleted ? 'text-emerald-600' : isFailed ? 'text-rose-600' : 'text-blue-600'
        }`}>
          {progress}%
        </span>
      </div>
      {isActive && tenant.currentStep && (
        <p className="text-xs text-blue-600 ml-4 mt-0.5 animate-pulse">
          {DEPLOYMENT_STEPS[tenant.currentStep].label}...
        </p>
      )}
    </button>
  )
}

// Generate detailed log messages based on step and tenant context
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
      completed: `Environment validated: Power Platform license OK, capacity sufficient`,
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

// Live log panel showing real-time step progress for a tenant
function LiveLogPanel({
  tenant,
  allTenants,
  solutionName,
}: {
  tenant: TenantProgress | undefined
  allTenants: TenantProgress[]
  solutionName?: string
}) {
  if (!tenant) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400">
        <p>Waiting for deployment to start...</p>
      </div>
    )
  }

  const isActive = tenant.status === 'in_progress'
  const isCompleted = tenant.status === 'completed'
  const isFailed = tenant.status === 'failed'

  const stepOrder: DeploymentStepId[] = [
    'authenticating', 'validating', 'exporting', 'uploading',
    'importing', 'configuring', 'verifying', 'completing',
  ]

  const formatLogTime = (timestamp?: string) => {
    if (!timestamp) return ''
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  const totalElapsed = tenant.startedAt ? calculateDuration(tenant.startedAt, tenant.completedAt) : null

  return (
    <div className="h-full">
      {/* Tenant header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isActive ? (
            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          ) : isCompleted ? (
            <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          ) : isFailed ? (
            <div className="w-6 h-6 rounded-full bg-rose-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          ) : null}
          <h3 className="font-semibold text-slate-800">{tenant.tenantName}</h3>
        </div>
        {totalElapsed && (
          <span className="text-xs text-slate-500 font-mono">{totalElapsed}</span>
        )}
      </div>

      {/* Error banner if failed */}
      {isFailed && tenant.error && (
        <div className="mb-3 p-3 bg-rose-50 border border-rose-200 rounded-lg">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-sm text-rose-700">{tenant.error}</p>
          </div>
        </div>
      )}

      {/* Step log - terminal style */}
      <div className="bg-slate-900 rounded-lg p-3 font-mono text-xs max-h-64 overflow-y-auto">
        {stepOrder.map(stepId => {
          const step = tenant.steps[stepId]
          const isStepActive = step?.status === 'in_progress'
          const isStepDone = step?.status === 'completed'
          const isStepFailed = step?.status === 'failed'
          const isPending = !step || step.status === 'pending'

          if (isPending) return null

          const logMessage = getDetailedLogMessage(
            stepId,
            tenant,
            isStepActive ? 'started' : isStepDone ? 'completed' : 'failed',
            solutionName
          )

          return (
            <div key={stepId} className="flex items-start gap-2 mb-1.5 last:mb-0">
              <span className="text-slate-500 shrink-0 w-16">
                {step?.startedAt ? formatLogTime(step.startedAt) : ''}
              </span>
              <span className="shrink-0">
                {isStepActive ? (
                  <span className="text-blue-400">▸</span>
                ) : isStepDone ? (
                  <span className="text-emerald-400">✓</span>
                ) : isStepFailed ? (
                  <span className="text-rose-400">✗</span>
                ) : null}
              </span>
              <span className={`flex-1 ${
                isStepActive ? 'text-blue-300' :
                isStepDone ? 'text-slate-400' :
                isStepFailed ? 'text-rose-300' :
                'text-slate-500'
              }`}>
                {logMessage}
                {isStepActive && <span className="animate-pulse">...</span>}
              </span>
              {step?.error && (
                <span className="text-rose-400 block mt-0.5 ml-6">↳ {step.error}</span>
              )}
            </div>
          )
        })}
        {isActive && (
          <div className="flex items-center gap-2 mt-2 text-slate-500">
            <span className="w-16"></span>
            <span className="animate-pulse">_</span>
          </div>
        )}
      </div>
    </div>
  )
}

// Deployment history shown after live progress completes - collapsed by default
function DeploymentHistory({
  tenants,
  selectedTenant,
  onSelectTenant,
  solutionName,
}: {
  tenants: TenantProgress[]
  selectedTenant: TenantProgress | null
  onSelectTenant: (tenant: TenantProgress) => void
  solutionName?: string
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const succeeded = tenants.filter(t => t.status === 'completed').length
  const failed = tenants.filter(t => t.status === 'failed').length

  // Auto-select first tenant if none selected
  const displayTenant = selectedTenant || tenants[0]

  return (
    <div className="mb-6">
      <div className="bg-gradient-to-r from-slate-50 to-slate-100 rounded-xl border border-slate-200 overflow-hidden">
        {/* Header - clickable to expand/collapse */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50/50 hover:bg-slate-100/50 transition-colors text-left"
        >
          <svg
            className={`w-4 h-4 text-slate-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-medium text-slate-700">Deployment Complete</span>
          <span className="text-xs text-slate-500 ml-auto">
            {succeeded} done
            {failed > 0 && ` · ${failed} failed`}
            {!isExpanded && ' · Click to view logs'}
          </span>
        </button>

        {/* Two-panel content - collapsible */}
        {isExpanded && (
          <div className="flex flex-col lg:flex-row">
            {/* Left: Tenant list (compact) */}
            <div className="lg:w-64 lg:border-r border-slate-200 p-3 lg:max-h-96 lg:overflow-y-auto">
              <div className="space-y-2">
                {tenants.map(tenant => (
                  <CompactTenantRow
                    key={tenant.tenantId}
                    tenant={tenant}
                    isSelected={displayTenant?.tenantId === tenant.tenantId}
                    onClick={() => onSelectTenant(tenant)}
                  />
                ))}
              </div>
            </div>

            {/* Right: Log panel */}
            <div className="flex-1 p-4 bg-white/50">
              <HistoryLogPanel tenant={displayTenant} solutionName={solutionName} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Log panel for history view (non-animated version of LiveLogPanel)
function HistoryLogPanel({ tenant, solutionName }: { tenant: TenantProgress | undefined; solutionName?: string }) {
  if (!tenant) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400">
        <p>Select a tenant to view logs</p>
      </div>
    )
  }

  const isCompleted = tenant.status === 'completed'
  const isFailed = tenant.status === 'failed'

  const stepOrder: DeploymentStepId[] = [
    'authenticating', 'validating', 'exporting', 'uploading',
    'importing', 'configuring', 'verifying', 'completing',
  ]

  const formatLogTime = (timestamp?: string) => {
    if (!timestamp) return ''
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  const totalElapsed = tenant.startedAt ? calculateDuration(tenant.startedAt, tenant.completedAt) : null

  return (
    <div className="h-full">
      {/* Tenant header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isCompleted ? (
            <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          ) : isFailed ? (
            <div className="w-6 h-6 rounded-full bg-rose-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          ) : null}
          <h3 className="font-semibold text-slate-800">{tenant.tenantName}</h3>
        </div>
        {totalElapsed && (
          <span className="text-xs text-slate-500 font-mono">{totalElapsed}</span>
        )}
      </div>

      {/* Error banner if failed */}
      {isFailed && tenant.error && (
        <div className="mb-3 p-3 bg-rose-50 border border-rose-200 rounded-lg">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-sm text-rose-700">{tenant.error}</p>
          </div>
        </div>
      )}

      {/* Step log - terminal style */}
      <div className="bg-slate-900 rounded-lg p-3 font-mono text-xs max-h-64 overflow-y-auto">
        {stepOrder.map(stepId => {
          const step = tenant.steps[stepId]
          const isStepDone = step?.status === 'completed'
          const isStepFailed = step?.status === 'failed'
          const isPending = !step || step.status === 'pending'

          if (isPending) return null

          const logMessage = getDetailedLogMessage(
            stepId,
            tenant,
            isStepDone ? 'completed' : 'failed',
            solutionName
          )

          return (
            <div key={stepId} className="flex items-start gap-2 mb-1.5 last:mb-0">
              <span className="text-slate-500 shrink-0 w-16">
                {step?.startedAt ? formatLogTime(step.startedAt) : ''}
              </span>
              <span className="shrink-0">
                {isStepDone ? (
                  <span className="text-emerald-400">✓</span>
                ) : isStepFailed ? (
                  <span className="text-rose-400">✗</span>
                ) : null}
              </span>
              <span className={`flex-1 ${
                isStepDone ? 'text-slate-400' :
                isStepFailed ? 'text-rose-300' :
                'text-slate-500'
              }`}>
                {logMessage}
              </span>
              {step?.error && (
                <span className="text-rose-400 block mt-0.5 ml-6">↳ {step.error}</span>
              )}
            </div>
          )
        })}
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

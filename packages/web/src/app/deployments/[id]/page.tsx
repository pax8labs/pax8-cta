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

interface UrlOverride {
  sharepoint: string
  dynamicsCrm: string
  onmicrosoft: string
  tenant?: string
}

interface TenantProgress {
  tenantId: string
  tenantName: string
  environmentUrl?: string
  urlOverride?: UrlOverride
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'
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
              urlOverride: data.urlOverride,
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
          // Fetch final deployment data first, then sync liveProgress with server state
          eventSource.close()
          mutate().then((freshData) => {
            if (freshData?.tenantResults) {
              // Sync liveProgress with the actual server state
              setLiveProgress(prev => {
                const newMap = new Map(prev)
                freshData.tenantResults.forEach((serverTenant: TenantDeploymentResult) => {
                  const liveTenant = newMap.get(serverTenant.tenantId)
                  if (liveTenant && liveTenant.status === 'in_progress') {
                    // Update with server's actual status
                    const updatedTenant = { ...liveTenant }
                    updatedTenant.status = serverTenant.status === 'completed' ? 'completed' :
                                           serverTenant.status === 'failed' ? 'failed' : liveTenant.status
                    updatedTenant.currentStep = null
                    updatedTenant.completedAt = serverTenant.completedAt || data.timestamp
                    updatedTenant.error = serverTenant.error

                    // Mark steps based on final status
                    const finalStepStatus = serverTenant.status === 'failed' ? 'failed' : 'completed'
                    Object.keys(updatedTenant.steps).forEach(stepId => {
                      const step = updatedTenant.steps[stepId as DeploymentStepId]
                      if (step.status === 'pending' || step.status === 'in_progress') {
                        updatedTenant.steps[stepId as DeploymentStepId] = {
                          ...step,
                          status: finalStepStatus,
                          completedAt: data.timestamp
                        }
                      }
                    })
                    newMap.set(serverTenant.tenantId, updatedTenant)
                  }
                })
                return newMap
              })
            }
            setLiveComplete(true)
            setShowLiveProgress(false)
          })
          break

        case 'info':
          // No pending tenants or other info - close and refresh
          console.log('SSE info:', data.message)
          setLiveComplete(true)
          setShowLiveProgress(false)
          mutate()
          eventSource.close()
          break

        case 'tenant_cancelled':
          // Single tenant was cancelled - update its status
          console.log('SSE tenant cancelled:', data.message)
          setLiveProgress(prev => {
            const newMap = new Map(prev)
            const tenant = newMap.get(data.tenantId)
            if (tenant) {
              newMap.set(data.tenantId, {
                ...tenant,
                status: 'cancelled',
                error: 'Deployment cancelled by user',
                currentStep: null,
                completedAt: data.timestamp,
              })
            }
            return newMap
          })
          break

        case 'deployment_cancelled':
          // Entire deployment was cancelled - mark all in-progress tenants as cancelled
          console.log('SSE deployment cancelled:', data.message)
          setLiveProgress(prev => {
            const newMap = new Map(prev)
            newMap.forEach((tenant, tenantId) => {
              if (tenant.status === 'in_progress' || tenant.status === 'pending') {
                newMap.set(tenantId, {
                  ...tenant,
                  status: 'cancelled',
                  error: 'Deployment cancelled by user',
                  currentStep: null,
                  completedAt: data.timestamp,
                })
              }
            })
            return newMap
          })
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

  // Handle error state from API
  if (deployment.error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4 mb-2">
          <a
            href="/deployments"
            className="text-blue-600 hover:text-blue-800 text-sm"
          >
            &larr; All Deployments
          </a>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-8 text-center max-w-md mx-auto">
          <div className="w-16 h-16 mx-auto mb-4 bg-slate-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">Oops! We can&apos;t find this deployment</h2>
          <p className="text-slate-600 mb-6">
            This deployment may have expired or the link might be incorrect. Don&apos;t worry—you can start a new deployment or check your existing ones.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="/deployments/new"
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Deployment
            </a>
            <a
              href="/deployments"
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50"
            >
              View All Deployments
            </a>
          </div>
        </div>
      </div>
    )
  }

  // Ensure required fields have sensible defaults
  const totalTenants = deployment.totalTenants || deployment.tenantResults?.length || 0
  const completedTenants = deployment.completedTenants ?? 0
  const failedTenants = deployment.failedTenants ?? 0

  const progress = totalTenants > 0
    ? Math.round((completedTenants / totalTenants) * 100)
    : 0

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
      {(failedTenants > 0 || deployment.status === 'in_progress' || deployment.status === 'pending' || completedTenants > 0) && (
        <div className="flex gap-3 mb-6 flex-wrap">
          {failedTenants > 0 && (
            <button
              onClick={handleRetry}
              disabled={actionLoading !== null}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {actionLoading === 'retry' ? 'Retrying...' : `Retry ${failedTenants} Failed`}
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
          {completedTenants > 0 && deployment.status !== 'in_progress' && deployment.status !== 'rolling_back' && (
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
                This will roll back <strong>{deployment.solutionName}</strong> from {completedTenants} tenant{completedTenants !== 1 ? 's' : ''}.
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

      {/* Live Progress View - Terminal-style tabs */}
      {showingLive && (
        <div className="mb-6">
          <div className="bg-slate-900 rounded-xl overflow-hidden shadow-xl">
            {/* Terminal header with tabs */}
            <div className="bg-slate-800 border-b border-slate-700">
              {/* Window controls + title bar */}
              <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-700">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                </div>
                <span className="text-xs text-slate-400 ml-2">Deployment Progress</span>
                <span className="text-xs text-slate-500 ml-auto">
                  {liveProgressArray.filter(t => t.status === 'in_progress').length} active
                  {liveProgressArray.filter(t => t.status === 'completed').length > 0 &&
                    ` · ${liveProgressArray.filter(t => t.status === 'completed').length} done`}
                  {liveProgressArray.filter(t => t.status === 'failed').length > 0 &&
                    ` · ${liveProgressArray.filter(t => t.status === 'failed').length} failed`}
                  {liveProgressArray.filter(t => t.status === 'cancelled').length > 0 &&
                    ` · ${liveProgressArray.filter(t => t.status === 'cancelled').length} cancelled`}
                </span>
              </div>

              {/* Tenant tabs */}
              <div className="flex overflow-x-auto scrollbar-hide">
                {liveProgressArray.map(tenant => {
                  const isActive = tenant.status === 'in_progress'
                  const isCompleted = tenant.status === 'completed'
                  const isFailed = tenant.status === 'failed'
                  const isCancelled = tenant.status === 'cancelled'
                  const isSelected = selectedTenant?.tenantId === tenant.tenantId ||
                    (!selectedTenant && (isActive || tenant === liveProgressArray[liveProgressArray.length - 1]))

                  return (
                    <button
                      key={tenant.tenantId}
                      onClick={() => setSelectedTenant(tenant)}
                      className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-r border-slate-700 whitespace-nowrap transition-colors ${
                        isSelected
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-800 text-slate-400 hover:bg-slate-750 hover:text-slate-300'
                      }`}
                    >
                      {/* Status indicator */}
                      {isActive && (
                        <svg className="w-3.5 h-3.5 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      )}
                      {isCompleted && (
                        <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      {isFailed && (
                        <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                      {isCancelled && (
                        <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                        </svg>
                      )}
                      {!isActive && !isCompleted && !isFailed && !isCancelled && (
                        <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-500" />
                      )}
                      <span className="truncate max-w-32">{tenant.tenantName}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Terminal content - fixed height */}
            <div className="h-80 overflow-y-auto p-4 font-mono text-sm">
              <TerminalLogPanel
                tenant={selectedTenant || liveProgressArray.find(t => t.status === 'in_progress') || liveProgressArray[liveProgressArray.length - 1]}
                allTenants={liveProgressArray}
                solutionName={deployment.solutionName}
              />
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
          {deployment.status === 'completed' && failedTenants === 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-700">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              All tenants deployed successfully
            </span>
          )}
          {deployment.status === 'completed' && failedTenants > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-700">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              {failedTenants} tenant{failedTenants !== 1 ? 's' : ''} failed
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
              {totalTenants}
            </p>
            <p className="text-sm text-gray-500">Total</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-green-600">
              <AnimatedCounter value={completedTenants} duration={600} />
            </p>
            <p className="text-sm text-gray-500">Succeeded</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-red-600">
              <AnimatedCounter value={failedTenants} duration={600} />
            </p>
            <p className="text-sm text-gray-500">Failed</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-blue-600">
              <AnimatedCounter
                value={totalTenants - completedTenants - failedTenants}
                duration={600}
              />
            </p>
            <p className="text-sm text-gray-500">Pending</p>
          </div>
        </div>

        {/* Segmented Progress Bar */}
        <div className="w-full bg-gray-200 rounded-full h-4 flex overflow-hidden">
          {completedTenants > 0 && totalTenants > 0 && (
            <div
              className="h-4 bg-green-500 transition-all duration-500"
              style={{ width: `${(completedTenants / totalTenants) * 100}%` }}
            />
          )}
          {failedTenants > 0 && totalTenants > 0 && (
            <div
              className="h-4 bg-red-500 transition-all duration-500"
              style={{ width: `${(failedTenants / totalTenants) * 100}%` }}
            />
          )}
        </div>
        <div className="flex justify-between mt-2 text-xs text-gray-500">
          <span><AnimatedCounter value={completedTenants} duration={600} /> succeeded</span>
          {failedTenants > 0 && (
            <span className="text-red-600">
              <AnimatedCounter value={failedTenants} duration={600} /> failed
            </span>
          )}
          <span>
            <AnimatedCounter
              value={totalTenants - completedTenants - failedTenants}
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
        <p>Created: {deployment.createdAt ? new Date(deployment.createdAt).toLocaleString() : '—'}</p>
        <p>Last Updated: {deployment.updatedAt ? new Date(deployment.updatedAt).toLocaleString() : '—'}</p>
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
): string | string[] {
  const tenantShort = tenant.tenantId.slice(0, 8)
  const envDomain = tenant.environmentUrl
    ? new URL(tenant.environmentUrl).hostname.split('.')[0]
    : 'environment'
  const solution = solutionName || 'solution'

  // Get URL override info for dependency display
  const urlOverride = tenant.urlOverride

  // Build dependency verification lines
  const getDependencyLines = (prefix: string, showStatus: boolean) => {
    if (!urlOverride) return []
    const lines: string[] = []
    if (urlOverride.sharepoint) {
      lines.push(`  ${prefix} SharePoint: ${urlOverride.sharepoint}${showStatus ? ' ✓' : ''}`)
    }
    if (urlOverride.dynamicsCrm) {
      lines.push(`  ${prefix} Dynamics 365: ${urlOverride.dynamicsCrm}${showStatus ? ' ✓' : ''}`)
    }
    if (urlOverride.onmicrosoft) {
      lines.push(`  ${prefix} Microsoft 365: ${urlOverride.onmicrosoft}${showStatus ? ' ✓' : ''}`)
    }
    return lines
  }

  const messages: Record<DeploymentStepId, { started: string | string[]; completed: string | string[] }> = {
    authenticating: {
      started: `Acquiring GDAP token for tenant ${tenantShort}...`,
      completed: `Authenticated with delegated admin access`,
    },
    validating: {
      started: urlOverride
        ? [
            `Verifying dependencies for ${solution}...`,
            ...getDependencyLines('→', false),
          ]
        : `Checking ${envDomain} compatibility for ${solution}...`,
      completed: urlOverride
        ? [
            `Dependencies verified successfully`,
            ...getDependencyLines('', true),
          ]
        : `Environment validated: Power Platform license OK, capacity sufficient`,
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
      started: urlOverride
        ? [
            `Binding ${solution} to tenant resources...`,
            ...getDependencyLines('→', false),
          ]
        : `Configuring ${solution} connections and variables...`,
      completed: urlOverride
        ? [
            `Resources bound successfully`,
            ...getDependencyLines('', true),
          ]
        : `Connections bound, environment variables configured`,
    },
    verifying: {
      started: urlOverride
        ? [
            `Running ${solution} health checks...`,
            ...getDependencyLines('Testing', false),
          ]
        : `Running ${solution} health checks...`,
      completed: urlOverride
        ? [
            `All health checks passed`,
            ...getDependencyLines('', true),
          ]
        : `All ${solution} components verified healthy`,
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

// Terminal-style log panel for the new tabbed UI
function TerminalLogPanel({
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
      <div className="flex items-center justify-center h-full text-slate-500">
        <p>Waiting for deployment to start...</p>
      </div>
    )
  }

  const isActive = tenant.status === 'in_progress'
  const isFailed = tenant.status === 'failed'
  const isCancelled = tenant.status === 'cancelled'

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

  // Format tenant ID for display (first 8 chars)
  const tenantIdShort = tenant.tenantId.slice(0, 8)

  return (
    <div className="text-slate-300">
      {/* Tenant header line */}
      <div className="flex items-center gap-2 mb-3 text-slate-400">
        <span className="text-blue-400">$</span>
        <span>
          agentsync deploy {solutionName ? <span className="text-emerald-400">{solutionName}</span> : 'solution'}{' '}
          --tenant <span className="text-cyan-400">{tenantIdShort}</span>{' '}
          <span className="text-slate-500"># {tenant.tenantName}</span>
        </span>
        {totalElapsed && (
          <span className="ml-auto text-slate-500">[{totalElapsed}]</span>
        )}
      </div>

      {/* Cancelled banner */}
      {isCancelled && (
        <div className="mb-3 px-3 py-2 bg-amber-950/50 border border-amber-800/50 rounded text-amber-300">
          <span className="text-amber-400">CANCELLED:</span> Deployment cancelled by user
        </div>
      )}

      {/* Error banner if failed */}
      {isFailed && tenant.error && (
        <div className="mb-3 px-3 py-2 bg-red-950/50 border border-red-800/50 rounded text-red-300">
          <span className="text-red-400">ERROR:</span> {tenant.error}
        </div>
      )}

      {/* Step logs */}
      <div className="space-y-1">
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

          // Handle both string and array messages
          const messages = Array.isArray(logMessage) ? logMessage : [logMessage]

          return (
            <div key={stepId}>
              {messages.map((msg, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  <span className="text-slate-600 shrink-0 w-16">
                    {idx === 0 && step?.startedAt ? formatLogTime(step.startedAt) : ''}
                  </span>
                  <span className="shrink-0 w-4">
                    {idx === 0 ? (
                      isStepActive ? (
                        <span className="text-yellow-400">●</span>
                      ) : isStepDone ? (
                        <span className="text-emerald-400">✓</span>
                      ) : isStepFailed ? (
                        <span className="text-red-400">✗</span>
                      ) : null
                    ) : null}
                  </span>
                  <span className={`flex-1 ${
                    idx > 0 ? 'text-slate-500' : // Sub-lines are dimmer
                    isStepActive ? 'text-yellow-200' :
                    isStepDone ? 'text-slate-400' :
                    isStepFailed ? 'text-red-300' :
                    'text-slate-500'
                  }`}>
                    {msg}
                    {idx === 0 && isStepActive && <span className="animate-pulse">...</span>}
                  </span>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {/* Blinking cursor when active */}
      {isActive && (
        <div className="flex items-center gap-3 mt-3 text-slate-500">
          <span className="w-16"></span>
          <span className="w-4"></span>
          <span className="animate-pulse">▋</span>
        </div>
      )}
    </div>
  )
}

// Deployment history shown after live progress completes - terminal style with tabs
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
  const [isExpanded, setIsExpanded] = useState(true) // Default to expanded
  const succeeded = tenants.filter(t => t.status === 'completed').length
  const failed = tenants.filter(t => t.status === 'failed').length

  // Auto-select first tenant if none selected
  const displayTenant = selectedTenant || tenants[0]

  return (
    <div className="mb-6">
      <div className="bg-slate-900 rounded-xl overflow-hidden shadow-xl">
        {/* Terminal header */}
        <div className="bg-slate-800 border-b border-slate-700">
          {/* Window controls + title bar - clickable to expand/collapse */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full flex items-center gap-2 px-4 py-2 border-b border-slate-700 hover:bg-slate-750 transition-colors text-left"
          >
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <div className="w-3 h-3 rounded-full bg-green-500" />
            </div>
            <span className="text-xs text-slate-400 ml-2">Deployment Complete</span>
            <span className="text-xs text-slate-500 ml-auto">
              {succeeded} done
              {failed > 0 && ` · ${failed} failed`}
              {!isExpanded && ' · Click to expand'}
            </span>
            <svg
              className={`w-4 h-4 text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Tenant tabs - only show when expanded */}
          {isExpanded && (
            <div className="flex overflow-x-auto scrollbar-hide">
              {tenants.map(tenant => {
                const isCompleted = tenant.status === 'completed'
                const isFailed = tenant.status === 'failed'
                const isSelected = displayTenant?.tenantId === tenant.tenantId

                return (
                  <button
                    key={tenant.tenantId}
                    onClick={() => onSelectTenant(tenant)}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-r border-slate-700 whitespace-nowrap transition-colors ${
                      isSelected
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-750 hover:text-slate-300'
                    }`}
                  >
                    {isCompleted && (
                      <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    {isFailed && (
                      <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                    {!isCompleted && !isFailed && (
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-500" />
                    )}
                    <span className="truncate max-w-32">{tenant.tenantName}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Terminal content - fixed height, collapsible */}
        {isExpanded && (
          <div className="h-80 overflow-y-auto p-4 font-mono text-sm">
            <TerminalLogPanel
              tenant={displayTenant}
              allTenants={tenants}
              solutionName={solutionName}
            />
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

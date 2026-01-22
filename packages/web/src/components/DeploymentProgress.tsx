'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  DeploymentStep,
  DeploymentStepId,
  DeploymentStepStatus,
  TenantDeploymentProgress,
  DEPLOYMENT_STEPS,
  MIN_STEP_DISPLAY_MS,
  createInitialTenantProgress,
  calculateProgress,
} from '@agentsync/core'

interface DeploymentProgressProps {
  deploymentId: string
  tenants: Array<{ tenantId: string; tenantName: string }>
  onComplete?: (results: TenantDeploymentProgress[]) => void
  autoStart?: boolean
}

// Simulate a deployment step with minimum display time
async function simulateStep(
  minDisplayMs: number,
  actualDurationMs: number,
  shouldFail?: boolean
): Promise<void> {
  const displayTime = Math.max(minDisplayMs, actualDurationMs)
  await new Promise(resolve => setTimeout(resolve, displayTime))
  if (shouldFail) {
    throw new Error('Simulated failure')
  }
}

export function DeploymentProgress({
  deploymentId,
  tenants,
  onComplete,
  autoStart = true,
}: DeploymentProgressProps) {
  const [tenantProgress, setTenantProgress] = useState<Map<string, TenantDeploymentProgress>>(
    () => new Map(tenants.map(t => [t.tenantId, createInitialTenantProgress(t.tenantId, t.tenantName)]))
  )
  const [overallProgress, setOverallProgress] = useState(0)
  const [isRunning, setIsRunning] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const startedRef = useRef(false)

  const updateTenantStep = useCallback(
    (tenantId: string, stepId: DeploymentStepId, status: DeploymentStepStatus, error?: string) => {
      setTenantProgress(prev => {
        const newMap = new Map(prev)
        const progress = newMap.get(tenantId)
        if (progress) {
          const steps = progress.steps.map(s =>
            s.id === stepId
              ? {
                  ...s,
                  status,
                  startedAt: status === 'in_progress' ? new Date().toISOString() : s.startedAt,
                  completedAt: status === 'completed' || status === 'failed' ? new Date().toISOString() : s.completedAt,
                  error,
                }
              : s
          )
          newMap.set(tenantId, {
            ...progress,
            steps,
            currentStep: status === 'in_progress' ? stepId : progress.currentStep,
            progress: calculateProgress(steps),
            overallStatus: status === 'failed' ? 'failed' : progress.overallStatus,
            error: error || progress.error,
          })
        }
        return newMap
      })
    },
    []
  )

  const completeTenant = useCallback((tenantId: string, success: boolean) => {
    setTenantProgress(prev => {
      const newMap = new Map(prev)
      const progress = newMap.get(tenantId)
      if (progress) {
        newMap.set(tenantId, {
          ...progress,
          overallStatus: success ? 'completed' : 'failed',
          currentStep: null,
          completedAt: new Date().toISOString(),
          progress: success ? 100 : progress.progress,
        })
      }
      return newMap
    })
  }, [])

  // Run deployment simulation
  const runDeployment = useCallback(async () => {
    if (startedRef.current) return
    startedRef.current = true
    setIsRunning(true)

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

    const stepDurations: Record<DeploymentStepId, number> = {
      authenticating: 700,
      validating: 500,
      exporting: 1000,
      uploading: 1200,
      importing: 1800,
      configuring: 800,
      verifying: 600,
      completing: 400,
    }

    // Process tenants with some concurrency but staggered starts
    const processQueue = [...tenants]
    const concurrent = 2
    const inProgress: Promise<void>[] = []

    const processTenant = async (tenant: { tenantId: string; tenantName: string }, index: number) => {
      // Stagger tenant starts for visual effect
      await new Promise(resolve => setTimeout(resolve, index * 300))

      // Set tenant to in_progress
      setTenantProgress(prev => {
        const newMap = new Map(prev)
        const progress = newMap.get(tenant.tenantId)
        if (progress) {
          newMap.set(tenant.tenantId, {
            ...progress,
            overallStatus: 'in_progress',
            startedAt: new Date().toISOString(),
          })
        }
        return newMap
      })

      // Simulate failure for some tenants (for demo)
      const shouldFail = Math.random() < 0.1 // 10% chance
      const failStep = shouldFail ? stepOrder[Math.floor(Math.random() * 5) + 2] : null

      for (const stepId of stepOrder) {
        // Start step
        updateTenantStep(tenant.tenantId, stepId, 'in_progress')

        try {
          // Simulate with minimum display time
          const baseDuration = stepDurations[stepId]
          const variation = Math.random() * 400 - 200 // +/- 200ms
          await simulateStep(MIN_STEP_DISPLAY_MS, baseDuration + variation, stepId === failStep)

          // Complete step
          updateTenantStep(tenant.tenantId, stepId, 'completed')
        } catch {
          updateTenantStep(tenant.tenantId, stepId, 'failed', `Failed during ${DEPLOYMENT_STEPS[stepId].label.toLowerCase()}`)
          completeTenant(tenant.tenantId, false)
          return
        }
      }

      completeTenant(tenant.tenantId, true)
    }

    let idx = 0
    while (processQueue.length > 0 || inProgress.length > 0) {
      // Start new tasks up to concurrency limit
      while (inProgress.length < concurrent && processQueue.length > 0) {
        const tenant = processQueue.shift()!
        const promise = processTenant(tenant, idx++)
        inProgress.push(promise)
        // Remove completed promises
        promise.finally(() => {
          const i = inProgress.indexOf(promise)
          if (i > -1) inProgress.splice(i, 1)
        })
      }

      // Wait for at least one to complete
      if (inProgress.length > 0) {
        await Promise.race(inProgress)
      }
    }

    setIsRunning(false)
    setIsComplete(true)

    if (onComplete) {
      const results = Array.from(tenantProgress.values())
      onComplete(results)
    }
  }, [tenants, updateTenantStep, completeTenant, onComplete, tenantProgress])

  // Auto-start deployment
  useEffect(() => {
    if (autoStart && !startedRef.current) {
      runDeployment()
    }
  }, [autoStart, runDeployment])

  // Calculate overall progress
  useEffect(() => {
    const allProgress = Array.from(tenantProgress.values())
    const totalProgress = allProgress.reduce((sum, p) => sum + p.progress, 0)
    setOverallProgress(Math.round(totalProgress / allProgress.length))
  }, [tenantProgress])

  const progressArray = Array.from(tenantProgress.values())
  const completed = progressArray.filter(p => p.overallStatus === 'completed').length
  const failed = progressArray.filter(p => p.overallStatus === 'failed').length
  const pending = progressArray.filter(p => p.overallStatus === 'pending').length

  return (
    <div className="space-y-6">
      {/* Overall Progress Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Deployment Progress</h3>
            <p className="text-sm text-slate-500 mt-0.5">
              {isRunning ? 'Deploying to tenants...' : isComplete ? 'Deployment complete' : 'Preparing deployment...'}
            </p>
          </div>
          <div className="text-right">
            <span className="text-3xl font-bold text-blue-600">{overallProgress}%</span>
          </div>
        </div>

        {/* Overall Progress Bar */}
        <div className="relative">
          <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
        </div>

        {/* Summary Stats */}
        <div className="flex items-center gap-6 mt-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-emerald-500 rounded-full" />
            <span className="text-slate-600">{completed} completed</span>
          </div>
          {failed > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-rose-500 rounded-full" />
              <span className="text-slate-600">{failed} failed</span>
            </div>
          )}
          {pending > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-slate-300 rounded-full" />
              <span className="text-slate-600">{pending} pending</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
            <span className="text-slate-600">{progressArray.filter(p => p.overallStatus === 'in_progress').length} in progress</span>
          </div>
        </div>
      </div>

      {/* Per-Tenant Progress */}
      <div className="space-y-4">
        {progressArray.map(progress => (
          <TenantProgressCard key={progress.tenantId} progress={progress} />
        ))}
      </div>
    </div>
  )
}

function TenantProgressCard({ progress }: { progress: TenantDeploymentProgress }) {
  const isActive = progress.overallStatus === 'in_progress'
  const isCompleted = progress.overallStatus === 'completed'
  const isFailed = progress.overallStatus === 'failed'

  return (
    <div
      className={`bg-white rounded-xl border p-5 transition-all duration-300 ${
        isActive
          ? 'border-blue-300 shadow-md ring-2 ring-blue-100'
          : isCompleted
          ? 'border-emerald-200 bg-emerald-50/30'
          : isFailed
          ? 'border-rose-200 bg-rose-50/30'
          : 'border-slate-200'
      }`}
    >
      {/* Tenant Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center ${
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
          <div>
            <h4 className="font-semibold text-slate-900">{progress.tenantName}</h4>
            <p className="text-xs text-slate-500">{progress.tenantId.slice(0, 8)}...</p>
          </div>
        </div>
        <div className="text-right">
          <span
            className={`text-lg font-bold ${
              isCompleted ? 'text-emerald-600' : isFailed ? 'text-rose-600' : 'text-blue-600'
            }`}
          >
            {progress.progress}%
          </span>
        </div>
      </div>

      {/* Steps Progress */}
      <div className="space-y-2">
        {progress.steps.map((step, index) => (
          <StepRow key={step.id} step={step} index={index} />
        ))}
      </div>

      {/* Error Message */}
      {progress.error && (
        <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg">
          <p className="text-sm text-rose-700">{progress.error}</p>
        </div>
      )}
    </div>
  )
}

function StepRow({ step, index }: { step: DeploymentStep; index: number }) {
  const isActive = step.status === 'in_progress'
  const isCompleted = step.status === 'completed'
  const isFailed = step.status === 'failed'
  const isPending = step.status === 'pending'

  return (
    <div
      className={`flex items-center gap-3 py-2 px-3 rounded-lg transition-all duration-300 ${
        isActive ? 'bg-blue-50' : ''
      }`}
      style={{
        transitionDelay: `${index * 50}ms`,
      }}
    >
      {/* Step Indicator */}
      <div className="flex-shrink-0">
        {isActive ? (
          <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
            <svg className="w-3 h-3 text-white animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : isCompleted ? (
          <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        ) : isFailed ? (
          <div className="w-6 h-6 rounded-full bg-rose-500 flex items-center justify-center">
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        ) : (
          <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-slate-400" />
          </div>
        )}
      </div>

      {/* Step Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={`text-sm font-medium ${
              isActive
                ? 'text-blue-700'
                : isCompleted
                ? 'text-emerald-700'
                : isFailed
                ? 'text-rose-700'
                : 'text-slate-500'
            }`}
          >
            {step.label}
          </span>
          {isActive && (
            <span className="text-xs text-blue-500 animate-pulse">
              {step.description}
            </span>
          )}
        </div>
        {step.error && <p className="text-xs text-rose-600 mt-0.5">{step.error}</p>}
      </div>

      {/* Duration */}
      {step.startedAt && step.completedAt && (
        <span className="text-xs text-slate-400 tabular-nums">
          {formatStepDuration(step.startedAt, step.completedAt)}
        </span>
      )}
    </div>
  )
}

function formatStepDuration(startedAt: string, completedAt: string): string {
  const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime()
  if (durationMs < 1000) return `${durationMs}ms`
  return `${(durationMs / 1000).toFixed(1)}s`
}

export default DeploymentProgress

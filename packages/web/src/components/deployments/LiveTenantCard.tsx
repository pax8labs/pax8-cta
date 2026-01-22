'use client'

import React from 'react'
import { TenantProgress, DEPLOYMENT_STEPS, STEP_ORDER, DeploymentStepId } from './types'
import { calculateDuration } from './utils'

interface LiveTenantCardProps {
  tenant: TenantProgress
  onClick: () => void
}

/**
 * Card component showing live deployment progress for a single tenant
 */
export const LiveTenantCard = React.memo(function LiveTenantCard({ tenant, onClick }: LiveTenantCardProps) {
  const isActive = tenant.status === 'in_progress'
  const isCompleted = tenant.status === 'completed'
  const isFailed = tenant.status === 'failed'

  const completedSteps = STEP_ORDER.filter(s => tenant.steps[s]?.status === 'completed').length
  // If tenant is done (completed or failed), show appropriate progress even if step events were missed
  const progress = isCompleted ? 100 : Math.round((completedSteps / STEP_ORDER.length) * 100)
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
      aria-label={`View details for ${tenant.tenantName}`}
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
            <svg className="w-5 h-5 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : isCompleted ? (
            <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : isFailed ? (
            <svg className="w-5 h-5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
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
})

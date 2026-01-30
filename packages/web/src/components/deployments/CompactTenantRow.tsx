'use client'

import React from 'react'
import { TenantProgress, DEPLOYMENT_STEPS, STEP_ORDER } from './types'

interface CompactTenantRowProps {
  tenant: TenantProgress
  isSelected: boolean
  onClick: () => void
}

/**
 * Compact tenant row for the left sidebar during live progress
 */
export const CompactTenantRow = React.memo(function CompactTenantRow({
  tenant,
  isSelected,
  onClick,
}: CompactTenantRowProps) {
  const isActive = tenant.status === 'in_progress'
  const isCompleted = tenant.status === 'completed'
  const isFailed = tenant.status === 'failed'

  const completedSteps = STEP_ORDER.filter(s => tenant.steps[s]?.status === 'completed').length
  // If tenant is done (completed or failed), show appropriate progress even if step events were missed
  const progress = isCompleted ? 100 : Math.round((completedSteps / STEP_ORDER.length) * 100)

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
      aria-label={`Select ${tenant.tenantName}`}
      aria-pressed={isSelected}
    >
      <div className="flex items-center gap-2">
        {/* Status indicator */}
        <span className="shrink-0" aria-hidden="true">
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
})

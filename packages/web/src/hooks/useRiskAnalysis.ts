/**
 * React hook for deployment risk analysis
 */

import { useState, useCallback } from 'react'
import type { RiskAnalysis } from '@agentsync/core'

interface AnalyzeOptions {
  tenantIds: string[]
  solutionFile?: string
  solutionSize?: number
  isProduction?: boolean
  scheduledTime?: Date
}

interface UseRiskAnalysisResult {
  analysis: RiskAnalysis | null
  loading: boolean
  error: Error | null
  analyze: (options: AnalyzeOptions) => Promise<void>
  reset: () => void
}

export function useRiskAnalysis(): UseRiskAnalysisResult {
  const [analysis, setAnalysis] = useState<RiskAnalysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const analyze = useCallback(async (options: AnalyzeOptions) => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/deployments/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenantIds: options.tenantIds,
          solutionFile: options.solutionFile,
          solutionSize: options.solutionSize,
          isProduction: options.isProduction ?? false,
          scheduledTime: options.scheduledTime?.toISOString(),
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Analysis failed: ${response.statusText}`)
      }

      const data = await response.json()
      setAnalysis(data.analysis)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'))
    } finally {
      setLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setAnalysis(null)
    setError(null)
    setLoading(false)
  }, [])

  return {
    analysis,
    loading,
    error,
    analyze,
    reset,
  }
}

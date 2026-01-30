'use client'

import React from 'react'
import { trackError, posthog, isPostHogEnabled } from '@/lib/posthog-client'

interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ReactNode
  /** Enable automatic GitHub issue creation for errors */
  reportToGitHub?: boolean
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
  gitHubIssueUrl?: string
  isReportingToGitHub: boolean
}

/**
 * Error Boundary component that catches React errors and reports them to PostHog.
 *
 * Wrap your app or specific sections with this component to catch errors
 * and display a fallback UI while tracking the error in analytics.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null, isReportingToGitHub: false }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo })

    // Track error in PostHog
    trackError(error, {
      component_stack: errorInfo.componentStack,
      source: 'error_boundary',
    })

    // Also capture in PostHog's exception tracking if enabled
    if (isPostHogEnabled()) {
      posthog.capture('$exception', {
        $exception_message: error.message,
        $exception_type: error.name,
        $exception_stack_trace_raw: error.stack,
        $exception_source: 'react_error_boundary',
      })
    }

    // Report to GitHub Issues if enabled
    if (this.props.reportToGitHub !== false) {
      this.reportToGitHub(error, errorInfo)
    }

    // Log to console for development
    console.error('Error caught by ErrorBoundary:', error, errorInfo)
  }

  async reportToGitHub(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ isReportingToGitHub: true })

    try {
      const response = await fetch('/api/errors/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          errorMessage: error.message,
          errorStack: error.stack,
          componentStack: errorInfo.componentStack,
          source: 'error_boundary',
          url: typeof window !== 'undefined' ? window.location.href : undefined,
          timestamp: new Date().toISOString(),
          context: {
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
          },
        }),
      })

      const result = await response.json()

      if (result.success && result.issueUrl) {
        this.setState({ gitHubIssueUrl: result.issueUrl })
      }
    } catch (reportError) {
      console.error('Failed to report error to GitHub:', reportError)
    } finally {
      this.setState({ isReportingToGitHub: false })
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, gitHubIssueUrl: undefined, isReportingToGitHub: false })
  }

  render() {
    if (this.state.hasError) {
      // Custom fallback or default error UI
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-[400px] flex items-center justify-center p-8">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-full">
                <svg
                  className="w-6 h-6 text-red-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Something went wrong</h3>
                <p className="text-sm text-gray-500">An unexpected error occurred</p>
              </div>
            </div>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="mb-4 p-3 bg-gray-50 rounded-md overflow-auto">
                <p className="text-xs font-mono text-red-600 break-all">
                  {this.state.error.message}
                </p>
                {this.state.error.stack && (
                  <pre className="mt-2 text-xs text-gray-500 whitespace-pre-wrap">
                    {this.state.error.stack.split('\n').slice(1, 5).join('\n')}
                  </pre>
                )}
              </div>
            )}

            {/* GitHub Issue Status */}
            {this.state.isReportingToGitHub && (
              <div className="mb-4 p-3 bg-blue-50 rounded-md flex items-center gap-2">
                <svg className="w-4 h-4 text-blue-600 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-xs text-blue-700">Creating GitHub issue...</span>
              </div>
            )}

            {this.state.gitHubIssueUrl && (
              <div className="mb-4 p-3 bg-green-50 rounded-md">
                <div className="flex items-center gap-2 mb-1">
                  <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-xs font-medium text-green-700">Issue reported</span>
                </div>
                <a
                  href={this.state.gitHubIssueUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-green-600 hover:underline break-all"
                >
                  {this.state.gitHubIssueUrl}
                </a>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={this.handleRetry}
                className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * Hook to manually report errors to PostHog and optionally GitHub
 * Use this for errors caught in try/catch blocks
 */
export function useErrorReporter() {
  const [isReporting, setIsReporting] = React.useState(false)
  const [lastIssueUrl, setLastIssueUrl] = React.useState<string | undefined>()

  const reportError = React.useCallback(async (
    error: Error | string,
    context?: Record<string, unknown>,
    options?: { reportToGitHub?: boolean }
  ) => {
    // Track in PostHog
    trackError(error, context)

    // Report to GitHub if requested
    if (options?.reportToGitHub) {
      setIsReporting(true)
      try {
        const response = await fetch('/api/errors/report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            errorMessage: typeof error === 'string' ? error : error.message,
            errorStack: typeof error === 'string' ? undefined : error.stack,
            source: 'manual_report',
            url: typeof window !== 'undefined' ? window.location.href : undefined,
            timestamp: new Date().toISOString(),
            context: {
              ...context,
              userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
            },
          }),
        })

        const result = await response.json()
        if (result.success && result.issueUrl) {
          setLastIssueUrl(result.issueUrl)
        }
      } catch (reportError) {
        console.error('Failed to report error to GitHub:', reportError)
      } finally {
        setIsReporting(false)
      }
    }
  }, [])

  return { reportError, isReporting, lastIssueUrl }
}

/**
 * Global error handler component that catches unhandled errors and promise rejections.
 * Add this component once in your app layout to catch errors that escape error boundaries.
 */
export function GlobalErrorHandler({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    const reportGlobalError = async (error: Error, source: string) => {
      // Track in PostHog
      trackError(error, { source })

      // Report to GitHub
      try {
        await fetch('/api/errors/report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            errorMessage: error.message,
            errorStack: error.stack,
            source,
            url: typeof window !== 'undefined' ? window.location.href : undefined,
            timestamp: new Date().toISOString(),
            context: {
              userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
            },
          }),
        })
      } catch (reportError) {
        console.error('Failed to report global error to GitHub:', reportError)
      }
    }

    // Handle unhandled errors
    const handleError = (event: ErrorEvent) => {
      console.error('Global error caught:', event.error)
      reportGlobalError(
        event.error || new Error(event.message),
        'global_error'
      )
    }

    // Handle unhandled promise rejections
    const handleRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled promise rejection:', event.reason)
      const error = event.reason instanceof Error
        ? event.reason
        : new Error(String(event.reason))
      reportGlobalError(error, 'unhandled_rejection')
    }

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleRejection)

    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleRejection)
    }
  }, [])

  return <>{children}</>
}

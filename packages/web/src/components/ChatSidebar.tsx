'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import useSWR from 'swr'
import { useChat } from '@/hooks/useChat'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import { ChatMessage as ChatMessageComponent } from './ChatMessage'
import { ChatInput } from './ChatInput'
import { ActionConfirmation, SKIP_CONFIRMATIONS_KEY } from './ActionConfirmation'
import { ChatAction } from '@/types/chat'
import { createLogger } from '@/lib/logger'

const logger = createLogger('ChatSidebar')
const fetcher = (url: string) => fetch(url).then((res) => res.json())

const SIDEBAR_STORAGE_KEY = 'agentsync-chat-sidebar-open'

export function ChatSidebar() {
  // Use safe localStorage hooks to prevent hydration mismatches
  const [isOpen, setIsOpen, isHydrated] = useLocalStorage(SIDEBAR_STORAGE_KEY, true)
  const [confirmationsDisabled, setConfirmationsDisabled] = useLocalStorage(SKIP_CONFIRMATIONS_KEY, false)
  const [pendingAction, setPendingAction] = useState<{
    action: ChatAction
    message: string
  } | null>(null)
  const [isExecuting, setIsExecuting] = useState(false)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { messages, isLoading, llmStatus, sendMessage, clearMessages } = useChat()

  // Fetch real-time system context
  const { data: stats } = useSWR('/api/stats', fetcher, { refreshInterval: 5000 })

  // Auto-scroll to bottom when new messages arrive (within sidebar container only)
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
    }
  }, [messages])

  // Send initial observation when chat first opens
  useEffect(() => {
    if (isHydrated && messages.length === 0 && !isLoading && stats) {
      // Send a brief system status observation
      sendMessage("Give me a brief overview of the current system status.")
    }
  }, [isHydrated, stats]) // Only run when hydrated and stats are loaded

  const handleActionClick = async (action: ChatAction | undefined) => {
    if (!action) return

    // Validate deploy actions have required fields
    if (action.type === 'deploy') {
      logger.debug('Deploy action clicked', { action })
      if (!action.agentName) {
        await sendMessage('❌ Error: Agent name is missing. Please try asking again with the full deployment request.')
        return
      }
      if (!action.tenantIds || action.tenantIds.length === 0) {
        await sendMessage('❌ Error: No tenants specified. Please try asking again like "deploy [agent] to [tenant]".')
        return
      }
    }

    // For actions that require confirmation
    if (action.requiresConfirmation) {
      // Skip confirmation if user opted out (and it's not a destructive action)
      if (confirmationsDisabled && action.type !== 'cancel') {
        setIsExecuting(true)
        try {
          await executeAction(action)
          const successMessage = `✅ ${action.label} completed successfully`
          await sendMessage(successMessage)
        } catch (error) {
          console.error('Action execution error:', error)
          const errorMessage = `❌ Failed to ${action.label.toLowerCase()}: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
          await sendMessage(errorMessage)
        } finally {
          setIsExecuting(false)
        }
      } else {
        // Show confirmation dialog
        const message = getConfirmationMessage(action)
        setPendingAction({ action, message })
      }
    }
  }

  const handleConfirmAction = async () => {
    if (!pendingAction) return

    setIsExecuting(true)
    try {
      const result = await executeAction(pendingAction.action)

      // For deployments, verify it was created and provide a link
      if (pendingAction.action.type === 'deploy' && result.deploymentId) {
        // Wait a moment for the deployment to be persisted
        await new Promise(resolve => setTimeout(resolve, 500))

        // Verify the deployment exists
        const verifyResponse = await fetch('/api/deployments?limit=100')
        if (verifyResponse.ok) {
          const data = await verifyResponse.json()
          const deployment = data.deployments?.find((d: any) => d.id === result.deploymentId)

          if (deployment) {
            const successMessage = `✅ ${pendingAction.action.label} completed successfully!\n\nView deployment: http://localhost:3000/deployments?filter=active&view=tenants`
            await sendMessage(successMessage)
          } else {
            // Deployment created but not found in list - still show success with link
            const successMessage = `✅ ${pendingAction.action.label} completed successfully!\n\nView at: http://localhost:3000/deployments?filter=active&view=tenants\n\n(Note: It may take a moment to appear in the list)`
            await sendMessage(successMessage)
          }
        } else {
          // Couldn't verify but assume success
          const successMessage = `✅ ${pendingAction.action.label} completed successfully!\n\nView deployments: http://localhost:3000/deployments?filter=active&view=tenants`
          await sendMessage(successMessage)
        }
      } else {
        // Non-deployment actions
        const successMessage = `✅ ${pendingAction.action.label} completed successfully`
        await sendMessage(successMessage)
      }
    } catch (error) {
      console.error('Action execution error:', error)
      const errorMessage = `❌ Failed to ${pendingAction.action.label.toLowerCase()}: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
      await sendMessage(errorMessage)
    } finally {
      setIsExecuting(false)
      setPendingAction(null)
    }
  }

  const handleCancelAction = () => {
    setPendingAction(null)
  }

  // Don't render anything until hydrated to prevent layout shift from SSR mismatch
  // The sidebar state comes from localStorage which isn't available during SSR
  if (!isHydrated) {
    return null
  }

  return (
    <>
      {/* Toggle button - positioned outside overflow container */}
      {/* Disable transitions until hydrated to prevent layout shift on load */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed right-0 top-1/2 -translate-y-1/2 bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-l-lg shadow-lg z-50 ${isHydrated ? 'transition-all' : ''}`}
        style={{
          right: isOpen ? '315px' : '0',
          transition: isHydrated ? 'right 300ms ease-in-out' : 'none'
        }}
        aria-label={isOpen ? "Collapse assistant" : "Expand assistant"}
        title={isOpen ? "Collapse assistant" : "Expand assistant"}
      >
        {isOpen ? (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        )}
      </button>
      {/* Chat Sidebar - width transitions in/out, part of layout flow */}
      {/* Disable transitions until hydrated to prevent layout shift on load */}
      <div
        className={`flex-shrink-0 h-screen bg-gray-50 dark:bg-[#1e1e1e] border-l border-gray-300 dark:border-gray-800 shadow-2xl flex flex-col overflow-hidden relative ${
          isHydrated ? 'transition-all duration-300' : ''
        } ${
          isOpen ? 'w-[315px]' : 'w-0 border-l-0'
        }`}
      >

        {/* Inner content wrapper - maintains fixed 315px width */}
        <div className="w-[315px] flex flex-col h-full">
          {/* Header */}
          <div className="border-b border-gray-300 dark:border-gray-800 bg-white dark:bg-[#252526]">
            <div className="flex items-center gap-3 px-4 py-2.5">
              <svg className="w-4 h-4 text-gray-600 dark:text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300 tracking-tight flex-shrink-0">Assistant</h2>
              <div className="flex-1" />
              {messages.length > 0 && (
                <button
                  onClick={clearMessages}
                  className="px-2 py-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors flex-shrink-0 text-xs text-gray-600 dark:text-gray-400"
                  aria-label="Clear chat history"
                  title="Clear chat history"
                >
                  Clear messages
                </button>
              )}
            </div>

            {/* Badges row - always shows LLM status */}
            <div className="flex items-center gap-2 px-4 pb-2">
              {llmStatus === 'offline' ? (
                <span className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-500 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded" title="AI assistant unavailable - using fallback responses">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                  Chatbot temporarily does not have access to AI
                </span>
              ) : llmStatus === 'online' ? (
                <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-500 bg-gray-50 dark:bg-gray-800/50 px-2 py-0.5 rounded" title="Powered by Google Gemini">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  Using Gemini
                </span>
              ) : null}
              {(stats?.batchesWithFailures > 0 || stats?.versionDriftCount > 0 || stats?.dependencyIssuesCount > 0) && (
                <span className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-500 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  {(stats?.batchesWithFailures || 0) + (stats?.versionDriftCount || 0) + (stats?.dependencyIssuesCount || 0)} alerts
                </span>
              )}
              {confirmationsDisabled && (
                <button
                  onClick={() => {
                    localStorage.removeItem(SKIP_CONFIRMATIONS_KEY)
                    setConfirmationsDisabled(false)
                  }}
                  className="flex items-center gap-1.5 text-xs text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                  title="Click to re-enable confirmation prompts"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Auto-confirm ON
                </button>
              )}
            </div>
          </div>

          {/* Messages */}
          <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-3 bg-gray-50 dark:bg-[#1e1e1e]">
            {messages.length === 0 && !isLoading && (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/20 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                  AgentSync Assistant
                </h3>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">
                  Ask me about deployments, tenants, or system health
                </p>
                <div className="text-xs text-gray-500 dark:text-gray-500 space-y-1">
                  <p>💬 "What's the system status?"</p>
                  <p>🚀 "Deploy product agent to contoso"</p>
                  <p>🔍 "Show me failed deployments"</p>
                </div>
              </div>
            )}

            {messages.map((message) => (
              <ChatMessageComponent
                key={message.id}
                message={message}
                onActionClick={handleActionClick}
              />
            ))}

            {isLoading && (
              <div className="flex justify-start mb-3">
                <div className="bg-white dark:bg-[#252526] rounded px-3 py-2 border border-gray-300 dark:border-gray-800">
                  <div className="flex items-center gap-2 text-xs font-mono text-gray-500 dark:text-gray-500">
                    <div className="flex gap-1">
                      <div className="w-1 h-1 bg-gray-400 dark:bg-gray-600 rounded-full animate-bounce"></div>
                      <div className="w-1 h-1 bg-gray-400 dark:bg-gray-600 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                      <div className="w-1 h-1 bg-gray-400 dark:bg-gray-600 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                    </div>
                    <span>processing</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <ChatInput onSend={sendMessage} disabled={isLoading} placeholder="Ask about deployments, tenants, health..." />
        </div>
      </div>

      {/* Action Confirmation Modal */}
      {pendingAction && (
        <ActionConfirmation
          action={pendingAction.action}
          message={pendingAction.message}
          onConfirm={handleConfirmAction}
          onCancel={handleCancelAction}
          isExecuting={isExecuting}
        />
      )}
    </>
  )
}

/**
 * Generate a context-aware prompt based on the current page and system state
 */
function generateContextualPrompt(
  pathname: string,
  stats: any,
  deployments: any,
  approvals: any
): string {
  // Analyze system state
  const issues: string[] = []
  if (stats?.batchesWithFailures > 0) issues.push(`${stats.batchesWithFailures} failed deployments`)
  if (stats?.versionDriftCount > 0) issues.push(`${stats.versionDriftCount} tenants with version drift`)
  if (stats?.dependencyIssuesCount > 0) issues.push(`${stats.dependencyIssuesCount} tenants with missing dependencies`)
  if (approvals?.deployments?.length > 0) issues.push(`${approvals.deployments.length} deployments awaiting approval`)

  const hasIssues = issues.length > 0
  const hasActivity = stats?.activeDeployments > 0 || stats?.completedToday > 0

  // Dashboard page
  if (pathname === '/') {
    if (hasIssues) {
      return `I'm looking at the dashboard and I see ${issues.join(', ')}. What should I prioritize first and what actions should I take?`
    } else if (hasActivity) {
      return `I'm on the dashboard. What insights can you give me about recent deployment activity and system health?`
    } else {
      return `I'm on the dashboard. Everything looks quiet. What should I know about the current state of my agent deployments?`
    }
  }

  // Deployments page
  if (pathname?.startsWith('/deployments')) {
    if (stats?.batchesWithFailures > 0) {
      return `I'm looking at the deployments page. I see ${stats.batchesWithFailures} failed deployment${stats.batchesWithFailures !== 1 ? 's' : ''}. Help me understand what went wrong and what I should do to fix them.`
    } else if (stats?.activeDeployments > 0) {
      return `I'm on the deployments page watching ${stats.activeDeployments} active deployment${stats.activeDeployments !== 1 ? 's' : ''}. What should I be monitoring for and what are common issues to watch out for?`
    } else {
      return `I'm on the deployments page. What patterns should I look for in deployment history and what are best practices for managing agent deployments?`
    }
  }

  // Tenants page
  if (pathname?.startsWith('/tenants')) {
    if (stats?.versionDriftCount > 0 || stats?.dependencyIssuesCount > 0) {
      const tenantIssues: string[] = []
      if (stats?.versionDriftCount > 0) tenantIssues.push(`${stats.versionDriftCount} with version drift`)
      if (stats?.dependencyIssuesCount > 0) tenantIssues.push(`${stats.dependencyIssuesCount} with missing dependencies`)
      return `I'm looking at the tenants page and I see ${tenantIssues.join(' and ')}. What's the impact of these issues and how should I address them?`
    } else {
      return `I'm reviewing my tenant list. What health indicators should I be monitoring and what are signs that a tenant environment needs attention?`
    }
  }

  // Agents page
  if (pathname?.startsWith('/agents')) {
    return `I'm on the agents page managing my Copilot Studio solutions. What best practices should I follow for agent versioning and deployment strategies?`
  }

  // Settings page
  if (pathname?.startsWith('/settings')) {
    return `I'm in settings. What configuration options are most important for reliable multi-tenant agent deployments?`
  }

  // Default for any other page
  if (hasIssues) {
    return `I'm reviewing the system and I notice ${issues.join(', ')}. What do you recommend I focus on?`
  }

  return `I'm managing Copilot Studio agent deployments for multiple Microsoft 365 tenants. What should I know about the current state of my system?`
}

/**
 * Get confirmation message for an action
 */
function getConfirmationMessage(action: ChatAction): string {
  switch (action.type) {
    case 'deploy':
      const tenantCount = action.tenantIds?.length || 0
      return `Deploy ${action.agentName} to ${tenantCount} tenant${tenantCount !== 1 ? 's' : ''}?\n\nThis will create a new deployment and push the agent solution to the selected tenant environment${tenantCount !== 1 ? 's' : ''}.`

    case 'retry':
      return `Are you sure you want to retry deployment #${action.deploymentId}?\n\nThis will start a new deployment attempt with the same configuration.`

    case 'cancel':
      return `Are you sure you want to cancel deployment #${action.deploymentId}?\n\n⚠️ This action cannot be undone. The deployment will be marked as cancelled and you'll need to start over.`

    default:
      return `Confirm: ${action.label}`
  }
}

/**
 * Execute an action (call the appropriate API)
 */
async function executeAction(action: ChatAction): Promise<{ deploymentId?: string }> {
  switch (action.type) {
    case 'deploy':
      if (!action.agentName) throw new Error('Agent name is required')
      if (!action.tenantIds || action.tenantIds.length === 0) throw new Error('At least one tenant is required')

      // agentName should already be the ID from the LLM (e.g., "product-demo")
      const agentId = action.agentName

      // Step 1: Download the solution file
      const solutionResponse = await fetch(`/api/demo-solutions/${agentId}`)
      if (!solutionResponse.ok) {
        throw new Error(`Failed to download solution "${agentId}": ${solutionResponse.status}. Make sure the LLM is using agent IDs, not display names.`)
      }

      const solutionBlob = await solutionResponse.blob()
      const solutionFilename = agentId.includes('_managed')
        ? `${agentId}.zip`
        : `${agentId}_managed.zip`

      // Step 2: Create FormData with solution file and tenant IDs
      const formData = new FormData()
      formData.append('solution', solutionBlob, solutionFilename)
      formData.append('tenantIds', JSON.stringify(action.tenantIds))

      // Step 3: Send the deployment request
      const deployResponse = await fetch('/api/deployments/create', {
        method: 'POST',
        body: formData,
        // Don't set Content-Type header - browser will set it with boundary
      })

      if (!deployResponse.ok) {
        const error = await deployResponse.json()
        throw new Error(error.error || 'Failed to create deployment')
      }

      const deployData = await deployResponse.json()
      return { deploymentId: deployData.deploymentId || deployData.batchId }
      break

    case 'retry':
      if (!action.deploymentId) throw new Error('Deployment ID is required')

      const retryResponse = await fetch(`/api/deployments/${action.deploymentId}/retry`, {
        method: 'POST',
      })

      if (!retryResponse.ok) {
        const error = await retryResponse.json()
        throw new Error(error.error || 'Failed to retry deployment')
      }
      return {}

    case 'cancel':
      if (!action.deploymentId) throw new Error('Deployment ID is required')

      const cancelResponse = await fetch(`/api/deployments/${action.deploymentId}/cancel`, {
        method: 'POST',
      })

      if (!cancelResponse.ok) {
        const error = await cancelResponse.json()
        throw new Error(error.error || 'Failed to cancel deployment')
      }
      return {}

    default:
      throw new Error(`Unknown action type: ${action.type}`)
  }
}

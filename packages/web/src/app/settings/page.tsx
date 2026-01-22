'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { useTheme } from '@/components/providers/theme-provider'

const fetcher = (url: string) => fetch(url).then((res) => res.json())

type Tab = 'integration' | 'application' | 'notifications' | 'webhooks' | 'schedules'

// Demo values for showcasing the settings UI
const DEMO_SETTINGS = {
  integration: {
    partnerTenantId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    partnerClientId: 'f9e8d7c6-b5a4-3210-fedc-ba0987654321',
    partnerClientSecret: '••••••••••••••••',
    sourceTenantId: '',
    sourceEnvironmentUrl: 'https://pax8-demo.crm.dynamics.com',
    tenantDiscoveryEnabled: true,
    connectionMappingEnabled: true,
    environmentVariablesEnabled: false,
    lastTestResult: 'success' as const,
    lastTestedAt: '2026-01-30T16:00:00.000Z', // Fixed timestamp to avoid hydration mismatch
  },
  app: {
    demoMode: true,
    defaultMaxConcurrentDeployments: 3,
    defaultDeploymentTimeoutMs: 600000,
    autoRetryFailedDeployments: false,
    theme: 'system' as const,
  },
  isConfigured: true,
}

interface TestResult {
  step: string
  success: boolean
  message: string
  details?: string
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('integration')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResults, setTestResults] = useState<TestResult[] | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const { data: apiSettings, mutate } = useSWR('/api/settings', fetcher)
  const { setTheme } = useTheme()

  // Use demo settings when in demo mode with no real settings configured
  const isDemoMode = apiSettings?.app?.demoMode !== false && !apiSettings?.isConfigured
  const settings = isDemoMode ? DEMO_SETTINGS : apiSettings

  // Integration form state - pre-populate with demo values in demo mode
  const [integrationForm, setIntegrationForm] = useState({
    partnerTenantId: '',
    partnerClientId: '',
    partnerClientSecret: '',
    sourceTenantId: '',
    sourceEnvironmentUrl: '',
    tenantDiscoveryEnabled: false,
    connectionMappingEnabled: false,
    environmentVariablesEnabled: false,
  })

  // Track if we've initialized demo values
  const [demoInitialized, setDemoInitialized] = useState(false)

  // App form state
  const [appForm, setAppForm] = useState({
    demoMode: true,
    defaultMaxConcurrentDeployments: 3,
    defaultDeploymentTimeoutMs: 600000,
    autoRetryFailedDeployments: false,
    theme: 'system' as 'light' | 'dark' | 'system',
  })

  // Notification form state
  const [notificationForm, setNotificationForm] = useState({
    slackEnabled: false,
    slackWebhookUrl: '',
    teamsEnabled: false,
    teamsWebhookUrl: '',
    emailEnabled: false,
    emailRecipients: '',
    notifyOnDeploymentStart: true,
    notifyOnDeploymentComplete: true,
    notifyOnDeploymentFailure: true,
    notifyOnApprovalNeeded: true,
  })

  // Sync form with loaded settings
  const syncFormsWithSettings = () => {
    if (settings?.integration) {
      setIntegrationForm((prev) => ({
        ...prev,
        partnerTenantId: settings.integration.partnerTenantId || '',
        partnerClientId: settings.integration.partnerClientId || '',
        // Don't overwrite password if user has entered one
        partnerClientSecret: prev.partnerClientSecret || '',
        sourceTenantId: settings.integration.sourceTenantId || '',
        sourceEnvironmentUrl: settings.integration.sourceEnvironmentUrl || '',
        tenantDiscoveryEnabled: settings.integration.tenantDiscoveryEnabled || false,
        connectionMappingEnabled: settings.integration.connectionMappingEnabled || false,
        environmentVariablesEnabled: settings.integration.environmentVariablesEnabled || false,
      }))
    }
    if (settings?.app) {
      setAppForm({
        demoMode: settings.app.demoMode ?? true,
        defaultMaxConcurrentDeployments: settings.app.defaultMaxConcurrentDeployments ?? 3,
        defaultDeploymentTimeoutMs: settings.app.defaultDeploymentTimeoutMs ?? 600000,
        autoRetryFailedDeployments: settings.app.autoRetryFailedDeployments ?? false,
        theme: settings.app.theme ?? 'system',
      })
    }
    if (settings?.app) {
      setNotificationForm((prev) => ({
        ...prev,
        slackEnabled: settings.app.slackEnabled ?? false,
        slackWebhookUrl: prev.slackWebhookUrl || settings.app.slackWebhookUrl || '',
        teamsEnabled: settings.app.teamsEnabled ?? false,
        teamsWebhookUrl: prev.teamsWebhookUrl || settings.app.teamsWebhookUrl || '',
        emailEnabled: settings.app.emailEnabled ?? false,
        emailRecipients: settings.app.emailRecipients || '',
        notifyOnDeploymentStart: settings.app.notifyOnDeploymentStart ?? true,
        notifyOnDeploymentComplete: settings.app.notifyOnDeploymentComplete ?? true,
        notifyOnDeploymentFailure: settings.app.notifyOnDeploymentFailure ?? true,
        notifyOnApprovalNeeded: settings.app.notifyOnApprovalNeeded ?? true,
      }))
    }
  }

  // Sync on initial load using useEffect to avoid hydration issues
  useEffect(() => {
    if (settings && !integrationForm.partnerTenantId && settings.integration?.partnerTenantId) {
      syncFormsWithSettings()
    }
  }, [settings])

  // Initialize demo values when in demo mode
  useEffect(() => {
    if (isDemoMode && !demoInitialized && apiSettings !== undefined) {
      setIntegrationForm({
        partnerTenantId: DEMO_SETTINGS.integration.partnerTenantId,
        partnerClientId: DEMO_SETTINGS.integration.partnerClientId,
        partnerClientSecret: '',
        sourceTenantId: DEMO_SETTINGS.integration.sourceTenantId,
        sourceEnvironmentUrl: DEMO_SETTINGS.integration.sourceEnvironmentUrl,
        tenantDiscoveryEnabled: DEMO_SETTINGS.integration.tenantDiscoveryEnabled,
        connectionMappingEnabled: DEMO_SETTINGS.integration.connectionMappingEnabled,
        environmentVariablesEnabled: DEMO_SETTINGS.integration.environmentVariablesEnabled,
      })
      setAppForm({
        demoMode: DEMO_SETTINGS.app.demoMode,
        defaultMaxConcurrentDeployments: DEMO_SETTINGS.app.defaultMaxConcurrentDeployments,
        defaultDeploymentTimeoutMs: DEMO_SETTINGS.app.defaultDeploymentTimeoutMs,
        autoRetryFailedDeployments: DEMO_SETTINGS.app.autoRetryFailedDeployments,
        theme: DEMO_SETTINGS.app.theme,
      })
      setDemoInitialized(true)
    }
  }, [isDemoMode, demoInitialized, apiSettings])

  const saveIntegrationSettings = async () => {
    setSaving(true)
    setMessage(null)
    setTestResults(null)

    try {
      // Only include client secret if user entered a new one
      const updates: Record<string, unknown> = {
        partnerTenantId: integrationForm.partnerTenantId || undefined,
        partnerClientId: integrationForm.partnerClientId || undefined,
        sourceTenantId: integrationForm.sourceTenantId || undefined,
        sourceEnvironmentUrl: integrationForm.sourceEnvironmentUrl || undefined,
        tenantDiscoveryEnabled: integrationForm.tenantDiscoveryEnabled,
        connectionMappingEnabled: integrationForm.connectionMappingEnabled,
        environmentVariablesEnabled: integrationForm.environmentVariablesEnabled,
      }

      if (integrationForm.partnerClientSecret && integrationForm.partnerClientSecret !== '••••••••••••••••') {
        updates.partnerClientSecret = integrationForm.partnerClientSecret
      }

      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ integration: updates }),
      })

      if (!response.ok) {
        throw new Error('Failed to save settings')
      }

      await mutate()
      setMessage({ type: 'success', text: 'Integration settings saved successfully' })
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to save' })
    } finally {
      setSaving(false)
    }
  }

  const saveAppSettings = async () => {
    setSaving(true)
    setMessage(null)

    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app: appForm }),
      })

      if (!response.ok) {
        throw new Error('Failed to save settings')
      }

      await mutate()
      setMessage({ type: 'success', text: 'Application settings saved successfully' })
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to save' })
    } finally {
      setSaving(false)
    }
  }

  const saveNotificationSettings = async () => {
    setSaving(true)
    setMessage(null)

    try {
      // Prepare notification settings, masking webhooks if not changed
      const updates: Record<string, unknown> = {
        slackEnabled: notificationForm.slackEnabled,
        teamsEnabled: notificationForm.teamsEnabled,
        emailEnabled: notificationForm.emailEnabled,
        emailRecipients: notificationForm.emailRecipients,
        notifyOnDeploymentStart: notificationForm.notifyOnDeploymentStart,
        notifyOnDeploymentComplete: notificationForm.notifyOnDeploymentComplete,
        notifyOnDeploymentFailure: notificationForm.notifyOnDeploymentFailure,
        notifyOnApprovalNeeded: notificationForm.notifyOnApprovalNeeded,
      }

      // Only include webhook URLs if they were changed (not masked)
      if (notificationForm.slackWebhookUrl && !notificationForm.slackWebhookUrl.includes('••')) {
        updates.slackWebhookUrl = notificationForm.slackWebhookUrl
      }
      if (notificationForm.teamsWebhookUrl && !notificationForm.teamsWebhookUrl.includes('••')) {
        updates.teamsWebhookUrl = notificationForm.teamsWebhookUrl
      }

      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app: updates }),
      })

      if (!response.ok) {
        throw new Error('Failed to save settings')
      }

      await mutate()
      setMessage({ type: 'success', text: 'Notification settings saved successfully' })
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to save' })
    } finally {
      setSaving(false)
    }
  }

  const testNotification = async (channel: 'slack' | 'teams' | 'email') => {
    setTesting(true)
    setMessage(null)

    try {
      const response = await fetch('/api/settings/test-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel }),
      })

      const data = await response.json()

      if (data.success) {
        setMessage({ type: 'success', text: `Test ${channel} notification sent successfully!` })
      } else {
        setMessage({ type: 'error', text: data.error || `Failed to send test ${channel} notification` })
      }
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Test failed' })
    } finally {
      setTesting(false)
    }
  }

  const testConnection = async () => {
    setTesting(true)
    setTestResults(null)
    setMessage(null)

    try {
      const response = await fetch('/api/settings/test-connection', {
        method: 'POST',
      })

      const data = await response.json()
      setTestResults(data.results || [])

      if (data.success) {
        setMessage({ type: 'success', text: 'Connection test passed!' })
      } else {
        setMessage({ type: 'error', text: data.error || 'Connection test failed' })
      }

      await mutate()
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Test failed' })
    } finally {
      setTesting(false)
    }
  }

  const tabs = [
    { id: 'integration' as Tab, label: 'Integration', icon: '🔗' },
    { id: 'application' as Tab, label: 'Application', icon: '⚙️' },
    { id: 'notifications' as Tab, label: 'Notifications', icon: '🔔' },
    { id: 'webhooks' as Tab, label: 'Webhooks', icon: '🔌' },
    { id: 'schedules' as Tab, label: 'Schedules', icon: '⏰' },
  ]

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Settings</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Configure AgentSync integration and application settings
        </p>
      </div>

      {/* Demo mode banner */}
      {isDemoMode && (
        <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700">
          <div className="flex items-start gap-2">
            <span className="text-amber-600 dark:text-amber-400 mt-0.5">⚠️</span>
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Demo Mode</p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                Showing sample configuration values. These are example credentials for demonstration purposes only.
                Complete the <a href="/welcome" className="underline hover:text-amber-900 dark:hover:text-amber-200">setup guide</a> to connect to your real Power Platform environment.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Message banner */}
      {message && (
        <div
          className={`mb-4 p-3 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Integration Tab */}
      {activeTab === 'integration' && (
        <div className="space-y-6">
          {/* Status Card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-gray-900 dark:text-white">Connection Status</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {settings?.isConfigured
                    ? settings?.integration?.lastTestResult === 'success'
                      ? 'Connected and verified'
                      : settings?.integration?.lastTestResult === 'failed'
                      ? 'Configured but last test failed'
                      : 'Configured - not yet tested'
                    : 'Not configured'}
                </p>
                {settings?.integration?.lastTestedAt && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1" suppressHydrationWarning>
                    Last tested: {new Date(settings.integration.lastTestedAt).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'}
                  </p>
                )}
              </div>
              <div
                className={`w-3 h-3 rounded-full ${
                  settings?.isConfigured
                    ? settings?.integration?.lastTestResult === 'success'
                      ? 'bg-green-500'
                      : settings?.integration?.lastTestResult === 'failed'
                      ? 'bg-red-500'
                      : 'bg-yellow-500'
                    : 'bg-gray-300'
                }`}
              />
            </div>
          </div>

          {/* Partner Credentials */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Partner Credentials</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Configure your Azure AD app registration for GDAP-based access to customer tenants.
                </p>
              </div>
              <a
                href="/welcome"
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap ml-4"
              >
                Setup Guide →
              </a>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Partner Tenant ID
                </label>
                <input
                  type="text"
                  value={integrationForm.partnerTenantId}
                  onChange={(e) =>
                    setIntegrationForm({ ...integrationForm, partnerTenantId: e.target.value })
                  }
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Your MSP/Partner Azure AD tenant ID</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Application (Client) ID
                </label>
                <input
                  type="text"
                  value={integrationForm.partnerClientId}
                  onChange={(e) =>
                    setIntegrationForm({ ...integrationForm, partnerClientId: e.target.value })
                  }
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">From your Azure AD app registration</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Client Secret
                </label>
                <input
                  type="password"
                  value={integrationForm.partnerClientSecret}
                  onChange={(e) =>
                    setIntegrationForm({ ...integrationForm, partnerClientSecret: e.target.value })
                  }
                  placeholder={settings?.integration?.partnerClientSecret ? '••••••••••••••••' : 'Enter client secret'}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Stored encrypted at rest. Leave blank to keep existing value.
                </p>
              </div>
            </div>
          </div>

          {/* Source Environment */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Source Environment (Optional)</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
              Configure a central Power Platform environment to import agents directly without uploading ZIP files.
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-4 italic">
              💡 Recommended: This allows one-click import of agents from your master environment
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Source Tenant ID
                </label>
                <input
                  type="text"
                  value={integrationForm.sourceTenantId}
                  onChange={(e) =>
                    setIntegrationForm({ ...integrationForm, sourceTenantId: e.target.value })
                  }
                  placeholder="Leave blank to use partner tenant"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Source Environment URL
                </label>
                <input
                  type="text"
                  value={integrationForm.sourceEnvironmentUrl}
                  onChange={(e) =>
                    setIntegrationForm({ ...integrationForm, sourceEnvironmentUrl: e.target.value })
                  }
                  placeholder="https://yourorg.crm.dynamics.com"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Feature Flags */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Features</h3>

            <div className="space-y-3">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={integrationForm.tenantDiscoveryEnabled}
                  onChange={(e) =>
                    setIntegrationForm({
                      ...integrationForm,
                      tenantDiscoveryEnabled: e.target.checked,
                    })
                  }
                  className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:bg-gray-700"
                />
                <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                  Enable GDAP Tenant Discovery
                </span>
              </label>
              <p className="text-xs text-gray-400 dark:text-gray-500 ml-6">
                Automatically discover customer tenants via Partner Center API
              </p>

              <label className="flex items-center mt-4">
                <input
                  type="checkbox"
                  checked={integrationForm.connectionMappingEnabled}
                  onChange={(e) =>
                    setIntegrationForm({
                      ...integrationForm,
                      connectionMappingEnabled: e.target.checked,
                    })
                  }
                  className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:bg-gray-700"
                />
                <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                  Enable Connection Reference Mapping
                </span>
              </label>
              <p className="text-xs text-gray-400 dark:text-gray-500 ml-6">
                Map connection references during deployment
              </p>

              <label className="flex items-center mt-4">
                <input
                  type="checkbox"
                  checked={integrationForm.environmentVariablesEnabled}
                  onChange={(e) =>
                    setIntegrationForm({
                      ...integrationForm,
                      environmentVariablesEnabled: e.target.checked,
                    })
                  }
                  className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:bg-gray-700"
                />
                <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                  Enable Environment Variable Configuration
                </span>
              </label>
              <p className="text-xs text-gray-400 dark:text-gray-500 ml-6">
                Configure environment variables per tenant during deployment
              </p>
            </div>
          </div>

          {/* Test Results */}
          {testResults && testResults.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Test Results</h3>
              <div className="space-y-3">
                {testResults.map((result, i) => (
                  <div
                    key={i}
                    className={`flex items-start p-3 rounded-lg ${
                      result.success ? 'bg-green-50 dark:bg-green-900/30' : 'bg-red-50 dark:bg-red-900/30'
                    }`}
                  >
                    <span className="mr-2">{result.success ? '✓' : '✗'}</span>
                    <div>
                      <p
                        className={`text-sm font-medium ${
                          result.success ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'
                        }`}
                      >
                        {result.message}
                      </p>
                      {result.details && (
                        <p
                          className={`text-xs ${
                            result.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {result.details}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-between">
            <button
              onClick={testConnection}
              disabled={testing || !settings?.isConfigured}
              className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 disabled:opacity-50"
            >
              {testing ? 'Testing...' : 'Test Connection'}
            </button>

            <button
              onClick={saveIntegrationSettings}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Integration Settings'}
            </button>
          </div>
        </div>
      )}

      {/* Application Tab */}
      {activeTab === 'application' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">General Settings</h3>

            <div className="space-y-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={appForm.demoMode}
                  onChange={(e) => setAppForm({ ...appForm, demoMode: e.target.checked })}
                  className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:bg-gray-700"
                />
                <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Demo Mode</span>
              </label>
              <p className="text-xs text-gray-400 dark:text-gray-500 ml-6">
                Use mock data instead of real Power Platform connections
              </p>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Theme</label>
                <select
                  value={appForm.theme}
                  onChange={(e) => {
                    const newTheme = e.target.value as 'light' | 'dark' | 'system'
                    setAppForm({ ...appForm, theme: newTheme })
                    setTheme(newTheme)
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Deployment Defaults</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Max Concurrent Deployments
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={appForm.defaultMaxConcurrentDeployments}
                  onChange={(e) =>
                    setAppForm({
                      ...appForm,
                      defaultMaxConcurrentDeployments: parseInt(e.target.value) || 3,
                    })
                  }
                  className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Number of tenants to deploy to simultaneously
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Deployment Timeout (minutes)
                </label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={Math.round(appForm.defaultDeploymentTimeoutMs / 60000)}
                  onChange={(e) =>
                    setAppForm({
                      ...appForm,
                      defaultDeploymentTimeoutMs: (parseInt(e.target.value) || 10) * 60000,
                    })
                  }
                  className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Maximum time to wait for solution import
                </p>
              </div>

              <label className="flex items-center mt-4">
                <input
                  type="checkbox"
                  checked={appForm.autoRetryFailedDeployments}
                  onChange={(e) =>
                    setAppForm({ ...appForm, autoRetryFailedDeployments: e.target.checked })
                  }
                  className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:bg-gray-700"
                />
                <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                  Auto-retry failed deployments
                </span>
              </label>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={saveAppSettings}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Application Settings'}
            </button>
          </div>
        </div>
      )}

      {/* Notifications Tab */}
      {activeTab === 'notifications' && (
        <div className="space-y-6">
          {/* Slack Notifications */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">Slack</h3>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notificationForm.slackEnabled}
                      onChange={(e) => setNotificationForm({ ...notificationForm, slackEnabled: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-300 dark:bg-gray-600 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Send notifications to a Slack channel via incoming webhook
                </p>
              </div>
              {notificationForm.slackEnabled && (
                <button
                  onClick={() => testNotification('slack')}
                  disabled={testing || !notificationForm.slackWebhookUrl}
                  className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {testing ? 'Testing...' : 'Test'}
                </button>
              )}
            </div>

            {notificationForm.slackEnabled && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Webhook URL
                </label>
                <input
                  type="password"
                  value={notificationForm.slackWebhookUrl}
                  onChange={(e) => setNotificationForm({ ...notificationForm, slackWebhookUrl: e.target.value })}
                  placeholder="https://hooks.slack.com/services/..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Get your webhook URL from Slack's incoming webhooks app
                </p>
              </div>
            )}
          </div>

          {/* Microsoft Teams Notifications */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">Microsoft Teams</h3>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notificationForm.teamsEnabled}
                      onChange={(e) => setNotificationForm({ ...notificationForm, teamsEnabled: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-300 dark:bg-gray-600 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Send notifications to a Teams channel via incoming webhook
                </p>
              </div>
              {notificationForm.teamsEnabled && (
                <button
                  onClick={() => testNotification('teams')}
                  disabled={testing || !notificationForm.teamsWebhookUrl}
                  className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {testing ? 'Testing...' : 'Test'}
                </button>
              )}
            </div>

            {notificationForm.teamsEnabled && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Webhook URL
                </label>
                <input
                  type="password"
                  value={notificationForm.teamsWebhookUrl}
                  onChange={(e) => setNotificationForm({ ...notificationForm, teamsWebhookUrl: e.target.value })}
                  placeholder="https://outlook.office.com/webhook/..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Create an incoming webhook connector in your Teams channel
                </p>
              </div>
            )}
          </div>

          {/* Email Notifications */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">Email</h3>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notificationForm.emailEnabled}
                      onChange={(e) => setNotificationForm({ ...notificationForm, emailEnabled: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-300 dark:bg-gray-600 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Send deployment notifications via email
                </p>
              </div>
              {notificationForm.emailEnabled && (
                <button
                  onClick={() => testNotification('email')}
                  disabled={testing || !notificationForm.emailRecipients}
                  className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {testing ? 'Testing...' : 'Test'}
                </button>
              )}
            </div>

            {notificationForm.emailEnabled && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Recipients
                </label>
                <input
                  type="text"
                  value={notificationForm.emailRecipients}
                  onChange={(e) => setNotificationForm({ ...notificationForm, emailRecipients: e.target.value })}
                  placeholder="admin@example.com, team@example.com"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Comma-separated list of email addresses
                </p>
              </div>
            )}
          </div>

          {/* Notification Events */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Notification Events</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Choose which events trigger notifications
            </p>

            <div className="space-y-3">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={notificationForm.notifyOnDeploymentStart}
                  onChange={(e) => setNotificationForm({ ...notificationForm, notifyOnDeploymentStart: e.target.checked })}
                  className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:bg-gray-700"
                />
                <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                  Deployment started
                </span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={notificationForm.notifyOnDeploymentComplete}
                  onChange={(e) => setNotificationForm({ ...notificationForm, notifyOnDeploymentComplete: e.target.checked })}
                  className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:bg-gray-700"
                />
                <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                  Deployment completed successfully
                </span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={notificationForm.notifyOnDeploymentFailure}
                  onChange={(e) => setNotificationForm({ ...notificationForm, notifyOnDeploymentFailure: e.target.checked })}
                  className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:bg-gray-700"
                />
                <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                  Deployment failed
                </span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={notificationForm.notifyOnApprovalNeeded}
                  onChange={(e) => setNotificationForm({ ...notificationForm, notifyOnApprovalNeeded: e.target.checked })}
                  className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:bg-gray-700"
                />
                <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                  Approval required
                </span>
              </label>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              onClick={saveNotificationSettings}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Notification Settings'}
            </button>
          </div>
        </div>
      )}

      {/* Schedules Tab */}
      {activeTab === 'schedules' && <SchedulesTab />}

      {/* Webhooks Tab */}
      {activeTab === 'webhooks' && <WebhooksTab />}
    </div>
  )
}

/**
 * Schedules Tab Component
 * Manages scheduled deployments
 */
function SchedulesTab() {
  const [scheduleInfo, setScheduleInfo] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [registering, setRegistering] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [solutionName, setSolutionName] = useState('')
  const [solutionPath, setSolutionPath] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const loadSchedules = async () => {
    try {
      const res = await fetch('/api/schedules')
      if (!res.ok) throw new Error('Failed to load schedules')
      const data = await res.json()
      setScheduleInfo(data)
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to load schedules' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSchedules()
  }, [])

  const registerSchedule = async () => {
    if (!solutionName.trim() || !solutionPath.trim()) {
      setMessage({ type: 'error', text: 'Solution name and path are required' })
      return
    }

    setRegistering(true)
    try {
      const res = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ solutionName, solutionPath }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to register schedule')
      }

      const data = await res.json()
      setMessage({
        type: 'success',
        text: `Registered ${data.registered} schedule(s)${data.errors.length > 0 ? ` (${data.errors.length} errors)` : ''}`
      })
      setSolutionName('')
      setSolutionPath('')
      loadSchedules()
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to register schedule'
      })
    } finally {
      setRegistering(false)
    }
  }

  const removeAllSchedules = async () => {
    if (!confirm('Are you sure you want to remove all scheduled deployments?')) return

    setRemoving(true)
    try {
      const res = await fetch('/api/schedules', { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to remove schedules')

      const data = await res.json()
      setMessage({ type: 'success', text: `Removed ${data.removed} schedule(s)` })
      loadSchedules()
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to remove schedules' })
    } finally {
      setRemoving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500 dark:text-gray-400">Loading schedules...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Scheduled Deployments</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Automatically trigger deployments at scheduled times using cron expressions
        </p>

        {/* Message */}
        {message && (
          <div className={`mt-4 p-3 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300'
              : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300'
          }`}>
            <p className="text-sm">{message.text}</p>
          </div>
        )}

        {/* Config-based Schedule */}
        {scheduleInfo?.enabled && (
          <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <h4 className="font-medium text-blue-900 dark:text-blue-300 mb-2">Configuration Schedule</h4>
            <div className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
              <p><strong>Cron:</strong> <code className="font-mono">{scheduleInfo.cron}</code></p>
              <p><strong>Description:</strong> {scheduleInfo.cronDescription}</p>
              <p><strong>Timezone:</strong> {scheduleInfo.timezone}</p>
              {scheduleInfo.isCurrentlyInWindow !== null && (
                <p>
                  <strong>Status:</strong>{' '}
                  <span className={scheduleInfo.isCurrentlyInWindow ? 'text-green-700 dark:text-green-300' : 'text-gray-600 dark:text-gray-400'}>
                    {scheduleInfo.isCurrentlyInWindow ? 'In maintenance window' : 'Outside maintenance window'}
                  </span>
                </p>
              )}
              {scheduleInfo.nextRuns && scheduleInfo.nextRuns.length > 0 && (
                <div>
                  <p className="font-medium mb-1">Next 5 runs:</p>
                  <ul className="list-disc list-inside space-y-1">
                    {scheduleInfo.nextRuns.map((run: string, idx: number) => (
                      <li key={idx}>{new Date(run).toLocaleString()}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Registered Schedules */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">Registered Schedules</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Active scheduled deployments in the queue
            </p>
          </div>
          {scheduleInfo?.registeredSchedules && scheduleInfo.registeredSchedules.length > 0 && (
            <button
              onClick={removeAllSchedules}
              disabled={removing}
              className="px-4 py-2 text-sm font-medium text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50"
            >
              {removing ? 'Removing...' : 'Remove All'}
            </button>
          )}
        </div>

        {!scheduleInfo?.registeredSchedules || scheduleInfo.registeredSchedules.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No schedules registered. Register a schedule below to activate automated deployments.
          </p>
        ) : (
          <div className="space-y-3">
            {scheduleInfo.registeredSchedules.map((schedule: any) => (
              <div
                key={schedule.id}
                className="p-4 rounded-lg border border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900 dark:text-white">{schedule.name}</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      <code className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                        {schedule.cron}
                      </code>
                      {' · '}
                      {schedule.timezone}
                    </p>
                    {schedule.nextRun && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Next run: {new Date(schedule.nextRun).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Register Schedule Form */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Register Schedule
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Register a scheduled deployment from your configuration file
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Solution Name
            </label>
            <input
              type="text"
              value={solutionName}
              onChange={(e) => setSolutionName(e.target.value)}
              placeholder="e.g., MyAgent"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Solution Path
            </label>
            <input
              type="text"
              value={solutionPath}
              onChange={(e) => setSolutionPath(e.target.value)}
              placeholder="e.g., ./solutions/MyAgent.zip"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>

          <button
            onClick={registerSchedule}
            disabled={registering}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {registering ? 'Registering...' : 'Register Schedule'}
          </button>
        </div>
      </div>

      {/* Documentation */}
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 p-6">
        <h3 className="text-lg font-medium text-blue-900 dark:text-blue-300 mb-3">
          About Scheduled Deployments
        </h3>
        <div className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
          <p>
            Schedules are configured in your tenants.yaml config file under settings.schedule
          </p>
          <p>
            Example configuration:
          </p>
          <pre className="bg-blue-100 dark:bg-blue-900/50 p-3 rounded font-mono text-xs overflow-x-auto">
{`settings:
  schedule:
    cron: "0 2 * * 0"  # Every Sunday at 2 AM
    timezone: "America/Denver"
    maintenanceWindow:
      start: "01:00"
      end: "05:00"`}
          </pre>
          <p>
            After updating your config, use the "Register Schedule" form above to activate it.
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * Webhooks Tab Component
 * Manages CI/CD webhook configurations
 */
function WebhooksTab() {
  const [webhooks, setWebhooks] = useState<any[]>([])
  const [invocations, setInvocations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newWebhookName, setNewWebhookName] = useState('')
  const [selectedWebhook, setSelectedWebhook] = useState<string | null>(null)
  const [copiedSecret, setCopiedSecret] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Load webhooks
  const loadWebhooks = async () => {
    try {
      const res = await fetch('/api/webhooks/manage')
      if (!res.ok) throw new Error('Failed to load webhooks')
      const data = await res.json()
      setWebhooks(data.webhooks || [])
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to load webhooks' })
    } finally {
      setLoading(false)
    }
  }

  // Load invocations for selected webhook
  const loadInvocations = async (webhookId: string) => {
    try {
      const res = await fetch(`/api/webhooks/invocations?webhookId=${webhookId}&limit=50`)
      if (!res.ok) throw new Error('Failed to load invocations')
      const data = await res.json()
      setInvocations(data.invocations || [])
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to load invocation history' })
    }
  }

  useEffect(() => {
    loadWebhooks()
  }, [])

  useEffect(() => {
    if (selectedWebhook) {
      loadInvocations(selectedWebhook)
    }
  }, [selectedWebhook])

  const createWebhook = async () => {
    if (!newWebhookName.trim()) {
      setMessage({ type: 'error', text: 'Webhook name is required' })
      return
    }

    setCreating(true)
    try {
      const res = await fetch('/api/webhooks/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newWebhookName }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.message || 'Failed to create webhook')
      }

      const data = await res.json()
      setMessage({
        type: 'success',
        text: `Webhook created! Secret: ${data.webhook.secret} (save this - it won't be shown again)`
      })
      setNewWebhookName('')
      setShowCreateForm(false)
      loadWebhooks()
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to create webhook'
      })
    } finally {
      setCreating(false)
    }
  }

  const toggleWebhook = async (webhookId: string, enabled: boolean) => {
    try {
      const res = await fetch(`/api/webhooks/manage?id=${webhookId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !enabled }),
      })

      if (!res.ok) throw new Error('Failed to update webhook')

      setMessage({ type: 'success', text: `Webhook ${!enabled ? 'enabled' : 'disabled'}` })
      loadWebhooks()
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to update webhook' })
    }
  }

  const deleteWebhook = async (webhookId: string) => {
    if (!confirm('Are you sure you want to delete this webhook?')) return

    try {
      const res = await fetch(`/api/webhooks/manage?id=${webhookId}`, {
        method: 'DELETE',
      })

      if (!res.ok) throw new Error('Failed to delete webhook')

      setMessage({ type: 'success', text: 'Webhook deleted' })
      loadWebhooks()
      if (selectedWebhook === webhookId) {
        setSelectedWebhook(null)
        setInvocations([])
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to delete webhook' })
    }
  }

  const regenerateSecret = async (webhookId: string) => {
    if (!confirm('Regenerating the secret will invalidate the old one. Continue?')) return

    try {
      const res = await fetch(`/api/webhooks/manage?id=${webhookId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerateSecret: true }),
      })

      if (!res.ok) throw new Error('Failed to regenerate secret')

      const data = await res.json()
      setMessage({
        type: 'success',
        text: `New secret: ${data.newSecret} (save this - it won't be shown again)`
      })
      loadWebhooks()
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to regenerate secret' })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500 dark:text-gray-400">Loading webhooks...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">CI/CD Webhooks</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Trigger deployments from external CI/CD systems like GitHub Actions, Azure DevOps, or GitLab CI
            </p>
          </div>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            {showCreateForm ? 'Cancel' : 'Create Webhook'}
          </button>
        </div>

        {/* Message */}
        {message && (
          <div className={`mb-4 p-3 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300'
              : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300'
          }`}>
            <p className="text-sm font-mono break-all">{message.text}</p>
          </div>
        )}

        {/* Create Form */}
        {showCreateForm && (
          <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Webhook Name
            </label>
            <input
              type="text"
              value={newWebhookName}
              onChange={(e) => setNewWebhookName(e.target.value)}
              placeholder="e.g., GitHub Actions"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white mb-3"
            />
            <button
              onClick={createWebhook}
              disabled={creating}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        )}

        {/* Webhooks List */}
        {webhooks.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No webhooks configured. Create one to get started.
          </p>
        ) : (
          <div className="space-y-3">
            {webhooks.map((webhook) => (
              <div
                key={webhook.id}
                className={`p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                  selectedWebhook === webhook.id
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
                onClick={() => setSelectedWebhook(webhook.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h4 className="font-medium text-gray-900 dark:text-white">{webhook.name}</h4>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        webhook.enabled
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                      }`}>
                        {webhook.enabled ? 'Active' : 'Disabled'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      ID: <code className="font-mono">{webhook.id}</code>
                    </p>
                    {webhook.lastUsedAt && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Last used: {new Date(webhook.lastUsedAt).toLocaleString()}
                      </p>
                    )}
                    {webhook.recentInvocations > 0 && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Recent invocations: {webhook.recentInvocations} ({webhook.successRate}% success)
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleWebhook(webhook.id, webhook.enabled)
                      }}
                      className="px-3 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                      {webhook.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        regenerateSecret(webhook.id)
                      }}
                      className="px-3 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/30 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50"
                    >
                      Regenerate Secret
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteWebhook(webhook.id)
                      }}
                      className="px-3 py-1 text-xs font-medium text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30 rounded hover:bg-red-200 dark:hover:bg-red-900/50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Invocation History */}
      {selectedWebhook && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Invocation History
          </h3>
          {invocations.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No invocations yet for this webhook.
            </p>
          ) : (
            <div className="space-y-2">
              {invocations.map((inv) => (
                <div
                  key={inv.id}
                  className="p-3 rounded-lg border border-gray-200 dark:border-gray-700"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          inv.status === 'success'
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                            : inv.status === 'invalid_signature'
                            ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                            : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                        }`}>
                          {inv.status}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {new Date(inv.createdAt).toLocaleString()}
                        </span>
                      </div>
                      {inv.batchId && (
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          Deployment: <code className="font-mono">{inv.batchId}</code>
                        </p>
                      )}
                      {inv.errorMessage && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                          Error: {inv.errorMessage}
                        </p>
                      )}
                      {inv.payload && typeof inv.payload === 'object' && (
                        <details className="mt-2">
                          <summary className="text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
                            View payload
                          </summary>
                          <pre className="text-xs bg-gray-50 dark:bg-gray-900 p-2 rounded mt-1 overflow-x-auto">
                            {JSON.stringify(inv.payload, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Documentation */}
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 p-6">
        <h3 className="text-lg font-medium text-blue-900 dark:text-blue-300 mb-3">
          How to use webhooks
        </h3>
        <div className="space-y-3 text-sm text-blue-800 dark:text-blue-200">
          <p>
            1. Create a webhook above and save the secret securely
          </p>
          <p>
            2. Configure your CI/CD system to send POST requests to:
          </p>
          <code className="block bg-blue-100 dark:bg-blue-900/50 p-2 rounded font-mono text-xs">
            {typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/deploy
          </code>
          <p>
            3. Include these headers:
          </p>
          <pre className="bg-blue-100 dark:bg-blue-900/50 p-2 rounded font-mono text-xs">
{`Authorization: Bearer <webhook-secret>
x-webhook-timestamp: <current-unix-ms>
x-webhook-signature: <hmac-sha256-signature>`}
          </pre>
          <p>
            4. Send this JSON payload:
          </p>
          <pre className="bg-blue-100 dark:bg-blue-900/50 p-2 rounded font-mono text-xs">
{`{
  "solution": "YourAgentName",
  "version": "1.0.0",
  "tenants": ["tenant-id"] or "all",
  "metadata": {
    "commit": "abc123",
    "branch": "main"
  }
}`}
          </pre>
        </div>
      </div>
    </div>
  )
}

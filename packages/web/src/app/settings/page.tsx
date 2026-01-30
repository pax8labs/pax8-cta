'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then((res) => res.json())

type Tab = 'integration' | 'application' | 'notifications'

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
    lastTestedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
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
  ]

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Configure AgentSync integration and application settings
        </p>
      </div>

      {/* Demo mode banner */}
      {isDemoMode && (
        <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
          <div className="flex items-start gap-2">
            <span className="text-amber-600 mt-0.5">⚠️</span>
            <div>
              <p className="text-sm font-medium text-amber-800">Demo Mode</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Showing sample configuration values. These are example credentials for demonstration purposes only.
                Complete the <a href="/welcome" className="underline hover:text-amber-900">setup wizard</a> to connect to your real Power Platform environment.
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
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
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
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-gray-900">Connection Status</h3>
                <p className="text-sm text-gray-500">
                  {settings?.isConfigured
                    ? settings?.integration?.lastTestResult === 'success'
                      ? 'Connected and verified'
                      : settings?.integration?.lastTestResult === 'failed'
                      ? 'Configured but last test failed'
                      : 'Configured - not yet tested'
                    : 'Not configured'}
                </p>
                {settings?.integration?.lastTestedAt && (
                  <p className="text-xs text-gray-400 mt-1">
                    Last tested: {new Date(settings.integration.lastTestedAt).toLocaleString()}
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
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Partner Credentials</h3>
            <p className="text-sm text-gray-500 mb-4">
              Configure your Azure AD app registration for GDAP-based access to customer tenants.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Partner Tenant ID
                </label>
                <input
                  type="text"
                  value={integrationForm.partnerTenantId}
                  onChange={(e) =>
                    setIntegrationForm({ ...integrationForm, partnerTenantId: e.target.value })
                  }
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 mt-1">Your MSP/Partner Azure AD tenant ID</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Application (Client) ID
                </label>
                <input
                  type="text"
                  value={integrationForm.partnerClientId}
                  onChange={(e) =>
                    setIntegrationForm({ ...integrationForm, partnerClientId: e.target.value })
                  }
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 mt-1">From your Azure AD app registration</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Client Secret
                </label>
                <input
                  type="password"
                  value={integrationForm.partnerClientSecret}
                  onChange={(e) =>
                    setIntegrationForm({ ...integrationForm, partnerClientSecret: e.target.value })
                  }
                  placeholder={settings?.integration?.partnerClientSecret ? '••••••••••••••••' : 'Enter client secret'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Stored encrypted at rest. Leave blank to keep existing value.
                </p>
              </div>
            </div>
          </div>

          {/* Source Environment */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Source Environment (Optional)</h3>
            <p className="text-sm text-gray-500 mb-4">
              If your agents are stored in a central Power Platform environment, configure it here.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Source Tenant ID
                </label>
                <input
                  type="text"
                  value={integrationForm.sourceTenantId}
                  onChange={(e) =>
                    setIntegrationForm({ ...integrationForm, sourceTenantId: e.target.value })
                  }
                  placeholder="Leave blank to use partner tenant"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Source Environment URL
                </label>
                <input
                  type="text"
                  value={integrationForm.sourceEnvironmentUrl}
                  onChange={(e) =>
                    setIntegrationForm({ ...integrationForm, sourceEnvironmentUrl: e.target.value })
                  }
                  placeholder="https://yourorg.crm.dynamics.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Feature Flags */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Features</h3>

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
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">
                  Enable GDAP Tenant Discovery
                </span>
              </label>
              <p className="text-xs text-gray-400 ml-6">
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
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">
                  Enable Connection Reference Mapping
                </span>
              </label>
              <p className="text-xs text-gray-400 ml-6">
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
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">
                  Enable Environment Variable Configuration
                </span>
              </label>
              <p className="text-xs text-gray-400 ml-6">
                Configure environment variables per tenant during deployment
              </p>
            </div>
          </div>

          {/* Test Results */}
          {testResults && testResults.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Test Results</h3>
              <div className="space-y-3">
                {testResults.map((result, i) => (
                  <div
                    key={i}
                    className={`flex items-start p-3 rounded-lg ${
                      result.success ? 'bg-green-50' : 'bg-red-50'
                    }`}
                  >
                    <span className="mr-2">{result.success ? '✓' : '✗'}</span>
                    <div>
                      <p
                        className={`text-sm font-medium ${
                          result.success ? 'text-green-800' : 'text-red-800'
                        }`}
                      >
                        {result.message}
                      </p>
                      {result.details && (
                        <p
                          className={`text-xs ${
                            result.success ? 'text-green-600' : 'text-red-600'
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
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">General Settings</h3>

            <div className="space-y-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={appForm.demoMode}
                  onChange={(e) => setAppForm({ ...appForm, demoMode: e.target.checked })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">Demo Mode</span>
              </label>
              <p className="text-xs text-gray-400 ml-6">
                Use mock data instead of real Power Platform connections
              </p>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Theme</label>
                <select
                  value={appForm.theme}
                  onChange={(e) =>
                    setAppForm({ ...appForm, theme: e.target.value as 'light' | 'dark' | 'system' })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Deployment Defaults</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
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
                  className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Number of tenants to deploy to simultaneously
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
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
                  className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 mt-1">
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
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">
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
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Notification Settings</h3>
            <p className="text-sm text-gray-500">
              Notification configuration coming soon. This will include Slack webhooks, Teams webhooks, and email notifications for deployment events.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

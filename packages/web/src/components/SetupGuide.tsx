/**
 * Copyright 2024 Pax8 Labs
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface SetupGuideProps {
  onComplete?: () => void;
  onSkip?: () => void;
}

type Step = "welcome" | "credentials" | "source" | "features" | "test" | "complete";

interface TestResult {
  step: string;
  success: boolean;
  message: string;
  details?: string;
}

export function SetupGuide({ onComplete, onSkip }: SetupGuideProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<Step>("welcome");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[] | null>(null);
  const [testSuccess, setTestSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({
    partnerTenantId: "",
    partnerClientId: "",
    partnerClientSecret: "",
    sourceTenantId: "",
    sourceEnvironmentUrl: "",
    tenantDiscoveryEnabled: true,
    connectionMappingEnabled: true,
    environmentVariablesEnabled: false,
  });

  const steps: { id: Step; title: string; description: string }[] = [
    { id: "welcome", title: "Welcome", description: "Get started with AgentSync" },
    { id: "credentials", title: "Credentials", description: "Connect to Azure AD" },
    { id: "source", title: "Source", description: "Configure agent source" },
    { id: "features", title: "Features", description: "Enable capabilities" },
    { id: "test", title: "Test", description: "Verify connection" },
    { id: "complete", title: "Complete", description: "All set!" },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);

  const saveSettings = async () => {
    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          integration: {
            partnerTenantId: form.partnerTenantId || undefined,
            partnerClientId: form.partnerClientId || undefined,
            partnerClientSecret: form.partnerClientSecret || undefined,
            sourceTenantId: form.sourceTenantId || undefined,
            sourceEnvironmentUrl: form.sourceEnvironmentUrl || undefined,
            tenantDiscoveryEnabled: form.tenantDiscoveryEnabled,
            connectionMappingEnabled: form.connectionMappingEnabled,
            environmentVariablesEnabled: form.environmentVariablesEnabled,
          },
          app: {
            demoMode: false, // Disable demo mode when completing setup
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save settings");
      }

      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResults(null);
    setTestSuccess(false);
    setError(null);

    try {
      // First save the current settings
      const saved = await saveSettings();
      if (!saved) return;

      // Then test
      const response = await fetch("/api/settings/test-connection", {
        method: "POST",
      });

      const data = await response.json();
      setTestResults(data.results || []);
      setTestSuccess(data.success);

      if (!data.success) {
        setError(data.error || "Connection test failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test failed");
    } finally {
      setTesting(false);
    }
  };

  const handleNext = async () => {
    if (currentStep === "features") {
      // Save before going to test
      const saved = await saveSettings();
      if (saved) {
        setCurrentStep("test");
      }
    } else if (currentStep === "test") {
      // Only proceed if test was successful
      if (testSuccess) {
        setCurrentStep("complete");
      }
    } else if (currentStep === "complete") {
      onComplete?.();
      router.push("/");
    } else {
      const nextIndex = currentStepIndex + 1;
      if (nextIndex < steps.length) {
        setCurrentStep(steps[nextIndex].id);
      }
    }
  };

  const handleBack = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(steps[prevIndex].id);
    }
  };

  const handleSkip = () => {
    onSkip?.();
    router.push("/");
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="max-w-2xl w-full">
        {/* Progress indicator */}
        <div className="mb-8">
          <div className="flex justify-between">
            {steps.map((step, index) => (
              <div key={step.id} className={`flex-1 ${index < steps.length - 1 ? "relative" : ""}`}>
                <div className="flex flex-col items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                      index < currentStepIndex
                        ? "bg-blue-600 text-white"
                        : index === currentStepIndex
                          ? "bg-blue-600 text-white ring-4 ring-blue-100"
                          : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    {index < currentStepIndex ? "✓" : index + 1}
                  </div>
                  <span className="text-xs mt-1 text-gray-500 hidden sm:block">{step.title}</span>
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`absolute top-4 left-1/2 w-full h-0.5 ${
                      index < currentStepIndex ? "bg-blue-600" : "bg-gray-200"
                    }`}
                    style={{ transform: "translateX(50%)" }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-8">
          {/* Welcome Step */}
          {currentStep === "welcome" && (
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
                <svg
                  className="w-8 h-8 text-blue-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-3">Welcome to AgentSync</h2>
              <p className="text-gray-600 mb-6">
                Let&apos;s connect AgentSync to your Microsoft Power Platform environment. This will
                enable you to:
              </p>
              <ul className="text-left text-gray-600 space-y-2 mb-6 max-w-md mx-auto">
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-1">✓</span>
                  <span>Discover customer tenants via GDAP</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-1">✓</span>
                  <span>Import agents directly from Power Platform</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-1">✓</span>
                  <span>Deploy solutions to multiple tenants simultaneously</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-1">✓</span>
                  <span>Automatically configure connection references</span>
                </li>
              </ul>
              <p className="text-sm text-gray-500">
                You&apos;ll need an Azure AD app registration with appropriate permissions.
              </p>
            </div>
          )}

          {/* Credentials Step */}
          {currentStep === "credentials" && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Partner Credentials</h2>
              <p className="text-gray-600 mb-4">
                Enter your Azure AD app registration details. These credentials will be encrypted
                and stored securely.
              </p>
              <p className="text-xs text-gray-500 mb-6">
                You can update these credentials anytime in{" "}
                <a href="/settings" className="text-blue-600 hover:text-blue-700 underline">
                  Settings → Integration
                </a>
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Partner Tenant ID *
                  </label>
                  <input
                    type="text"
                    value={form.partnerTenantId}
                    onChange={(e) => setForm({ ...form, partnerTenantId: e.target.value })}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">Your MSP/Partner Azure AD tenant ID</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Application (Client) ID *
                  </label>
                  <input
                    type="text"
                    value={form.partnerClientId}
                    onChange={(e) => setForm({ ...form, partnerClientId: e.target.value })}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Client Secret *
                  </label>
                  <input
                    type="password"
                    value={form.partnerClientSecret}
                    onChange={(e) => setForm({ ...form, partnerClientSecret: e.target.value })}
                    placeholder="Enter client secret"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Source Step */}
          {currentStep === "source" && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Source Environment</h2>
              <p className="text-gray-600 mb-6">
                Optionally configure a source environment where your master agents/solutions are
                stored.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Source Tenant ID
                  </label>
                  <input
                    type="text"
                    value={form.sourceTenantId}
                    onChange={(e) => setForm({ ...form, sourceTenantId: e.target.value })}
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
                    value={form.sourceEnvironmentUrl}
                    onChange={(e) => setForm({ ...form, sourceEnvironmentUrl: e.target.value })}
                    placeholder="https://yourorg.crm.dynamics.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    This allows you to browse and import solutions directly from Power Platform
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Features Step */}
          {currentStep === "features" && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Enable Features</h2>
              <p className="text-gray-600 mb-6">
                Choose which features to enable for your deployment workflow.
              </p>

              <div className="space-y-4">
                <label className="flex items-start p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={form.tenantDiscoveryEnabled}
                    onChange={(e) => setForm({ ...form, tenantDiscoveryEnabled: e.target.checked })}
                    className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="ml-3">
                    <span className="font-medium text-gray-900">GDAP Tenant Discovery</span>
                    <p className="text-sm text-gray-500">
                      Automatically discover customer tenants via Partner Center API
                    </p>
                  </div>
                </label>

                <label className="flex items-start p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={form.connectionMappingEnabled}
                    onChange={(e) =>
                      setForm({ ...form, connectionMappingEnabled: e.target.checked })
                    }
                    className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="ml-3">
                    <span className="font-medium text-gray-900">Connection Reference Mapping</span>
                    <p className="text-sm text-gray-500">
                      Map connection references to target tenant connections during deployment
                    </p>
                  </div>
                </label>

                <label className="flex items-start p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={form.environmentVariablesEnabled}
                    onChange={(e) =>
                      setForm({ ...form, environmentVariablesEnabled: e.target.checked })
                    }
                    className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="ml-3">
                    <span className="font-medium text-gray-900">Environment Variables</span>
                    <p className="text-sm text-gray-500">
                      Configure environment variables per tenant during deployment
                    </p>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Test Step */}
          {currentStep === "test" && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Test Connection</h2>
              <p className="text-gray-600 mb-6">
                Let&apos;s verify your configuration works correctly. Run the test below to activate
                the Continue button.
              </p>

              {testResults && (
                <div className="space-y-3 mb-6">
                  {testResults.map((result, i) => (
                    <div
                      key={i}
                      className={`flex items-start p-3 rounded-lg ${
                        result.success ? "bg-green-50" : "bg-red-50"
                      }`}
                    >
                      <span className="mr-2 mt-0.5">{result.success ? "✓" : "✗"}</span>
                      <div>
                        <p
                          className={`text-sm font-medium ${result.success ? "text-green-800" : "text-red-800"}`}
                        >
                          {result.message}
                        </p>
                        {result.details && (
                          <p
                            className={`text-xs ${result.success ? "text-green-600" : "text-red-600"}`}
                          >
                            {result.details}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                  {!testSuccess && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <p className="text-sm text-amber-800">
                        Please fix the errors and retry the test to continue.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {!testing && (
                <div className="text-center py-8">
                  <button
                    onClick={testConnection}
                    className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700"
                  >
                    {testResults ? "Retry Connection Test" : "Run Connection Test"}
                  </button>
                </div>
              )}

              {testing && (
                <div className="text-center py-8">
                  <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-gray-500">Testing connection...</p>
                </div>
              )}
            </div>
          )}

          {/* Complete Step */}
          {currentStep === "complete" && (
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
                <svg
                  className="w-8 h-8 text-green-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-3">You&apos;re All Set!</h2>
              <p className="text-gray-600 mb-6">
                AgentSync is now connected to your Power Platform environment. You can start
                deploying agents to your customer tenants.
              </p>
              <div className="space-y-2 text-left max-w-md mx-auto bg-gray-50 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-700">Next steps:</p>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Browse your tenants on the Tenants page</li>
                  <li>• Upload or import agents on the Agents page</li>
                  <li>• Create deployments to roll out agents</li>
                  <li>
                    • Adjust settings in{" "}
                    <a href="/settings" className="text-blue-600 hover:text-blue-700 underline">
                      Settings
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="mt-4 p-3 bg-red-50 text-red-800 rounded-lg text-sm">{error}</div>
          )}

          {/* Navigation buttons */}
          <div className="mt-8 flex justify-between">
            <div>
              {currentStep === "welcome" ? (
                <button
                  onClick={handleSkip}
                  className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
                >
                  Skip for now
                </button>
              ) : currentStep !== "complete" ? (
                <button
                  onClick={handleBack}
                  className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
                >
                  ← Back
                </button>
              ) : null}
            </div>

            <button
              onClick={handleNext}
              disabled={saving || testing || (currentStep === "test" && !testSuccess)}
              className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving || testing
                ? "Please wait..."
                : currentStep === "complete"
                  ? "Go to Dashboard"
                  : "Continue →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

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

/**
 * Test page for Risk Analysis feature
 * Navigate to: http://localhost:3000/test/risk-analysis
 */

import { useState } from "react";
import { RiskAssessmentModal } from "@/components/deployments/RiskAssessmentModal";

export default function RiskAnalysisTestPage() {
  const [showModal, setShowModal] = useState(false);
  const [selectedTenants, setSelectedTenants] = useState<string[]>([]);
  const [isProduction, setIsProduction] = useState(false);

  // Demo tenant IDs from config
  const demoTenants = [
    { id: "11111111-1111-1111-1111-111111111111", name: "Contoso Corp" },
    { id: "22222222-2222-2222-2222-222222222222", name: "Fabrikam Inc" },
    { id: "33333333-3333-3333-3333-333333333333", name: "Adventure Works" },
    { id: "44444444-4444-4444-4444-444444444444", name: "Northwind Traders" },
    { id: "55555555-5555-5555-5555-555555555555", name: "Wide World Importers" },
  ];

  const toggleTenant = (tenantId: string) => {
    setSelectedTenants((prev) =>
      prev.includes(tenantId) ? prev.filter((id) => id !== tenantId) : [...prev, tenantId]
    );
  };

  const handleProceed = () => {
    alert("Deployment would start here! Selected tenants: " + selectedTenants.join(", "));
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">🧪 Risk Analysis Test Page</h1>
          <p className="text-gray-600 mb-6">
            Select tenants and click "Analyze Risk" to test the risk analysis feature
          </p>

          {/* Tenant Selection */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Select Tenants</h2>
            <div className="space-y-2">
              {demoTenants.map((tenant) => (
                <label
                  key={tenant.id}
                  className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedTenants.includes(tenant.id)}
                    onChange={() => toggleTenant(tenant.id)}
                    className="w-4 h-4"
                  />
                  <span className="text-gray-900">{tenant.name}</span>
                  <span className="text-xs text-gray-500 ml-auto font-mono">
                    {tenant.id.slice(0, 8)}...
                  </span>
                </label>
              ))}
            </div>

            {/* Quick select buttons */}
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setSelectedTenants(demoTenants.map((t) => t.id))}
                className="text-sm px-3 py-1 bg-gray-100 rounded hover:bg-gray-200"
              >
                Select All
              </button>
              <button
                onClick={() => setSelectedTenants([])}
                className="text-sm px-3 py-1 bg-gray-100 rounded hover:bg-gray-200"
              >
                Clear
              </button>
              <button
                onClick={() => setSelectedTenants([demoTenants[0].id])}
                className="text-sm px-3 py-1 bg-gray-100 rounded hover:bg-gray-200"
              >
                Just First
              </button>
            </div>
          </div>

          {/* Production Toggle */}
          <div className="mb-6">
            <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={isProduction}
                onChange={(e) => setIsProduction(e.target.checked)}
                className="w-4 h-4"
              />
              <div>
                <div className="text-gray-900 font-medium">Production Deployment</div>
                <div className="text-sm text-gray-600">Higher risk score, may require approval</div>
              </div>
            </label>
          </div>

          {/* Analyze Button */}
          <button
            onClick={() => setShowModal(true)}
            disabled={selectedTenants.length === 0}
            className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {selectedTenants.length === 0
              ? "Select at least one tenant"
              : `🔍 Analyze Risk (${selectedTenants.length} tenant${selectedTenants.length > 1 ? "s" : ""})`}
          </button>

          {/* Test Scenarios */}
          <div className="mt-8 pt-6 border-t">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">💡 Test Scenarios</h3>
            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex items-start gap-2">
                <span className="text-blue-600 font-bold">•</span>
                <span>
                  <strong>1 tenant:</strong> Should show low-medium risk, fast duration
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-600 font-bold">•</span>
                <span>
                  <strong>All tenants:</strong> Higher risk, longer duration estimate
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-600 font-bold">•</span>
                <span>
                  <strong>Production mode:</strong> May see approval requirement warnings
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-600 font-bold">•</span>
                <span>
                  <strong>Peak hours (9-5 weekdays):</strong> Should see timing warnings
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-600 font-bold">•</span>
                <span>
                  <strong>Every 5th tenant:</strong> Demo mode simulates GDAP issues
                </span>
              </div>
            </div>
          </div>

          {/* Current State Info */}
          <div className="mt-4 p-3 bg-blue-50 rounded text-sm">
            <div className="font-medium text-blue-900 mb-1">Current Test Config:</div>
            <div className="text-blue-700 space-y-1">
              <div>
                • Selected: {selectedTenants.length} tenant{selectedTenants.length !== 1 ? "s" : ""}
              </div>
              <div>• Environment: {isProduction ? "Production" : "Test/Dev"}</div>
              <div>• Time: {new Date().toLocaleString()}</div>
              <div>• Day: {new Date().toLocaleDateString("en-US", { weekday: "long" })}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Risk Assessment Modal */}
      <RiskAssessmentModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onProceed={handleProceed}
        tenantIds={selectedTenants}
        solutionFile="TestAgent.zip"
        solutionSize={5242880}
        isProduction={isProduction}
      />
    </div>
  );
}

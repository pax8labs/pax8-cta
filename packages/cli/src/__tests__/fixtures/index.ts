/**
 * Copyright 2024 Pax8, Inc.
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

/**
 * Test fixtures for CLI tests
 *
 * Provides consistent mock data for testing CLI commands.
 * Re-exports demo data from core package and adds CLI-specific fixtures.
 */

// Re-export demo data from core
export {
  DEMO_TENANTS,
  DEMO_CONFIG,
  DEMO_SOLUTIONS,
  generateMockDeployment,
  generateMockDeploymentHistory,
} from "@agentsync/core";

// ============================================================================
// CLI-specific fixtures
// ============================================================================

/**
 * Sample deployment for testing
 */
export const SAMPLE_DEPLOYMENT = {
  id: "dep-test-001",
  solutionName: "CustomerServiceAgent",
  solutionVersion: "1.0.0.5",
  status: "completed" as const,
  createdAt: "2025-01-27T10:00:00Z",
  completedAt: "2025-01-27T10:15:00Z",
  totalTenants: 9,
  completedTenants: 8,
  failedTenants: 1,
  triggeredBy: "cli" as const,
  tenantResults: [
    {
      tenantId: "11111111-1111-1111-1111-111111111111",
      tenantName: "Contoso Corporation",
      status: "completed" as const,
      startedAt: "2025-01-27T10:01:00Z",
      completedAt: "2025-01-27T10:02:00Z",
    },
    {
      tenantId: "22222222-2222-2222-2222-222222222222",
      tenantName: "Fabrikam Inc",
      status: "failed" as const,
      startedAt: "2025-01-27T10:02:00Z",
      completedAt: "2025-01-27T10:03:00Z",
      error: "Connection timeout",
    },
  ],
};

/**
 * Sample deployments list for testing list commands
 */
export const SAMPLE_DEPLOYMENTS_LIST = [
  SAMPLE_DEPLOYMENT,
  {
    id: "dep-test-002",
    solutionName: "SalesAssistant",
    solutionVersion: "2.1.0",
    status: "in_progress" as const,
    createdAt: "2025-01-27T12:00:00Z",
    totalTenants: 5,
    completedTenants: 2,
    failedTenants: 0,
    triggeredBy: "api" as const,
  },
  {
    id: "dep-test-003",
    solutionName: "ITHelpdesk",
    solutionVersion: "3.0.1",
    status: "pending" as const,
    createdAt: "2025-01-27T14:00:00Z",
    totalTenants: 9,
    completedTenants: 0,
    failedTenants: 0,
    triggeredBy: "scheduled" as const,
  },
];

/**
 * Sample API responses for mocking
 */
export const API_RESPONSES = {
  deployments: {
    list: { deployments: SAMPLE_DEPLOYMENTS_LIST },
    get: SAMPLE_DEPLOYMENT,
  },
  stats: {
    totalDeployments: 150,
    activeDeployments: 2,
    completedToday: 5,
    failedToday: 1,
    totalTenants: 10,
    activeTenants: 9,
  },
};

/**
 * Sample config YAML content for testing config loading
 */
export const SAMPLE_CONFIG_YAML = `
version: "2.0"
partner:
  tenantId: "00000000-0000-0000-0000-000000000000"
  clientId: "test-client-id"
source:
  tenantId: "00000000-0000-0000-0000-000000000000"
  environmentUrl: "https://partner-dev.crm.dynamics.com"
tenants:
  - name: "Test Tenant 1"
    tenantId: "11111111-1111-1111-1111-111111111111"
    environmentUrl: "https://test1.crm.dynamics.com"
    tags: ["test", "enterprise"]
    enabled: true
  - name: "Test Tenant 2"
    tenantId: "22222222-2222-2222-2222-222222222222"
    environmentUrl: "https://test2.crm.dynamics.com"
    tags: ["test", "smb"]
    enabled: true
`;

/**
 * Expected CLI output patterns for assertions
 */
export const OUTPUT_PATTERNS = {
  demoModeWarning: /DEMO MODE/i,
  deploymentId: /dep-[a-z0-9-]+/i,
  tenantId: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  trackingHint: /'(track|deployments show)/i,
  successMessage: /✔|succeed|success|completed/i,
  errorMessage: /✗|fail|error/i,
  tableHeader: /^\s*│.*│\s*$/,
};

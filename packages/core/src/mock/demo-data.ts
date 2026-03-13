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

/**
 * Demo/mock data for testing the UX without real Azure connections
 *
 * Enable by setting DEMO_MODE=true in environment variables
 */

import {
  Config,
  TenantConfig,
  DeploymentJob,
  DeploymentStatus,
  TenantDeploymentResult,
  DeploymentTrigger,
} from "../config/schema.js";

/**
 * Simple seeded random number generator for consistent mock data
 * Uses a mulberry32 algorithm
 */
function seededRandom(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate a numeric hash from a string (for seeding)
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Check if demo mode is enabled
 */
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true" || process.env.DEMO_MODE === "1";
}

/**
 * Risk profile types for demo tenants
 */
export type DemoRiskProfile = "healthy" | "test" | "problematic" | "production-critical";

/**
 * GDAP status types for demo tenants
 */
export type DemoGdapStatus = "valid" | "missing_role" | "expired" | "propagating" | "expiring_soon";

/**
 * Connection status types for demo tenants
 */
export type DemoConnectionStatus = "valid" | "expired" | "missing" | "expiring_certificate";

/**
 * Extended demo metadata for risk analysis scenarios
 */
export interface DemoTenantMetadata {
  industry: string;
  employees: number;
  contractTier: string;
  riskProfile: DemoRiskProfile;
  gdapStatus: DemoGdapStatus;
  gdapIssue?: string;
  gdapRelationshipExpiry?: string;
  connectionStatus: DemoConnectionStatus;
  connectionIssue?: string;
  recentFailures: number;
  lastSuccessfulDeployment?: string;
  lastDeploymentError?: string;
  disabledReason?: string;
}

/**
 * Get demo metadata for a tenant by ID.
 * Returns typed metadata or undefined for non-demo tenants.
 */
export function getDemoTenantMetadata(tenantId: string): DemoTenantMetadata | undefined {
  const tenant = DEMO_TENANTS.find((t) => t.tenantId === tenantId);
  return tenant?.metadata as DemoTenantMetadata | undefined;
}

/**
 * Sample tenant data representing fictional MSP customers.
 * Each tenant has a distinct risk profile and scenario for comprehensive demo coverage:
 *
 * Healthy (40%):     Contoso, Fabrikam, Adventure Works, Litware
 * Test (20%):        Tailspin Toys, Coho Vineyard
 * Problematic (30%): Northwind Traders, Proseware, Datum Corp
 * Prod-Critical (10%): Woodgrove Bank
 * Disabled:          Wingtip Toys
 */
export const DEMO_TENANTS: TenantConfig[] = [
  // ──────────────────────────────────────────────────────────────────────
  // Healthy tenants (40%) - Valid permissions, good history
  // ──────────────────────────────────────────────────────────────────────
  {
    name: "Contoso Corporation",
    tenantId: "11111111-1111-1111-1111-111111111111",
    environmentUrl: "https://contoso-prod.crm.dynamics.com",
    tags: ["enterprise", "priority", "east-coast"],
    enabled: true,
    autoSetup: true,
    metadata: {
      industry: "Manufacturing",
      employees: 5000,
      contractTier: "Enterprise",
      riskProfile: "healthy",
      gdapStatus: "valid",
      connectionStatus: "valid",
      recentFailures: 0,
      lastSuccessfulDeployment: "2025-01-25T10:30:00Z",
    } satisfies DemoTenantMetadata,
  },
  {
    name: "Fabrikam Inc",
    tenantId: "22222222-2222-2222-2222-222222222222",
    environmentUrl: "https://fabrikam-prod.crm.dynamics.com",
    tags: ["enterprise", "west-coast"],
    enabled: true,
    autoSetup: true,
    metadata: {
      industry: "Retail",
      employees: 2500,
      contractTier: "Enterprise",
      riskProfile: "healthy",
      gdapStatus: "valid",
      connectionStatus: "valid",
      recentFailures: 0,
      lastSuccessfulDeployment: "2025-01-24T14:15:00Z",
    } satisfies DemoTenantMetadata,
  },
  {
    name: "Adventure Works",
    tenantId: "33333333-3333-3333-3333-333333333333",
    environmentUrl: "https://adventureworks.crm.dynamics.com",
    tags: ["smb", "midwest"],
    enabled: true,
    autoSetup: true,
    metadata: {
      industry: "Tourism",
      employees: 150,
      contractTier: "Professional",
      riskProfile: "healthy",
      gdapStatus: "valid",
      connectionStatus: "valid",
      recentFailures: 0,
      lastSuccessfulDeployment: "2025-01-23T09:00:00Z",
    } satisfies DemoTenantMetadata,
  },
  {
    name: "Litware Inc",
    tenantId: "88888888-8888-8888-8888-888888888888",
    environmentUrl: "https://litware.crm.dynamics.com",
    tags: ["enterprise", "technology"],
    enabled: true,
    autoSetup: true,
    metadata: {
      industry: "Technology",
      employees: 1200,
      contractTier: "Enterprise",
      riskProfile: "healthy",
      gdapStatus: "valid",
      connectionStatus: "valid",
      recentFailures: 0,
      lastSuccessfulDeployment: "2025-01-26T16:45:00Z",
    } satisfies DemoTenantMetadata,
  },

  // ──────────────────────────────────────────────────────────────────────
  // Problematic tenants (30%) - Various issues for risk analysis
  // ──────────────────────────────────────────────────────────────────────
  {
    name: "Northwind Traders",
    tenantId: "44444444-4444-4444-4444-444444444444",
    environmentUrl: "https://northwind.crm.dynamics.com",
    tags: ["smb", "priority"],
    enabled: true,
    autoSetup: true,
    metadata: {
      industry: "Food & Beverage",
      employees: 300,
      contractTier: "Professional",
      riskProfile: "problematic",
      gdapStatus: "missing_role",
      gdapIssue: "Missing Power Platform Administrator role",
      connectionStatus: "expired",
      connectionIssue: "Dataverse connection expired, needs reauthentication",
      recentFailures: 3,
      lastSuccessfulDeployment: "2024-12-01T08:00:00Z",
      lastDeploymentError: "Connection timeout - environment unreachable",
    } satisfies DemoTenantMetadata,
  },
  {
    name: "Proseware",
    tenantId: "99999999-9999-9999-9999-999999999999",
    environmentUrl: "https://proseware.crm.dynamics.com",
    tags: ["smb", "technology"],
    enabled: true,
    autoSetup: true,
    metadata: {
      industry: "Software",
      employees: 200,
      contractTier: "Professional",
      riskProfile: "problematic",
      gdapStatus: "expired",
      gdapIssue: "GDAP relationship expired on 2025-01-15",
      gdapRelationshipExpiry: "2025-01-15T00:00:00Z",
      connectionStatus: "missing",
      connectionIssue: "SharePoint connection never configured",
      recentFailures: 5,
      lastSuccessfulDeployment: "2024-11-20T11:00:00Z",
      lastDeploymentError: "Solution import failed: missing required connection reference",
    } satisfies DemoTenantMetadata,
  },
  {
    name: "Datum Corp",
    tenantId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    environmentUrl: "https://datum.crm.dynamics.com",
    tags: ["smb", "healthcare"],
    enabled: true,
    autoSetup: true,
    metadata: {
      industry: "Healthcare",
      employees: 400,
      contractTier: "Professional",
      riskProfile: "problematic",
      gdapStatus: "propagating",
      gdapIssue: "GDAP relationship created 12 hours ago, still propagating",
      connectionStatus: "expiring_certificate",
      connectionIssue: "OAuth certificate expires in 15 days",
      recentFailures: 1,
      lastSuccessfulDeployment: "2025-01-20T13:30:00Z",
      lastDeploymentError: "Permission denied: insufficient privileges",
    } satisfies DemoTenantMetadata,
  },

  // ──────────────────────────────────────────────────────────────────────
  // Production-critical tenant (10%) - High stakes, requires approval
  // ──────────────────────────────────────────────────────────────────────
  {
    name: "Woodgrove Bank",
    tenantId: "55555555-5555-5555-5555-555555555555",
    environmentUrl: "https://woodgrove.crm.dynamics.com",
    tags: ["enterprise", "finance", "priority", "production"],
    enabled: true,
    autoSetup: true,
    metadata: {
      industry: "Financial Services",
      employees: 8000,
      contractTier: "Enterprise",
      riskProfile: "production-critical",
      gdapStatus: "expiring_soon",
      gdapIssue: "GDAP relationship expires in 5 days",
      gdapRelationshipExpiry: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      connectionStatus: "valid",
      recentFailures: 0,
      lastSuccessfulDeployment: "2025-01-22T02:30:00Z",
    } satisfies DemoTenantMetadata,
  },

  // ──────────────────────────────────────────────────────────────────────
  // Test tenants (20%) - Lower risk even with minor issues
  // ──────────────────────────────────────────────────────────────────────
  {
    name: "Tailspin Toys",
    tenantId: "66666666-6666-6666-6666-666666666666",
    environmentUrl: "https://tailspin.crm.dynamics.com",
    tags: ["smb", "retail", "test"],
    enabled: true,
    autoSetup: true,
    metadata: {
      industry: "Retail",
      employees: 75,
      contractTier: "Starter",
      riskProfile: "test",
      gdapStatus: "valid",
      connectionStatus: "valid",
      recentFailures: 1,
      lastSuccessfulDeployment: "2025-01-25T08:00:00Z",
      lastDeploymentError: "Timeout after 120s - retried successfully",
    } satisfies DemoTenantMetadata,
  },
  {
    name: "Coho Vineyard",
    tenantId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    environmentUrl: "https://coho.crm.dynamics.com",
    tags: ["smb", "hospitality", "test"],
    enabled: true,
    autoSetup: true,
    metadata: {
      industry: "Hospitality",
      employees: 45,
      contractTier: "Starter",
      riskProfile: "test",
      gdapStatus: "valid",
      connectionStatus: "valid",
      recentFailures: 0,
    } satisfies DemoTenantMetadata,
  },

  // ──────────────────────────────────────────────────────────────────────
  // Disabled tenant - Contract renewal pending
  // ──────────────────────────────────────────────────────────────────────
  {
    name: "Wingtip Toys",
    tenantId: "77777777-7777-7777-7777-777777777777",
    environmentUrl: "https://wingtip.crm.dynamics.com",
    tags: ["smb", "retail"],
    enabled: false,
    autoSetup: true,
    metadata: {
      industry: "Retail",
      employees: 50,
      contractTier: "Starter",
      riskProfile: "problematic",
      gdapStatus: "expired",
      gdapIssue: "Contract renewal pending, GDAP relationship suspended",
      connectionStatus: "expired",
      connectionIssue: "All connections expired due to suspended relationship",
      recentFailures: 0,
      disabledReason: "Contract renewal pending",
    } satisfies DemoTenantMetadata,
  },
];

/**
 * Demo configuration
 */
export const DEMO_CONFIG: Config = {
  version: "2.0",
  partner: {
    tenantId: "00000000-0000-0000-0000-000000000000",
    clientId: "demo-client-id-0000-0000-000000000000",
  },
  source: {
    tenantId: "00000000-0000-0000-0000-000000000000",
    environmentUrl: "https://partner-dev.crm.dynamics.com",
  },
  tenants: DEMO_TENANTS,
  settings: {
    schedule: {
      cron: "0 2 * * 0", // Weekly on Sunday at 2 AM
      timezone: "America/New_York",
      maintenanceWindow: {
        start: "02:00",
        end: "06:00",
        daysOfWeek: [0, 6], // Saturday and Sunday
      },
    },
    approval: {
      required: true,
      minApprovals: 1,
      timeout: "24h",
      autoApproveForTags: ["smb"],
    },
    rateLimit: {
      maxConcurrent: 5,
      delayBetweenTenants: "2s",
      maxRequestsPerMinute: 30,
    },
  },
};

/**
 * Realistic error messages for failed deployments
 */
const DEMO_ERROR_MESSAGES = [
  "Connection timeout - environment unreachable",
  "Permission denied: insufficient privileges for solution import",
  "Solution import failed: missing required connection reference 'shared_commondataserviceforapps'",
  "Validation error: solution version conflict with existing unmanaged customization",
  "HTTP 503 Service Unavailable - Dataverse API temporarily down",
  "OAuth token expired during import, reauthentication required",
  "Solution dependency not met: Microsoft Dataverse base solution version mismatch",
  "Import timeout after 300s - large solution exceeded maximum import duration",
];

/**
 * Generate a mock deployment with realistic-looking data
 * Uses seeded randomness based on deployment ID for consistent results
 */
export function generateMockDeployment(overrides?: Partial<DeploymentJob>): DeploymentJob {
  const deploymentId = overrides?.id || `demo-${Date.now().toString(36)}`;

  // Create a seeded random generator based on deployment ID
  const random = seededRandom(hashString(deploymentId));

  const statuses: DeploymentStatus[] = ["completed", "in_progress", "pending", "failed"];
  const randomStatus = overrides?.status || statuses[Math.floor(random() * statuses.length)];

  const triggers: DeploymentTrigger[] = ["manual", "scheduled", "webhook", "cli", "api"];
  const triggeredBy = overrides?.triggeredBy || triggers[Math.floor(random() * triggers.length)];

  // Base time for this deployment (seeded)
  const baseCreatedAt = overrides?.createdAt
    ? new Date(overrides.createdAt).getTime()
    : Date.now() - 3600000;

  const tenantResults: TenantDeploymentResult[] = DEMO_TENANTS.filter((t) => t.enabled).map(
    (tenant, index) => {
      let status: DeploymentStatus;

      // Use seeded random for tenant-level decisions
      const tenantRandom = random();

      if (randomStatus === "completed") {
        status = tenantRandom > 0.1 ? "completed" : "failed"; // 90% success rate
      } else if (randomStatus === "in_progress") {
        if (index < 3) status = "completed";
        else if (index === 3) status = "in_progress";
        else status = "pending";
      } else if (randomStatus === "failed") {
        status = index < 5 ? "completed" : "failed";
      } else {
        status = "pending";
      }

      const startedAt =
        status !== "pending" ? new Date(baseCreatedAt + index * 60000).toISOString() : undefined;
      const completedAt =
        status === "completed" || status === "failed"
          ? new Date(baseCreatedAt + (index + 1) * 60000).toISOString()
          : undefined;

      // Use varied error messages based on tenant metadata
      let error: string | undefined;
      if (status === "failed") {
        const meta = getDemoTenantMetadata(tenant.tenantId);
        error =
          meta?.lastDeploymentError || DEMO_ERROR_MESSAGES[index % DEMO_ERROR_MESSAGES.length];
      }

      return {
        tenantId: tenant.tenantId,
        tenantName: tenant.name,
        status,
        startedAt,
        completedAt,
        error,
        solutionImportJobId:
          status !== "pending" ? `import-${tenant.tenantId.slice(0, 8)}` : undefined,
        attemptNumber: 1,
      };
    }
  );

  const completedCount = tenantResults.filter((r) => r.status === "completed").length;
  const failedCount = tenantResults.filter((r) => r.status === "failed").length;

  // Calculate duration based on status
  let durationMs: number | undefined;
  let completedAt: string | undefined;
  const startedAt = new Date(baseCreatedAt).toISOString();

  if (randomStatus === "completed" || randomStatus === "failed") {
    // Duration between 2-10 minutes for completed deployments
    durationMs = Math.floor(120000 + random() * 480000);
    completedAt = new Date(baseCreatedAt + durationMs).toISOString();
  } else if (randomStatus === "in_progress") {
    // In progress - duration so far
    durationMs = Math.floor(60000 + random() * 180000);
  }

  return {
    id: deploymentId,
    solutionPath: "./solutions/CustomerServiceAgent_1_0_0_5.zip",
    solutionName: "CustomerServiceAgent",
    solutionVersion: "1.0.0.5",
    status: randomStatus,
    createdAt: new Date(baseCreatedAt).toISOString(),
    updatedAt: new Date().toISOString(),
    startedAt,
    completedAt,
    tenantResults,
    totalTenants: tenantResults.length,
    completedTenants: completedCount,
    failedTenants: failedCount,
    triggeredBy,
    durationMs,
    canRollback: randomStatus === "completed" && random() > 0.3,
    ...overrides,
  };
}

/**
 * Generate a list of mock deployments for history view.
 * Uses deterministic IDs based on index for consistent data across refreshes.
 *
 * Deployment history is designed to exercise risk analysis scenarios:
 * - 70% success, 20% failure, 10% partial (completed with tenant failures)
 * - Varied time distribution: recent (last 7 days), medium (last 30 days), old (90+ days)
 * - Varied durations: fast (2-5 min), normal (8-15 min), slow (20-45 min)
 * - Different error types: permission, timeout, connection, validation
 */
export function generateMockDeploymentHistory(count: number = 10): DeploymentJob[] {
  const solutions = [
    { name: "CustomerServiceAgent", version: "1.0.0.5" },
    { name: "SalesAssistant", version: "2.1.0" },
    { name: "HROnboarding", version: "1.2.3" },
    { name: "ITHelpdesk", version: "3.0.1" },
  ];

  const triggers: DeploymentTrigger[] = ["manual", "scheduled", "webhook", "cli", "api"];

  const deployments: DeploymentJob[] = [];

  // Use a fixed base timestamp for consistent history
  const baseTimestamp = new Date("2025-01-27T00:00:00Z").getTime();

  for (let i = 0; i < count; i++) {
    const solution = solutions[i % solutions.length];

    // Varied time distribution: cluster recent deployments closer together
    let hoursAgo: number;
    if (i < 5) {
      hoursAgo = i * 6; // Recent: every 6 hours (last ~30 hours)
    } else if (i < 15) {
      hoursAgo = 30 + (i - 5) * 24; // Medium: daily (last ~10 days)
    } else {
      hoursAgo = 270 + (i - 15) * 48; // Old: every 2 days (60+ days ago)
    }

    const createdAt = new Date(baseTimestamp - hoursAgo * 60 * 60 * 1000);

    // Deterministic deployment ID based on index
    const deploymentId = `demo-hist-${i.toString().padStart(3, "0")}`;

    // Deterministic status pattern: ~70% success, ~20% failure, ~10% in_progress/partial
    let status: DeploymentStatus;
    if (i === 0) {
      status = "in_progress";
    } else if (i === 3 || i === 7 || i === 12 || i === 18) {
      status = "failed"; // ~20% failure rate
    } else {
      status = "completed";
    }

    // Deterministic trigger based on index
    const triggeredBy = triggers[i % triggers.length];

    deployments.push(
      generateMockDeployment({
        id: deploymentId,
        solutionName: solution.name,
        solutionVersion: solution.version,
        solutionPath: `./solutions/${solution.name}_${solution.version.replace(/\./g, "_")}.zip`,
        status,
        createdAt: createdAt.toISOString(),
        updatedAt: new Date(createdAt.getTime() + 30 * 60000).toISOString(),
        triggeredBy,
      })
    );
  }

  return deployments;
}

/**
 * Mock solution metadata with extended details
 */
export const DEMO_SOLUTIONS = [
  {
    uniqueName: "CustomerServiceAgent",
    friendlyName: "Customer Service Agent",
    version: "1.0.0.5",
    isManaged: true,
    publisherName: "Contoso ISV",
    description:
      "Handles customer inquiries, troubleshoots issues, and escalates complex cases. Integrates with CRM for ticket creation and customer history lookup.",
    category: "Customer Support",
    capabilities: ["Chat", "Email", "Ticket Creation", "Knowledge Base"],
    tags: ["production", "priority"],
    dependencies: ["Microsoft Dataverse", "Dynamics 365 Customer Service"],
    connectionReferences: [
      { name: "Dataverse", connectorId: "shared_commondataserviceforapps", required: true },
      { name: "Office 365 Outlook", connectorId: "shared_office365", required: false },
    ],
    environmentVariables: [
      {
        name: "SupportEmailAddress",
        type: "string",
        required: true,
        defaultValue: "support@contoso.com",
      },
      { name: "EscalationThresholdMinutes", type: "number", required: false, defaultValue: "30" },
      { name: "EnableAutoResponse", type: "boolean", required: false, defaultValue: "true" },
    ],
    lastPublished: "2025-01-15T14:30:00Z",
    sizeKb: 2450,
    changelog:
      "v1.0.0.5 - Fixed escalation routing logic\nv1.0.0.4 - Added email channel support\nv1.0.0.3 - Knowledge base integration",
  },
  {
    uniqueName: "SalesAssistant",
    friendlyName: "Sales Assistant Copilot",
    version: "2.1.0",
    isManaged: true,
    publisherName: "Contoso ISV",
    description:
      "Assists sales teams with lead qualification, meeting prep, and opportunity insights. Pulls data from Dynamics 365 Sales to provide account summaries.",
    category: "Sales",
    capabilities: ["Lead Scoring", "Account Insights", "Pipeline Analysis"],
    tags: ["sales", "enterprise"],
    dependencies: ["Microsoft Dataverse", "Dynamics 365 Sales"],
    connectionReferences: [
      { name: "Dataverse", connectorId: "shared_commondataserviceforapps", required: true },
      { name: "Microsoft Teams", connectorId: "shared_teams", required: true },
    ],
    environmentVariables: [
      { name: "SalesApiEndpoint", type: "string", required: true },
      { name: "LeadScoreThreshold", type: "number", required: false, defaultValue: "75" },
    ],
    lastPublished: "2025-01-20T09:15:00Z",
    sizeKb: 1890,
    changelog: "v2.1.0 - New pipeline analytics feature\nv2.0.0 - Major UI refresh",
  },
  {
    uniqueName: "HROnboarding",
    friendlyName: "HR Onboarding Bot",
    version: "1.2.3",
    isManaged: true,
    publisherName: "Contoso ISV",
    description:
      "Guides new hires through onboarding tasks, answers policy questions, and helps schedule orientation sessions. Connects to HR systems for document collection.",
    category: "Human Resources",
    capabilities: ["Onboarding Workflow", "Policy Q&A", "Document Collection"],
    tags: ["hr", "internal"],
    dependencies: ["Microsoft Dataverse"],
    connectionReferences: [
      { name: "Dataverse", connectorId: "shared_commondataserviceforapps", required: true },
      { name: "SharePoint", connectorId: "shared_sharepointonline", required: true },
      { name: "Office 365 Users", connectorId: "shared_office365users", required: true },
    ],
    environmentVariables: [
      { name: "HRPortalUrl", type: "string", required: true },
      {
        name: "OnboardingFolderPath",
        type: "string",
        required: true,
        defaultValue: "/sites/hr/onboarding",
      },
    ],
    lastPublished: "2025-01-10T16:45:00Z",
    sizeKb: 1250,
    changelog: "v1.2.3 - Bug fixes for document upload\nv1.2.0 - Added policy Q&A module",
  },
  {
    uniqueName: "ITHelpdesk",
    friendlyName: "IT Helpdesk Agent",
    version: "3.0.1",
    isManaged: true,
    publisherName: "Contoso ISV",
    description:
      "Resolves common IT issues like password resets, software installation, and VPN troubleshooting. Creates ServiceNow tickets for complex problems.",
    category: "IT Support",
    capabilities: ["Password Reset", "Software Install", "Ticket Escalation"],
    tags: ["it", "production"],
    dependencies: ["Microsoft Dataverse", "Azure Active Directory"],
    connectionReferences: [
      { name: "Dataverse", connectorId: "shared_commondataserviceforapps", required: true },
      { name: "Azure AD", connectorId: "shared_azuread", required: true },
      { name: "ServiceNow", connectorId: "shared_servicenow", required: false },
    ],
    environmentVariables: [
      { name: "ServiceNowInstance", type: "string", required: false },
      { name: "ServiceNowApiKey", type: "secret", required: false },
      { name: "AutoResetEnabled", type: "boolean", required: false, defaultValue: "false" },
    ],
    lastPublished: "2025-01-22T11:00:00Z",
    sizeKb: 3100,
    changelog: "v3.0.1 - Hotfix for VPN troubleshooter\nv3.0.0 - ServiceNow integration added",
  },
];

/**
 * Simulate async operation with random delay
 */
export async function simulateDelay(minMs: number = 100, maxMs: number = 500): Promise<void> {
  const delay = Math.random() * (maxMs - minMs) + minMs;
  await new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Mock tenant health check result
 */
export function generateMockHealthCheck(_tenantId: string): {
  healthy: boolean;
  checks: Array<{ name: string; passed: boolean; message?: string }>;
} {
  const isHealthy = Math.random() > 0.15; // 85% healthy

  return {
    healthy: isHealthy,
    checks: [
      { name: "Dataverse Connection", passed: true },
      { name: "Authentication", passed: true },
      {
        name: "API Availability",
        passed: isHealthy,
        message: isHealthy ? undefined : "Timeout after 30s",
      },
      { name: "License Check", passed: true },
    ],
  };
}

/**
 * Mock deployment preview/diff
 */
export function generateMockDeploymentPreview(_solutionName: string, tenantName: string) {
  const willInstall = Math.random() > 0.7;
  const willUpgrade = !willInstall;

  return {
    willInstall,
    willUpgrade,
    sourceVersion: "1.0.0.5",
    targetVersion: willInstall ? null : "1.0.0.4",
    warnings:
      willUpgrade && Math.random() > 0.5
        ? [
            `Same version already installed on ${tenantName}. Import will overwrite existing customizations.`,
          ]
        : [],
    estimatedDurationMs: 30000 + Math.floor(Math.random() * 60000),
  };
}

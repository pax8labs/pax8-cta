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

import { NextResponse } from "next/server";
import {
  isDemoMode,
  PowerPlatformAdminClient,
  TokenManager,
  getEffectiveIntegrationSettings,
} from "@agentsync/core";
import { internalError } from "@/lib/errors";

export const dynamic = "force-dynamic";

// Demo environments for showcasing the UI
const DEMO_ENVIRONMENTS = [
  {
    id: "env-1",
    displayName: "Contoso Production",
    uniqueName: "contosoprod",
    domainName: "contosoprod",
    type: "Production" as const,
    instanceUrl: "https://contoso-prod.crm.dynamics.com",
    instanceApiUrl: "https://contoso-prod.api.crm.dynamics.com",
    version: "9.2.24013.123",
    state: "Ready",
    location: "unitedstates",
    isDefault: true,
    createdTime: "2024-01-15T10:00:00Z",
  },
  {
    id: "env-2",
    displayName: "Development Environment",
    uniqueName: "contosodev",
    domainName: "contosodev",
    type: "Sandbox" as const,
    instanceUrl: "https://contoso-dev.crm.dynamics.com",
    instanceApiUrl: "https://contoso-dev.api.crm.dynamics.com",
    version: "9.2.24013.123",
    state: "Ready",
    location: "unitedstates",
    isDefault: false,
    createdTime: "2024-03-20T14:30:00Z",
  },
  {
    id: "env-3",
    displayName: "Agent Testing",
    uniqueName: "agenttesting",
    domainName: "agenttesting",
    type: "Sandbox" as const,
    instanceUrl: "https://agenttesting.crm.dynamics.com",
    instanceApiUrl: "https://agenttesting.api.crm.dynamics.com",
    version: "9.2.24013.123",
    state: "Ready",
    location: "unitedstates",
    isDefault: false,
    createdTime: "2024-06-10T09:00:00Z",
  },
];

/**
 * Get all accessible Power Platform environments
 * This allows users to browse any environment they have access to
 */
export async function GET() {
  try {
    if (isDemoMode()) {
      return NextResponse.json({
        demoMode: true,
        environments: DEMO_ENVIRONMENTS,
      });
    }

    const settings = await getEffectiveIntegrationSettings();

    if (!settings.partnerClientId || !settings.partnerClientSecret || !settings.partnerTenantId) {
      return NextResponse.json({
        configured: false,
        message: "Partner credentials not configured",
        environments: [],
      });
    }

    const tokenManager = new TokenManager({
      tenantId: settings.partnerTenantId,
      clientId: settings.partnerClientId,
      clientSecret: settings.partnerClientSecret,
    });

    const adminClient = new PowerPlatformAdminClient({ tokenManager });
    const environments = await adminClient.listEnvironmentSummaries();

    return NextResponse.json({
      demoMode: false,
      configured: true,
      environments,
    });
  } catch (error) {
    console.error("Environments error:", error);
    return internalError(
      "Failed to fetch environments",
      process.env.NODE_ENV === "development" && error instanceof Error
        ? { error: error.message }
        : undefined
    );
  }
}

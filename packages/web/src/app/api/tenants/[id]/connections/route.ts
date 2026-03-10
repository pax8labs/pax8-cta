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

import { NextRequest, NextResponse } from "next/server";
import {
  isDemoMode,
  DataverseClient,
  TokenManager,
  ConnectionOperations,
  DEMO_TENANTS,
  getEffectiveIntegrationSettings,
} from "@agentsync/core";
import { notFound, invalidRequest, internalError } from "@/lib/errors";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: { id: string };
}

/**
 * Mock connectors for demo mode
 */
const DEMO_CONNECTORS = [
  { id: "shared_commondataserviceforapps", name: "Microsoft Dataverse", tier: "Standard" },
  { id: "shared_office365", name: "Office 365 Outlook", tier: "Standard" },
  { id: "shared_sharepointonline", name: "SharePoint", tier: "Standard" },
  { id: "shared_teams", name: "Microsoft Teams", tier: "Standard" },
  { id: "shared_azuread", name: "Azure AD", tier: "Premium" },
  { id: "shared_office365users", name: "Office 365 Users", tier: "Standard" },
  { id: "shared_servicenow", name: "ServiceNow", tier: "Premium" },
];

/**
 * Get connection references and available connections for a tenant
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const tenantId = params.id;
  const { searchParams } = new URL(request.url);
  const environmentUrl = searchParams.get("environmentUrl");

  try {
    if (isDemoMode()) {
      const tenant = DEMO_TENANTS.find((t) => t.tenantId === tenantId);

      if (!tenant) {
        return notFound("Tenant", tenantId);
      }

      // Generate mock connection references
      const mockConnectionRefs = [
        {
          id: `${tenantId}-connref-1`,
          logicalName: "cr_dataverse_connection",
          displayName: "Dataverse Connection",
          connectorId: "shared_commondataserviceforapps",
          connectorName: "Microsoft Dataverse",
          connectionId: `${tenantId}-conn-1`,
          connectionName: `${tenant.name} Dataverse`,
          status: "Connected",
        },
        {
          id: `${tenantId}-connref-2`,
          logicalName: "cr_sharepoint_connection",
          displayName: "SharePoint Connection",
          connectorId: "shared_sharepointonline",
          connectorName: "SharePoint",
          connectionId: `${tenantId}-conn-2`,
          connectionName: `${tenant.name} SharePoint`,
          status: "Connected",
        },
        {
          id: `${tenantId}-connref-3`,
          logicalName: "cr_teams_connection",
          displayName: "Teams Connection",
          connectorId: "shared_teams",
          connectorName: "Microsoft Teams",
          connectionId: null,
          connectionName: null,
          status: "Not Connected",
        },
      ];

      // Generate mock available connections
      const mockConnections = DEMO_CONNECTORS.slice(0, 4).map((connector, i) => ({
        id: `${tenantId}-conn-${i + 1}`,
        displayName: `${tenant.name} ${connector.name}`,
        connectorId: connector.id,
        connectorName: connector.name,
        tier: connector.tier,
        status: "Active",
        createdTime: new Date(Date.now() - Math.random() * 180 * 24 * 60 * 60 * 1000).toISOString(),
      }));

      return NextResponse.json({
        demoMode: true,
        tenantId,
        tenantName: tenant.name,
        environmentUrl: environmentUrl || tenant.environmentUrl,
        connectionReferences: mockConnectionRefs,
        connections: mockConnections,
        connectors: DEMO_CONNECTORS,
      });
    }

    // Real mode - query Dataverse for connections
    const settings = await getEffectiveIntegrationSettings();

    if (!settings.partnerTenantId || !settings.partnerClientId || !settings.partnerClientSecret) {
      return internalError("Partner credentials not configured");
    }

    if (!environmentUrl) {
      return invalidRequest("environmentUrl query parameter is required");
    }

    // Create token manager for customer tenant (GDAP delegation)
    const customerTokenManager = new TokenManager({
      tenantId: tenantId,
      clientId: settings.partnerClientId,
      clientSecret: settings.partnerClientSecret,
    });

    const dataverseClient = new DataverseClient({
      environmentUrl,
      tokenManager: customerTokenManager,
    });

    const connectionOps = new ConnectionOperations(dataverseClient);

    // Fetch connection references
    const connectionRefs = await connectionOps.listConnectionReferences();

    // Fetch connections (this requires additional query)
    // For now, we return connection references with available connection info
    const connections = await dataverseClient.get<{
      value: Array<{
        connectionid: string;
        name: string;
        connectorid: string;
        statecode: number;
      }>;
    }>("/connections", {
      $select: "connectionid,name,connectorid,statecode",
      $filter: "statecode eq 0", // Active connections only
    });

    return NextResponse.json({
      demoMode: false,
      tenantId,
      environmentUrl,
      connectionReferences: connectionRefs.map((ref) => ({
        id: ref.connectionreferenceid,
        logicalName: ref.connectionreferencelogicalname,
        displayName: ref.connectionreferencedisplayname,
        connectorId: ref.connectorid,
        connectionId: ref.connectionid,
        status: ref.connectionid ? "Connected" : "Not Connected",
        stateCode: ref.statecode,
      })),
      connections: connections.value.map((conn) => ({
        id: conn.connectionid,
        displayName: conn.name,
        connectorId: conn.connectorid,
        status: "Active",
      })),
    });
  } catch (error) {
    console.error("Connections error:", error);
    return internalError(
      "Failed to fetch connections",
      process.env.NODE_ENV === "development" && error instanceof Error
        ? { error: error.message }
        : undefined
    );
  }
}

/**
 * Update connection mappings for a tenant
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const tenantId = params.id;

  try {
    const body = await request.json();
    const { environmentUrl, mappings } = body as {
      environmentUrl: string;
      mappings: Array<{ connectionReferenceId: string; connectionId: string }>;
    };

    if (!environmentUrl || !mappings) {
      return invalidRequest("environmentUrl and mappings are required");
    }

    if (isDemoMode()) {
      // In demo mode, just acknowledge the update
      return NextResponse.json({
        demoMode: true,
        success: true,
        message: "Connection mappings updated (demo mode)",
        applied: mappings.length,
      });
    }

    // Real mode - apply connection mappings
    const settings = await getEffectiveIntegrationSettings();

    if (!settings.partnerClientId || !settings.partnerClientSecret) {
      return internalError("Partner credentials not configured");
    }

    const customerTokenManager = new TokenManager({
      tenantId: tenantId,
      clientId: settings.partnerClientId,
      clientSecret: settings.partnerClientSecret,
    });

    const dataverseClient = new DataverseClient({
      environmentUrl,
      tokenManager: customerTokenManager,
    });

    const connectionOps = new ConnectionOperations(dataverseClient);

    // Apply each mapping
    const results = {
      success: true,
      applied: 0,
      errors: [] as string[],
    };

    for (const mapping of mappings) {
      try {
        await connectionOps.updateConnectionReference(
          mapping.connectionReferenceId,
          mapping.connectionId
        );
        results.applied++;
      } catch (error) {
        results.success = false;
        results.errors.push(
          `Failed to map ${mapping.connectionReferenceId}: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }

    return NextResponse.json({
      demoMode: false,
      ...results,
    });
  } catch (error) {
    console.error("Update connections error:", error);
    return internalError(
      "Failed to update connections",
      process.env.NODE_ENV === "development" && error instanceof Error
        ? { error: error.message }
        : undefined
    );
  }
}

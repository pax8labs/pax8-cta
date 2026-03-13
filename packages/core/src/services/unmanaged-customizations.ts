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
 * Unmanaged Customization Detection Service
 *
 * Detects unmanaged customizations (solution layers not part of any managed solution)
 * in customer tenants. Unmanaged customizations are a high-risk factor for drift
 * because managed solution upgrades can overwrite or conflict with them.
 *
 * Dataverse API: queries msdyn_solutioncomponentsummaries for unmanaged layers
 * on components owned by the managed solution.
 */

import { DataverseClient } from "../dataverse/client.js";
import { TokenManager } from "../auth/token-manager.js";
import { TenantConfig } from "../config/schema.js";
import { DEMO_TENANTS } from "../mock/demo-data.js";

// ============================================================================
// Types
// ============================================================================

/** Types of components that can have unmanaged customizations */
export type CustomizationComponentType =
  | "flow"
  | "entity"
  | "field"
  | "form"
  | "view"
  | "security_role"
  | "plugin"
  | "web_resource"
  | "other";

/** A single unmanaged customization detected in a tenant */
export interface UnmanagedCustomization {
  /** Component unique identifier */
  componentId: string;
  /** Display name of the component */
  displayName: string;
  /** Logical name (e.g., table logical name, flow name) */
  logicalName: string;
  /** Type of component */
  componentType: CustomizationComponentType;
  /** Which managed solution this component belongs to */
  managedSolutionName: string;
  /** Description of the customization detected */
  description: string;
}

/** Result of scanning a tenant for unmanaged customizations */
export interface UnmanagedCustomizationResult {
  tenantId: string;
  tenantName: string;
  /** Total count of unmanaged customizations found */
  totalCustomizations: number;
  /** Breakdown by component type */
  byType: Record<CustomizationComponentType, number>;
  /** List of detected customizations */
  customizations: UnmanagedCustomization[];
  /** Risk level based on customization count and type */
  riskLevel: "none" | "low" | "medium" | "high";
  /** Human-readable risk summary */
  riskSummary: string;
  /** When the scan was performed */
  scannedAt: string;
  /** Error if the scan failed */
  error?: string;
}

/** Dataverse API response shape for solution component summaries */
export interface SolutionComponentSummaryRecord {
  msdyn_componentlogicalname: string;
  msdyn_name: string;
  msdyn_componenttype: number;
  msdyn_ismanaged: boolean;
  msdyn_solutionid: string;
  msdyn_componentid: string;
  msdyn_primaryentityname?: string;
}

// ============================================================================
// Component type mapping (Dataverse component type codes)
// ============================================================================

const COMPONENT_TYPE_MAP: Record<number, CustomizationComponentType> = {
  1: "entity", // Entity
  2: "field", // Attribute (field)
  24: "form", // Form
  26: "view", // Saved Query (view)
  29: "flow", // Workflow / Cloud Flow
  76: "security_role", // Security Role
  91: "plugin", // Plugin Assembly
  61: "web_resource", // Web Resource
};

function mapComponentType(typeCode: number): CustomizationComponentType {
  return COMPONENT_TYPE_MAP[typeCode] || "other";
}

// ============================================================================
// Risk calculation
// ============================================================================

/**
 * Calculate risk level based on unmanaged customizations
 */
export function calculateCustomizationRisk(customizations: UnmanagedCustomization[]): {
  riskLevel: UnmanagedCustomizationResult["riskLevel"];
  riskSummary: string;
} {
  if (customizations.length === 0) {
    return { riskLevel: "none", riskSummary: "No unmanaged customizations detected" };
  }

  // High-risk component types that are most likely to conflict with managed updates
  const highRiskTypes: CustomizationComponentType[] = ["flow", "security_role", "plugin"];
  const highRiskCount = customizations.filter((c) =>
    highRiskTypes.includes(c.componentType)
  ).length;
  const totalCount = customizations.length;

  if (highRiskCount >= 3 || totalCount >= 10) {
    return {
      riskLevel: "high",
      riskSummary:
        `${totalCount} unmanaged customizations detected (${highRiskCount} high-risk). ` +
        `Managed solution upgrade may overwrite or conflict with these changes.`,
    };
  }

  if (highRiskCount >= 1 || totalCount >= 5) {
    return {
      riskLevel: "medium",
      riskSummary:
        `${totalCount} unmanaged customizations detected. ` +
        `Review before upgrading managed solution.`,
    };
  }

  return {
    riskLevel: "low",
    riskSummary:
      `${totalCount} minor unmanaged customizations detected. ` +
      `Low risk of conflict with managed solution upgrade.`,
  };
}

// ============================================================================
// Main Service
// ============================================================================

export class UnmanagedCustomizationDetector {
  /**
   * Scan a single tenant for unmanaged customizations
   */
  async scanTenant(
    tenant: TenantConfig,
    managedSolutionName: string,
    tokenManager?: TokenManager
  ): Promise<UnmanagedCustomizationResult> {
    // Demo mode
    if (process.env.DEMO_MODE === "true" || !tokenManager) {
      return getDemoUnmanagedCustomizations(tenant.tenantId, managedSolutionName);
    }

    // Production mode - query Dataverse
    try {
      const client = new DataverseClient({
        environmentUrl: tenant.environmentUrl,
        tokenManager,
        clientId: tokenManager.getClientId(),
      });

      const customizations = await this.queryUnmanagedLayers(client, managedSolutionName);
      const { riskLevel, riskSummary } = calculateCustomizationRisk(customizations);

      const byType = this.countByType(customizations);

      return {
        tenantId: tenant.tenantId,
        tenantName: tenant.name,
        totalCustomizations: customizations.length,
        byType,
        customizations,
        riskLevel,
        riskSummary,
        scannedAt: new Date().toISOString(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        tenantId: tenant.tenantId,
        tenantName: tenant.name,
        totalCustomizations: 0,
        byType: this.emptyByType(),
        customizations: [],
        riskLevel: "none",
        riskSummary: "Scan failed - unable to determine customization status",
        scannedAt: new Date().toISOString(),
        error: errorMessage,
      };
    }
  }

  /**
   * Scan multiple tenants in parallel
   */
  async scanMultipleTenants(
    tenants: TenantConfig[],
    managedSolutionName: string,
    tokenManager?: TokenManager
  ): Promise<UnmanagedCustomizationResult[]> {
    const CONCURRENCY = 5;
    const results: UnmanagedCustomizationResult[] = [];

    for (let i = 0; i < tenants.length; i += CONCURRENCY) {
      const batch = tenants.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map((t) => this.scanTenant(t, managedSolutionName, tokenManager))
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Query Dataverse for unmanaged solution layers on managed solution components
   */
  private async queryUnmanagedLayers(
    client: DataverseClient,
    managedSolutionName: string
  ): Promise<UnmanagedCustomization[]> {
    // First, get the managed solution ID
    const solution = await client.getSolutionByName(managedSolutionName);
    if (!solution) {
      return [];
    }

    // Query solution component summaries for unmanaged layers
    const result = await client.get<{ value: SolutionComponentSummaryRecord[] }>(
      "/msdyn_solutioncomponentsummaries",
      {
        $filter: `msdyn_solutionid eq '${solution.solutionid}' and msdyn_ismanaged eq false`,
        $select:
          "msdyn_componentlogicalname,msdyn_name,msdyn_componenttype,msdyn_ismanaged,msdyn_solutionid,msdyn_componentid,msdyn_primaryentityname",
      }
    );

    return result.value.map((record) => {
      const componentType = mapComponentType(record.msdyn_componenttype);

      return {
        componentId: record.msdyn_componentid,
        displayName: record.msdyn_name || record.msdyn_componentlogicalname,
        logicalName: record.msdyn_componentlogicalname,
        componentType,
        managedSolutionName,
        description: this.describeCustomization(componentType, record),
      };
    });
  }

  private describeCustomization(
    componentType: CustomizationComponentType,
    record: SolutionComponentSummaryRecord
  ): string {
    switch (componentType) {
      case "flow":
        return `Modified cloud flow: ${record.msdyn_name || record.msdyn_componentlogicalname}`;
      case "entity":
        return `Custom entity modifications on ${record.msdyn_primaryentityname || record.msdyn_componentlogicalname}`;
      case "field":
        return `Added/modified field on ${record.msdyn_primaryentityname || "entity"}`;
      case "form":
        return `Modified form for ${record.msdyn_primaryentityname || "entity"}`;
      case "view":
        return `Modified view for ${record.msdyn_primaryentityname || "entity"}`;
      case "security_role":
        return `Modified security role: ${record.msdyn_name || record.msdyn_componentlogicalname}`;
      case "plugin":
        return `Custom plugin: ${record.msdyn_name || record.msdyn_componentlogicalname}`;
      case "web_resource":
        return `Modified web resource: ${record.msdyn_name || record.msdyn_componentlogicalname}`;
      default:
        return `Unmanaged component: ${record.msdyn_name || record.msdyn_componentlogicalname}`;
    }
  }

  private countByType(
    customizations: UnmanagedCustomization[]
  ): Record<CustomizationComponentType, number> {
    const counts = this.emptyByType();
    for (const c of customizations) {
      counts[c.componentType]++;
    }
    return counts;
  }

  private emptyByType(): Record<CustomizationComponentType, number> {
    return {
      flow: 0,
      entity: 0,
      field: 0,
      form: 0,
      view: 0,
      security_role: 0,
      plugin: 0,
      web_resource: 0,
      other: 0,
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

export const unmanagedCustomizationDetector = new UnmanagedCustomizationDetector();

// ============================================================================
// Demo Mode Data
// ============================================================================

/**
 * Deterministic demo data for unmanaged customizations.
 * Some tenants have customizations, some don't, providing realistic variety.
 */
const DEMO_CUSTOMIZATIONS: Record<string, UnmanagedCustomization[]> = {
  // Contoso Corporation - enterprise tenant with several customizations (high risk)
  "11111111-1111-1111-1111-111111111111": [
    {
      componentId: "cust-001",
      displayName: "Custom Escalation Flow",
      logicalName: "contoso_customescalationflow",
      componentType: "flow",
      managedSolutionName: "CustomerServiceAgent",
      description: "Modified cloud flow: Custom Escalation Flow",
    },
    {
      componentId: "cust-002",
      displayName: "Priority Field",
      logicalName: "contoso_priorityfield",
      componentType: "field",
      managedSolutionName: "CustomerServiceAgent",
      description: "Added/modified field on incident",
    },
    {
      componentId: "cust-003",
      displayName: "VIP Customer View",
      logicalName: "contoso_vipcustomerview",
      componentType: "view",
      managedSolutionName: "CustomerServiceAgent",
      description: "Modified view for incident",
    },
    {
      componentId: "cust-004",
      displayName: "Custom Security Role - Support Lead",
      logicalName: "contoso_supportleadrole",
      componentType: "security_role",
      managedSolutionName: "CustomerServiceAgent",
      description: "Modified security role: Custom Security Role - Support Lead",
    },
    {
      componentId: "cust-005",
      displayName: "After-hours Routing Flow",
      logicalName: "contoso_afterhoursrouting",
      componentType: "flow",
      managedSolutionName: "CustomerServiceAgent",
      description: "Modified cloud flow: After-hours Routing Flow",
    },
    {
      componentId: "cust-006",
      displayName: "Custom Ticket Form",
      logicalName: "contoso_customticketform",
      componentType: "form",
      managedSolutionName: "CustomerServiceAgent",
      description: "Modified form for incident",
    },
  ],
  // Fabrikam Inc - a few minor customizations (medium risk)
  "22222222-2222-2222-2222-222222222222": [
    {
      componentId: "cust-010",
      displayName: "Custom Dashboard View",
      logicalName: "fabrikam_dashboardview",
      componentType: "view",
      managedSolutionName: "CustomerServiceAgent",
      description: "Modified view for account",
    },
    {
      componentId: "cust-011",
      displayName: "Additional Contact Field",
      logicalName: "fabrikam_altcontactfield",
      componentType: "field",
      managedSolutionName: "CustomerServiceAgent",
      description: "Added/modified field on contact",
    },
    {
      componentId: "cust-012",
      displayName: "Custom Notification Flow",
      logicalName: "fabrikam_notificationflow",
      componentType: "flow",
      managedSolutionName: "CustomerServiceAgent",
      description: "Modified cloud flow: Custom Notification Flow",
    },
  ],
  // Adventure Works - no customizations (clean)
  "33333333-3333-3333-3333-333333333333": [],
  // Northwind Traders - minimal customizations (low risk)
  "44444444-4444-4444-4444-444444444444": [
    {
      componentId: "cust-020",
      displayName: "Extra Notes Field",
      logicalName: "northwind_notesfield",
      componentType: "field",
      managedSolutionName: "CustomerServiceAgent",
      description: "Added/modified field on incident",
    },
  ],
  // Woodgrove Bank - heavy customizations (high risk, finance regulations)
  "55555555-5555-5555-5555-555555555555": [
    {
      componentId: "cust-030",
      displayName: "Compliance Check Flow",
      logicalName: "woodgrove_complianceflow",
      componentType: "flow",
      managedSolutionName: "CustomerServiceAgent",
      description: "Modified cloud flow: Compliance Check Flow",
    },
    {
      componentId: "cust-031",
      displayName: "Audit Trail Plugin",
      logicalName: "woodgrove_auditplugin",
      componentType: "plugin",
      managedSolutionName: "CustomerServiceAgent",
      description: "Custom plugin: Audit Trail Plugin",
    },
    {
      componentId: "cust-032",
      displayName: "Compliance Officer Role",
      logicalName: "woodgrove_compliancerole",
      componentType: "security_role",
      managedSolutionName: "CustomerServiceAgent",
      description: "Modified security role: Compliance Officer Role",
    },
    {
      componentId: "cust-033",
      displayName: "Regulatory Hold Flow",
      logicalName: "woodgrove_regholdflow",
      componentType: "flow",
      managedSolutionName: "CustomerServiceAgent",
      description: "Modified cloud flow: Regulatory Hold Flow",
    },
    {
      componentId: "cust-034",
      displayName: "Risk Assessment Form",
      logicalName: "woodgrove_riskform",
      componentType: "form",
      managedSolutionName: "CustomerServiceAgent",
      description: "Modified form for account",
    },
    {
      componentId: "cust-035",
      displayName: "Customer Risk Score Field",
      logicalName: "woodgrove_riskscorefield",
      componentType: "field",
      managedSolutionName: "CustomerServiceAgent",
      description: "Added/modified field on account",
    },
    {
      componentId: "cust-036",
      displayName: "KYC Verification Flow",
      logicalName: "woodgrove_kycflow",
      componentType: "flow",
      managedSolutionName: "CustomerServiceAgent",
      description: "Modified cloud flow: KYC Verification Flow",
    },
    {
      componentId: "cust-037",
      displayName: "Transaction Monitor Web Resource",
      logicalName: "woodgrove_txnmonitor",
      componentType: "web_resource",
      managedSolutionName: "CustomerServiceAgent",
      description: "Modified web resource: Transaction Monitor Web Resource",
    },
    {
      componentId: "cust-038",
      displayName: "Fraud Detection Plugin",
      logicalName: "woodgrove_fraudplugin",
      componentType: "plugin",
      managedSolutionName: "CustomerServiceAgent",
      description: "Custom plugin: Fraud Detection Plugin",
    },
    {
      componentId: "cust-039",
      displayName: "Branch Manager Role",
      logicalName: "woodgrove_branchmgrrole",
      componentType: "security_role",
      managedSolutionName: "CustomerServiceAgent",
      description: "Modified security role: Branch Manager Role",
    },
  ],
  // Tailspin Toys - no customizations
  "66666666-6666-6666-6666-666666666666": [],
  // Litware Inc - some customizations (medium risk)
  "88888888-8888-8888-8888-888888888888": [
    {
      componentId: "cust-040",
      displayName: "Tech Support Routing Flow",
      logicalName: "litware_techrouting",
      componentType: "flow",
      managedSolutionName: "CustomerServiceAgent",
      description: "Modified cloud flow: Tech Support Routing Flow",
    },
    {
      componentId: "cust-041",
      displayName: "Product Category Field",
      logicalName: "litware_productcatfield",
      componentType: "field",
      managedSolutionName: "CustomerServiceAgent",
      description: "Added/modified field on incident",
    },
    {
      componentId: "cust-042",
      displayName: "Engineering Escalation Role",
      logicalName: "litware_engrole",
      componentType: "security_role",
      managedSolutionName: "CustomerServiceAgent",
      description: "Modified security role: Engineering Escalation Role",
    },
    {
      componentId: "cust-043",
      displayName: "SLA Tracker View",
      logicalName: "litware_slaview",
      componentType: "view",
      managedSolutionName: "CustomerServiceAgent",
      description: "Modified view for incident",
    },
    {
      componentId: "cust-044",
      displayName: "Custom Incident Form",
      logicalName: "litware_incidentform",
      componentType: "form",
      managedSolutionName: "CustomerServiceAgent",
      description: "Modified form for incident",
    },
  ],
  // Proseware - no customizations
  "99999999-9999-9999-9999-999999999999": [],
  // Coho Vineyard - no customizations
  "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa": [],
};

/**
 * Get demo unmanaged customizations for a specific tenant
 */
export function getDemoUnmanagedCustomizations(
  tenantId: string,
  managedSolutionName: string
): UnmanagedCustomizationResult {
  const tenant = DEMO_TENANTS.find((t) => t.tenantId === tenantId);
  if (!tenant) {
    return {
      tenantId,
      tenantName: "Unknown",
      totalCustomizations: 0,
      byType: {
        flow: 0,
        entity: 0,
        field: 0,
        form: 0,
        view: 0,
        security_role: 0,
        plugin: 0,
        web_resource: 0,
        other: 0,
      },
      customizations: [],
      riskLevel: "none",
      riskSummary: "Tenant not found",
      scannedAt: new Date().toISOString(),
      error: "Tenant not found",
    };
  }

  const customizations = (DEMO_CUSTOMIZATIONS[tenantId] || []).map((c) => ({
    ...c,
    managedSolutionName,
  }));

  const { riskLevel, riskSummary } = calculateCustomizationRisk(customizations);

  // Count by type
  const byType: Record<CustomizationComponentType, number> = {
    flow: 0,
    entity: 0,
    field: 0,
    form: 0,
    view: 0,
    security_role: 0,
    plugin: 0,
    web_resource: 0,
    other: 0,
  };

  for (const c of customizations) {
    byType[c.componentType]++;
  }

  return {
    tenantId,
    tenantName: tenant.name,
    totalCustomizations: customizations.length,
    byType,
    customizations,
    riskLevel,
    riskSummary,
    scannedAt: new Date().toISOString(),
  };
}

/**
 * Get demo unmanaged customization summary for all enabled tenants
 */
export function getDemoCustomizationSummary(managedSolutionName: string): {
  totalTenants: number;
  tenantsWithCustomizations: number;
  tenantsClean: number;
  totalCustomizations: number;
  highRiskTenants: string[];
  results: UnmanagedCustomizationResult[];
} {
  const enabledTenants = DEMO_TENANTS.filter((t) => t.enabled);
  const results = enabledTenants.map((t) =>
    getDemoUnmanagedCustomizations(t.tenantId, managedSolutionName)
  );

  const tenantsWithCustomizations = results.filter((r) => r.totalCustomizations > 0).length;
  const totalCustomizations = results.reduce((sum, r) => sum + r.totalCustomizations, 0);
  const highRiskTenants = results.filter((r) => r.riskLevel === "high").map((r) => r.tenantName);

  return {
    totalTenants: enabledTenants.length,
    tenantsWithCustomizations,
    tenantsClean: enabledTenants.length - tenantsWithCustomizations,
    totalCustomizations,
    highRiskTenants,
    results,
  };
}

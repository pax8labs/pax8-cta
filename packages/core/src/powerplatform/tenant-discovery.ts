import { TokenManager, TokenManagerConfig } from "../auth/token-manager.js";
import { GdapClient, DelegatedAdminRelationship } from "../auth/gdap-client.js";
import { PowerPlatformAdminClient, EnvironmentSummary } from "./admin-client.js";
import { DataverseClient } from "../dataverse/client.js";

export interface TenantDiscoveryConfig extends TokenManagerConfig {
  // Partner/MSP tenant credentials
}

/**
 * Discovered customer tenant with environments and solutions
 */
export interface DiscoveredTenant {
  tenantId: string;
  displayName: string;
  gdapRelationshipId: string;
  gdapStatus: "active" | "pending" | "terminated" | "expired";
  gdapEndDateTime: string;
  hasPowerPlatformAdmin: boolean;
  environments: EnvironmentSummary[];
  defaultEnvironment?: EnvironmentSummary;
  discoveredAt: string;
  error?: string;
}

/**
 * Solution info from a discovered tenant
 */
export interface DiscoveredSolution {
  tenantId: string;
  tenantName: string;
  environmentId: string;
  environmentName: string;
  environmentUrl: string;
  solutionId: string;
  uniqueName: string;
  friendlyName: string;
  version: string;
  isManaged: boolean;
  publisherName?: string;
}

/**
 * Cache entry for discovered data
 */
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

/**
 * Service for discovering customer tenants and their Power Platform environments
 * via GDAP relationships
 */
export class TenantDiscoveryService {
  private gdapClient: GdapClient;
  private partnerConfig: TenantDiscoveryConfig;

  // In-memory cache with TTL
  private tenantCache: CacheEntry<DiscoveredTenant[]> | null = null;
  private solutionCache: Map<string, CacheEntry<DiscoveredSolution[]>> = new Map();

  private readonly DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

  constructor(config: TenantDiscoveryConfig) {
    this.partnerConfig = config;
    this.gdapClient = new GdapClient(config);
  }

  /**
   * Discover all customer tenants via GDAP and their Power Platform environments
   */
  async discoverTenants(options?: {
    forceRefresh?: boolean;
    cacheTtlMs?: number;
  }): Promise<DiscoveredTenant[]> {
    const { forceRefresh = false, cacheTtlMs = this.DEFAULT_CACHE_TTL_MS } = options || {};

    // Check cache
    if (!forceRefresh && this.tenantCache && Date.now() < this.tenantCache.expiresAt) {
      return this.tenantCache.data;
    }

    // Get all active GDAP relationships
    const relationships = await this.gdapClient.listDelegatedAdminRelationships();

    // Discover environments for each tenant in parallel
    const discoveries = await Promise.allSettled(
      relationships.map(rel => this.discoverTenantEnvironments(rel))
    );

    const tenants: DiscoveredTenant[] = discoveries.map((result, index) => {
      if (result.status === "fulfilled") {
        return result.value;
      }

      // Return partial info on failure
      const rel = relationships[index];
      return {
        tenantId: rel.customer.tenantId,
        displayName: rel.customer.displayName,
        gdapRelationshipId: rel.id,
        gdapStatus: rel.status,
        gdapEndDateTime: rel.endDateTime,
        hasPowerPlatformAdmin: false,
        environments: [],
        discoveredAt: new Date().toISOString(),
        error: result.reason?.message || "Failed to discover environments",
      };
    });

    // Update cache
    this.tenantCache = {
      data: tenants,
      expiresAt: Date.now() + cacheTtlMs,
    };

    return tenants;
  }

  /**
   * Discover environments for a single tenant
   */
  private async discoverTenantEnvironments(
    relationship: DelegatedAdminRelationship
  ): Promise<DiscoveredTenant> {
    const customerTenantId = relationship.customer.tenantId;

    // Check for Power Platform Admin role
    const powerPlatformAdminRoleId = "11648597-926c-4cf3-9c36-bcebb0ba8dcc";
    const hasPowerPlatformAdmin = relationship.accessDetails.unifiedRoles.some(
      role => role.roleDefinitionId === powerPlatformAdminRoleId
    );

    // Create token manager for customer tenant
    const customerTokenManager = new TokenManager({
      ...this.partnerConfig,
      tenantId: customerTenantId,
    });

    // Get environments from Power Platform Admin API
    const adminClient = new PowerPlatformAdminClient({
      tokenManager: customerTokenManager,
    });

    const environments = await adminClient.listEnvironmentSummaries();

    // Find default/production environment
    const defaultEnv = environments.find(e => e.isDefault) ||
      environments.find(e => e.type === "Production") ||
      environments[0];

    return {
      tenantId: customerTenantId,
      displayName: relationship.customer.displayName,
      gdapRelationshipId: relationship.id,
      gdapStatus: relationship.status,
      gdapEndDateTime: relationship.endDateTime,
      hasPowerPlatformAdmin,
      environments,
      defaultEnvironment: defaultEnv,
      discoveredAt: new Date().toISOString(),
    };
  }

  /**
   * Discover solutions installed in a tenant's environment
   */
  async discoverSolutions(
    tenantId: string,
    environmentUrl: string,
    options?: {
      forceRefresh?: boolean;
      cacheTtlMs?: number;
    }
  ): Promise<DiscoveredSolution[]> {
    const { forceRefresh = false, cacheTtlMs = this.DEFAULT_CACHE_TTL_MS } = options || {};
    const cacheKey = `${tenantId}:${environmentUrl}`;

    // Check cache
    const cached = this.solutionCache.get(cacheKey);
    if (!forceRefresh && cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }

    // Get tenant info for display name
    const tenants = await this.discoverTenants();
    const tenant = tenants.find(t => t.tenantId === tenantId);
    const environment = tenant?.environments.find(e => e.instanceUrl === environmentUrl);

    // Create Dataverse client for the environment
    const customerTokenManager = new TokenManager({
      ...this.partnerConfig,
      tenantId,
    });

    const dataverseClient = new DataverseClient({
      environmentUrl,
      tokenManager: customerTokenManager,
    });

    // Query solutions
    const solutions = await dataverseClient.querySolutions();

    const discovered: DiscoveredSolution[] = solutions.map(sol => ({
      tenantId,
      tenantName: tenant?.displayName || tenantId,
      environmentId: environment?.id || "",
      environmentName: environment?.displayName || environmentUrl,
      environmentUrl,
      solutionId: sol.solutionid,
      uniqueName: sol.uniquename,
      friendlyName: sol.friendlyname,
      version: sol.version,
      isManaged: sol.ismanaged,
      publisherName: sol.publisherid?.friendlyname,
    }));

    // Update cache
    this.solutionCache.set(cacheKey, {
      data: discovered,
      expiresAt: Date.now() + cacheTtlMs,
    });

    return discovered;
  }

  /**
   * Discover a specific solution across all tenants
   * Useful for finding where an agent is deployed
   */
  async findSolutionAcrossTenants(
    solutionUniqueName: string,
    options?: {
      forceRefresh?: boolean;
    }
  ): Promise<DiscoveredSolution[]> {
    const { forceRefresh = false } = options || {};

    const tenants = await this.discoverTenants({ forceRefresh });
    const results: DiscoveredSolution[] = [];

    // Check each tenant's default environment
    await Promise.allSettled(
      tenants
        .filter(t => t.defaultEnvironment && !t.error)
        .map(async tenant => {
          const solutions = await this.discoverSolutions(
            tenant.tenantId,
            tenant.defaultEnvironment!.instanceUrl,
            { forceRefresh }
          );

          const match = solutions.find(s => s.uniqueName === solutionUniqueName);
          if (match) {
            results.push(match);
          }
        })
    );

    return results;
  }

  /**
   * Get a token manager for a specific customer tenant
   */
  getCustomerTokenManager(customerTenantId: string): TokenManager {
    return new TokenManager({
      ...this.partnerConfig,
      tenantId: customerTenantId,
    });
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.tenantCache = null;
    this.solutionCache.clear();
  }

  /**
   * Clear cache for a specific tenant
   */
  clearTenantCache(tenantId: string): void {
    // Clear solution caches for this tenant
    for (const key of this.solutionCache.keys()) {
      if (key.startsWith(`${tenantId}:`)) {
        this.solutionCache.delete(key);
      }
    }
    // Force refresh of tenant list on next call
    this.tenantCache = null;
  }
}

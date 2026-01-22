import {
  TenantConfig,
  Config,
  parseDuration,
} from "../config/schema.js";

/**
 * Tenant with wave assignment
 */
export interface TenantWithWave extends TenantConfig {
  waveNumber: number;
  waveName: string;
}

/**
 * Wave execution plan
 */
export interface WaveExecutionPlan {
  waves: {
    waveNumber: number;
    name: string;
    tenants: TenantConfig[];
    maxParallel?: number;
    waitAfterCompletion?: number; // milliseconds
    continueOnFailure: boolean;
  }[];
  totalTenants: number;
}

/**
 * Service for managing deployment waves
 */
export class WaveService {
  /**
   * Create an execution plan from configuration
   */
  createExecutionPlan(
    config: Config,
    selectedTenants?: TenantConfig[]
  ): WaveExecutionPlan {
    const waves = config.settings?.waves;
    const tenants = selectedTenants || config.tenants.filter((t) => t.enabled);

    // If no waves configured, put all tenants in a single wave
    if (!waves || waves.length === 0) {
      return {
        waves: [
          {
            waveNumber: 1,
            name: "Default",
            tenants,
            continueOnFailure: false,
          },
        ],
        totalTenants: tenants.length,
      };
    }

    // Sort waves by order
    const sortedWaves = [...waves].sort((a, b) => a.order - b.order);

    // Assign tenants to waves
    const assignedTenants = new Set<string>();
    const executionWaves: WaveExecutionPlan["waves"] = [];

    for (const wave of sortedWaves) {
      const waveTenants: TenantConfig[] = [];

      for (const tenant of tenants) {
        // Skip if already assigned
        if (assignedTenants.has(tenant.tenantId)) continue;

        // Check if tenant matches wave criteria (by name or tag)
        const matchesByName = wave.tenants.includes(tenant.name);
        const matchesByTag = wave.tenants.some((wt) =>
          tenant.tags?.includes(wt)
        );
        const matchesByTenantId = wave.tenants.includes(tenant.tenantId);

        if (matchesByName || matchesByTag || matchesByTenantId) {
          waveTenants.push(tenant);
          assignedTenants.add(tenant.tenantId);
        }
      }

      if (waveTenants.length > 0) {
        executionWaves.push({
          waveNumber: wave.order,
          name: wave.name,
          tenants: waveTenants,
          maxParallel: wave.maxParallel,
          waitAfterCompletion: wave.waitAfterCompletion
            ? parseDuration(wave.waitAfterCompletion)
            : undefined,
          continueOnFailure: wave.continueOnFailure ?? false,
        });
      }
    }

    // Put remaining tenants in an "Unassigned" wave at the end
    const unassignedTenants = tenants.filter(
      (t) => !assignedTenants.has(t.tenantId)
    );

    if (unassignedTenants.length > 0) {
      const maxWaveNumber = Math.max(
        ...executionWaves.map((w) => w.waveNumber),
        0
      );

      executionWaves.push({
        waveNumber: maxWaveNumber + 1,
        name: "Unassigned",
        tenants: unassignedTenants,
        continueOnFailure: false,
      });
    }

    return {
      waves: executionWaves,
      totalTenants: tenants.length,
    };
  }

  /**
   * Get tenants with wave assignments
   */
  getTenantsWithWaves(plan: WaveExecutionPlan): TenantWithWave[] {
    const result: TenantWithWave[] = [];

    for (const wave of plan.waves) {
      for (const tenant of wave.tenants) {
        result.push({
          ...tenant,
          waveNumber: wave.waveNumber,
          waveName: wave.name,
        });
      }
    }

    return result;
  }

  /**
   * Calculate estimated deployment time based on waves
   */
  estimateDeploymentTime(
    plan: WaveExecutionPlan,
    avgTenantDeploymentMs: number = 60000 // Default: 1 minute per tenant
  ): {
    totalEstimatedMs: number;
    waveEstimates: {
      waveNumber: number;
      name: string;
      estimatedMs: number;
    }[];
  } {
    const waveEstimates: {
      waveNumber: number;
      name: string;
      estimatedMs: number;
    }[] = [];

    let totalMs = 0;

    for (const wave of plan.waves) {
      // Time for this wave depends on maxParallel
      const parallel = wave.maxParallel || wave.tenants.length;
      const batches = Math.ceil(wave.tenants.length / parallel);
      const waveTime = batches * avgTenantDeploymentMs;

      // Add wait time after wave
      const totalWaveTime = waveTime + (wave.waitAfterCompletion || 0);

      waveEstimates.push({
        waveNumber: wave.waveNumber,
        name: wave.name,
        estimatedMs: totalWaveTime,
      });

      totalMs += totalWaveTime;
    }

    return {
      totalEstimatedMs: totalMs,
      waveEstimates,
    };
  }

  /**
   * Validate wave configuration
   */
  validateWaveConfig(
    config: Config
  ): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const waves = config.settings?.waves || [];

    if (waves.length === 0) {
      return { valid: true, errors: [], warnings: [] };
    }

    // Check for duplicate wave orders
    const orders = waves.map((w) => w.order);
    const uniqueOrders = new Set(orders);
    if (orders.length !== uniqueOrders.size) {
      errors.push("Duplicate wave order numbers found");
    }

    // Check for duplicate wave names
    const names = waves.map((w) => w.name);
    const uniqueNames = new Set(names);
    if (names.length !== uniqueNames.size) {
      errors.push("Duplicate wave names found");
    }

    // Check if all referenced tenants exist
    const tenantIds = new Set(config.tenants.map((t) => t.tenantId));
    const tenantNames = new Set(config.tenants.map((t) => t.name));
    const tenantTags = new Set(config.tenants.flatMap((t) => t.tags || []));

    for (const wave of waves) {
      for (const ref of wave.tenants) {
        const matchesTenantId = tenantIds.has(ref);
        const matchesTenantName = tenantNames.has(ref);
        const matchesTag = tenantTags.has(ref);

        if (!matchesTenantId && !matchesTenantName && !matchesTag) {
          warnings.push(
            `Wave "${wave.name}" references unknown tenant/tag: "${ref}"`
          );
        }
      }
    }

    // Check for overlapping tenant assignments
    const assignedTenants = new Map<string, string[]>();

    for (const wave of waves) {
      for (const tenant of config.tenants) {
        const matchesByName = wave.tenants.includes(tenant.name);
        const matchesByTag = wave.tenants.some((wt) =>
          tenant.tags?.includes(wt)
        );
        const matchesByTenantId = wave.tenants.includes(tenant.tenantId);

        if (matchesByName || matchesByTag || matchesByTenantId) {
          const existing = assignedTenants.get(tenant.tenantId) || [];
          existing.push(wave.name);
          assignedTenants.set(tenant.tenantId, existing);
        }
      }
    }

    for (const [tenantId, waveNames] of assignedTenants) {
      if (waveNames.length > 1) {
        const tenant = config.tenants.find((t) => t.tenantId === tenantId);
        warnings.push(
          `Tenant "${tenant?.name}" matches multiple waves: ${waveNames.join(", ")}. First match will be used.`
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Preview wave assignments without executing
   */
  previewWaves(config: Config): {
    waves: {
      waveNumber: number;
      name: string;
      tenantCount: number;
      tenants: { name: string; tenantId: string; tags: string[] }[];
    }[];
    unassignedTenants: { name: string; tenantId: string; tags: string[] }[];
  } {
    const plan = this.createExecutionPlan(config);

    const waves = plan.waves.map((wave) => ({
      waveNumber: wave.waveNumber,
      name: wave.name,
      tenantCount: wave.tenants.length,
      tenants: wave.tenants.map((t) => ({
        name: t.name,
        tenantId: t.tenantId,
        tags: t.tags || [],
      })),
    }));

    // Find tenants in the "Unassigned" wave
    const unassignedWave = plan.waves.find((w) => w.name === "Unassigned");
    const unassignedTenants = (unassignedWave?.tenants || []).map((t) => ({
      name: t.name,
      tenantId: t.tenantId,
      tags: t.tags || [],
    }));

    return {
      waves: waves.filter((w) => w.name !== "Unassigned"),
      unassignedTenants,
    };
  }
}

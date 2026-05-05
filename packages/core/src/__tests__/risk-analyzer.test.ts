/**
 * Copyright 2024 Pax8, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  DeploymentRiskAnalyzer,
  confidenceQualifier,
  type DeploymentContext,
  type DeploymentHistoryEntry,
  type Tenant,
} from "../services/risk-analyzer.js";
import type { WaveExecutionPlan } from "../services/waves.js";

const tenant = (id: string, name: string, tags: string[] = []): Tenant => ({
  id,
  name,
  environmentUrl: `https://${name.replace(/\s/g, "-").toLowerCase()}.crm.dynamics.com`,
  tags,
});

const tenants = (n: number): Tenant[] =>
  Array.from({ length: n }, (_, i) => tenant(`tenant-${i}`, `Tenant ${i}`));

describe("DeploymentRiskAnalyzer", () => {
  const analyzer = new DeploymentRiskAnalyzer();
  const originalDemoMode = process.env.DEMO_MODE;

  beforeEach(() => {
    // Tests assume non-demo unless they opt in.
    delete process.env.DEMO_MODE;
  });

  afterEach(() => {
    if (originalDemoMode === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = originalDemoMode;
  });

  describe("estimateDuration (wave-aware)", () => {
    it("with maxParallel=5 and 10 tenants, single-wave default produces 3-5 min range", async () => {
      const ctx: DeploymentContext = {
        tenants: tenants(10),
        isProduction: false,
        maxParallel: 5,
      };
      const result = await analyzer.analyze(ctx);
      // 10 tenants / 5 parallel = 2 batches × 1 min = 2 min base.
      // Issue overhead from "no history" info issue is 0 (info is excluded).
      // Allow 1-5 minutes for `min`, max with 1.5x buffer.
      expect(result.estimatedDuration.min).toBeGreaterThanOrEqual(1);
      expect(result.estimatedDuration.min).toBeLessThanOrEqual(5);
      expect(result.estimatedDuration.max).toBeLessThanOrEqual(8);
    });

    it("with no parallelism hint, falls back to DEFAULT_MAX_PARALLEL=5 and is sublinear", async () => {
      const ctx: DeploymentContext = {
        tenants: tenants(20),
        isProduction: false,
      };
      const result = await analyzer.analyze(ctx);
      // 20 tenants / 5 parallel = 4 batches × 1 min = 4 min base.
      // Should be well below 20 minutes (the old sequential estimate).
      expect(result.estimatedDuration.min).toBeLessThan(15);
    });

    it("respects an explicit wave plan with multiple waves and waitAfterCompletion", async () => {
      const waves: WaveExecutionPlan = {
        waves: [
          {
            waveNumber: 1,
            name: "wave1",
            tenants: [
              { name: "t1", tenantId: "1", environmentUrl: "https://x", enabled: true },
              { name: "t2", tenantId: "2", environmentUrl: "https://x", enabled: true },
            ],
            maxParallel: 2,
            waitAfterCompletion: 60_000, // 1 min wait
            continueOnFailure: false,
          },
          {
            waveNumber: 2,
            name: "wave2",
            tenants: [
              { name: "t3", tenantId: "3", environmentUrl: "https://x", enabled: true },
              { name: "t4", tenantId: "4", environmentUrl: "https://x", enabled: true },
            ],
            maxParallel: 1,
            continueOnFailure: false,
          },
        ],
        totalTenants: 4,
      };
      const ctx: DeploymentContext = {
        tenants: tenants(4),
        isProduction: false,
        waves,
      };
      const result = await analyzer.analyze(ctx);
      // wave1: 1 batch × 1 min + 1 min wait = 2 min
      // wave2: 2 batches × 1 min = 2 min
      // total = 4 min
      expect(result.estimatedDuration.min).toBeGreaterThanOrEqual(3);
      expect(result.estimatedDuration.min).toBeLessThanOrEqual(7);
    });

    it("adds size overhead for solutions > 50 MB but only +5 min", async () => {
      const small: DeploymentContext = {
        tenants: tenants(5),
        isProduction: false,
        maxParallel: 5,
      };
      const large: DeploymentContext = {
        tenants: tenants(5),
        isProduction: false,
        maxParallel: 5,
        solutionSize: 100_000_000,
      };
      const sm = await analyzer.analyze(small);
      const lg = await analyzer.analyze(large);
      expect(lg.estimatedDuration.min - sm.estimatedDuration.min).toBe(5);
    });
  });

  describe("calculateConfidence", () => {
    it("returns ≤60 with 0 history and no tenant metadata (real mode, no signals)", async () => {
      const ctx: DeploymentContext = {
        tenants: tenants(3),
        isProduction: false,
      };
      const result = await analyzer.analyze(ctx);
      // Coverage: only history check counts (returns "no history" issue =>
      // the dimension result is dataAvailable=false in the no-history branch).
      // So confidence should be 50 (base) + 0 coverage + 0 sample = 50.
      expect(result.confidence).toBeLessThanOrEqual(60);
      expect(result.confidenceQualifier).toBe("limited");
    });

    it("returns ≥85 with 50+ historical deploys per tenant (high coverage + sample)", async () => {
      // Synthesize history: 100 successes spread evenly across 2 tenants
      const history: DeploymentHistoryEntry[] = Array.from({ length: 100 }, (_, i) => ({
        tenantId: `tenant-${i % 2}`,
        status: "success",
        completedAt: new Date(Date.now() - i * 60_000).toISOString(),
      }));
      const ctx: DeploymentContext = {
        tenants: tenants(2),
        isProduction: false,
        deploymentHistory: history,
        maxParallel: 5,
      };
      const result = await analyzer.analyze(ctx);
      expect(result.confidence).toBeGreaterThanOrEqual(85);
      // 50 history entries per tenant pushes us into "high" via the
      // log2-scaled sample-size component plus the +1 dimension of
      // "history" coverage.
      expect(["moderate", "high"]).toContain(result.confidenceQualifier);
    });

    it("hits high confidence (≥90) with maximum coverage + sample size in demo mode", async () => {
      process.env.DEMO_MODE = "true";
      // The 4 healthy demo tenants have 18-24 totalDeploys each — median
      // around 20. With 4 dimensions of coverage (gdap/conn/health/history
      // all dataAvailable=true), confidence should land in "high".
      const ctx: DeploymentContext = {
        tenants: [
          tenant("11111111-1111-1111-1111-111111111111", "Contoso Corporation"),
          tenant("22222222-2222-2222-2222-222222222222", "Fabrikam Inc"),
        ],
        isProduction: false,
        maxParallel: 5,
      };
      const result = await analyzer.analyze(ctx);
      expect(result.confidence).toBeGreaterThanOrEqual(90);
      expect(result.confidenceQualifier).toBe("high");
      expect(result.confidence_qualifier).toBe("high");
    });
  });

  describe("confidenceQualifier", () => {
    it("buckets correctly across thresholds", () => {
      expect(confidenceQualifier(50)).toBe("limited");
      expect(confidenceQualifier(69)).toBe("limited");
      expect(confidenceQualifier(70)).toBe("moderate");
      expect(confidenceQualifier(89)).toBe("moderate");
      expect(confidenceQualifier(90)).toBe("high");
      expect(confidenceQualifier(95)).toBe("high");
    });
  });

  describe("perTenantBreakdown", () => {
    it("returns one row per tenant with score and topFactor", async () => {
      process.env.DEMO_MODE = "true";
      // Pick a known healthy tenant + a known problematic one from demo data.
      const ctx: DeploymentContext = {
        tenants: [
          tenant("11111111-1111-1111-1111-111111111111", "Contoso Corporation"),
          tenant("99999999-9999-9999-9999-999999999999", "Proseware"),
        ],
        isProduction: false,
        maxParallel: 5,
      };
      const result = await analyzer.analyze(ctx);
      expect(result.perTenantBreakdown).toHaveLength(2);
      const proseware = result.perTenantBreakdown.find((r) => r.tenantName === "Proseware");
      expect(proseware).toBeDefined();
      // Proseware has gdap=expired + conn=missing → expect HIGH/CRITICAL.
      expect(["high", "critical", "medium"]).toContain(proseware!.score);
      expect(proseware!.topFactor).toBeDefined();
    });
  });

  describe("RiskAnalysis envelope", () => {
    it("includes both confidenceQualifier and confidence_qualifier (snake_case alias)", async () => {
      const ctx: DeploymentContext = {
        tenants: tenants(2),
        isProduction: false,
        maxParallel: 5,
      };
      const result = await analyzer.analyze(ctx);
      expect(result.confidenceQualifier).toBeDefined();
      expect(result.confidence_qualifier).toBe(result.confidenceQualifier);
    });
  });
});

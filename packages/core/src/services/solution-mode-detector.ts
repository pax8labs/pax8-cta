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
 * Solution Mode Detector
 *
 * Detects whether a solution is installed as managed or unmanaged across
 * target environments to help auto-detect the correct export mode.
 *
 * Extracted from CLI deploy.ts to make this reusable and testable.
 */

import { DataverseClient, type SolutionRecord } from "../dataverse/client.js";
import { TokenManager } from "../auth/token-manager.js";

// ============================================================================
// Types
// ============================================================================

export interface SolutionModeCheck {
  managedCount: number;
  unmanagedCount: number;
  notInstalledCount: number;
  hasConflict: boolean;
}

export interface TargetEnvironment {
  tenantId: string;
  environmentUrl: string;
  name?: string;
}

// ============================================================================
// Service
// ============================================================================

/**
 * Check solution installation mode across target environments.
 *
 * Queries each target in parallel and returns counts of managed/unmanaged/not-installed
 * installations. The `hasConflict` flag indicates whether some targets have the solution
 * as managed while others have it as unmanaged.
 */
export async function detectSolutionMode(
  solutionName: string,
  targets: TargetEnvironment[],
  clientId: string,
  clientSecret: string
): Promise<SolutionModeCheck> {
  let managedCount = 0;
  let unmanagedCount = 0;
  let notInstalledCount = 0;

  // Check each target in parallel for speed
  const checks = targets.map(async (target) => {
    try {
      const tokenManager = new TokenManager({
        tenantId: target.tenantId,
        clientId,
        clientSecret,
      });

      const client = new DataverseClient({
        environmentUrl: target.environmentUrl,
        tokenManager,
      });

      const result = await client.get<{ value: SolutionRecord[] }>("/solutions", {
        $filter: `uniquename eq '${solutionName}'`,
        $select: "solutionid,uniquename,ismanaged",
      });

      if (result.value.length === 0) {
        return "not_installed" as const;
      }

      return result.value[0].ismanaged ? ("managed" as const) : ("unmanaged" as const);
    } catch {
      // If we can't check, assume not installed (will fail at import if wrong)
      return "not_installed" as const;
    }
  });

  const results = await Promise.all(checks);

  for (const mode of results) {
    if (mode === "managed") managedCount++;
    else if (mode === "unmanaged") unmanagedCount++;
    else notInstalledCount++;
  }

  // Conflict if we have both managed and unmanaged installations
  const hasConflict = managedCount > 0 && unmanagedCount > 0;

  return {
    managedCount,
    unmanagedCount,
    notInstalledCount,
    hasConflict,
  };
}

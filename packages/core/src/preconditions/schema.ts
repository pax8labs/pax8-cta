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

import { z } from "zod";
import type { PreconditionManifest } from "./types.js";

/**
 * Zod schemas mirroring `./types.ts`. Used by the manifest loader to
 * surface specific, actionable error messages (e.g.
 * "preconditions[2].matcher.displayName is required") instead of TypeScript's
 * silent "did you check the JSON?" failures.
 */

export const ComparisonOpSchema = z.enum([
  "equals",
  "not-equals",
  "at-least",
  "includes",
  "subset-of",
]);

export const PreconditionRequirementSchema = z.object({
  property: z.string().min(1, "property is required"),
  op: ComparisonOpSchema,
  // `unknown` here is intentional — Zod has no first-class "any JSON" type
  // and the YAML loader hands us anything from primitives to nested objects.
  value: z.unknown(),
});

const RemediationLinkSchema = z.object({
  kind: z.literal("link"),
  title: z.string().min(1),
  urlTemplate: z.string().min(1, "urlTemplate is required for link remediation"),
  manualSteps: z.array(z.string()).default([]),
});

const RemediationCommandSchema = z.object({
  kind: z.literal("command"),
  title: z.string().min(1),
  cmd: z.string().min(1, "cmd is required for command remediation"),
  description: z.string().min(1),
});

const RemediationManualSchema = z.object({
  kind: z.literal("manual"),
  title: z.string().min(1),
  steps: z.array(z.string()).min(1, "manual remediation requires at least one step"),
});

export const RemediationSchema = z.discriminatedUnion("kind", [
  RemediationLinkSchema,
  RemediationCommandSchema,
  RemediationManualSchema,
]);

export const PreconditionSchema = z.object({
  id: z.string().min(1, "id is required"),
  description: z.string().min(1, "description is required"),
  resourceType: z.string().min(1, "resourceType is required"),
  matcher: z.record(z.string(), z.string()),
  requirements: z.array(PreconditionRequirementSchema).min(1, "at least one requirement required"),
  severity: z.enum(["error", "warning"]),
  remediation: RemediationSchema,
});

export const PreconditionManifestSchema: z.ZodType<PreconditionManifest> = z.object({
  solution: z.string().min(1, "solution is required"),
  version: z.string().min(1, "version is required"),
  preconditions: z.array(PreconditionSchema),
}) as z.ZodType<PreconditionManifest>;

/**
 * Thrown when a manifest exists on disk but fails schema validation.
 * Carries the path so callers can include it in the user-facing message.
 */
export class PreconditionManifestValidationError extends Error {
  constructor(
    public readonly path: string,
    public readonly issues: z.ZodIssue[]
  ) {
    const formatted = issues
      .map((issue) => {
        const where = issue.path.length === 0 ? "<root>" : issue.path.join(".");
        return `  - ${where}: ${issue.message}`;
      })
      .join("\n");
    super(`Invalid precondition manifest at ${path}:\n${formatted}`);
    this.name = "PreconditionManifestValidationError";
  }
}

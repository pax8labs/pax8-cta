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

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { parse as parseYaml } from "yaml";
import { PreconditionManifestSchema, PreconditionManifestValidationError } from "./schema.js";
import type { PreconditionManifest } from "./types.js";

/**
 * Strip a `.zip` extension and any leading directory from the user's
 * `--solution` arg so we can match the manifest by the solution's logical
 * name. e.g. `./agent packages/CustomerServiceAgent.zip` → `CustomerServiceAgent`.
 */
export function normalizeSolutionName(input: string): string {
  const base = basename(input);
  const ext = extname(base);
  return ext.toLowerCase() === ".zip" ? base.slice(0, -ext.length) : base;
}

/**
 * Look for `<solutionName>.preconditions.yaml` (or `.yml`) in each search dir
 * and return the first parsed + validated manifest.
 *
 *  - Returns `null` when no manifest exists in any search dir. Callers should
 *    treat this as "preflight skipped, deploy proceeds, log a visible note."
 *  - Throws `PreconditionManifestValidationError` when a manifest IS present
 *    but fails schema validation. Better to fail loudly than silently skip.
 */
export async function loadPreconditionManifest(
  solutionName: string,
  searchDirs: string[]
): Promise<PreconditionManifest | null> {
  const normalized = normalizeSolutionName(solutionName);
  const candidates: string[] = [];
  for (const dir of searchDirs) {
    candidates.push(join(dir, `${normalized}.preconditions.yaml`));
    candidates.push(join(dir, `${normalized}.preconditions.yml`));
  }

  const found = candidates.find((path) => existsSync(path));
  if (!found) return null;

  let raw: unknown;
  try {
    const content = await readFile(found, "utf-8");
    raw = parseYaml(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read precondition manifest at ${found}: ${message}`);
  }

  const result = PreconditionManifestSchema.safeParse(raw);
  if (!result.success) {
    throw new PreconditionManifestValidationError(found, result.error.issues);
  }
  return result.data;
}

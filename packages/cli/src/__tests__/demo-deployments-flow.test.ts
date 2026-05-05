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

/**
 * Subprocess tests for the demo "deploy → list" / "deploy → show" beat.
 *
 * Bug being guarded: a successful demo `deploy` printed a tracking ID like
 * `dep-demo-mos0ueva` but `deployments list` immediately afterwards returned
 * "No deployments found." because the two commands didn't share state. The
 * fix records demo deploys in an in-process `demoDeploymentStore` so a
 * follow-up listing surfaces the same ID.
 *
 * These tests drive a single REPL session through stdin so deploy and the
 * list/show invocations share the same Node process (and therefore the same
 * in-memory store). We can't use `runCli`'s `stdin` option directly because
 * it ends stdin immediately after writing, which races the REPL's readline
 * loop and drops queued commands. Instead we spawn the CLI directly and
 * time each write so each REPL iteration is allowed to run before the next
 * line arrives. (See `driveRepl` below.)
 */

import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stripAnsi } from "./test-utils.js";

interface DemoDeployJsonEnvelope {
  demo: boolean;
  deploymentId: string;
  package: string;
  solution: string;
  destinations: Array<{ name: string; tenantId: string }>;
}

interface DemoListJsonEnvelope {
  deployments: Array<{ id: string; solutionName: string; status: string }>;
  pagination: { total: number; limit: number; offset: number; hasMore: boolean };
}

interface DemoShowJsonEnvelope {
  id: string;
  solutionName: string;
  status: string;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PACKAGE_ROOT = resolve(__dirname, "../..");

/** Pull each top-level `{ ... }` JSON object out of a REPL transcript. */
function extractAllJsonObjects(stdout: string): string[] {
  const cleaned = stripAnsi(stdout);
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        out.push(cleaned.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return out;
}

interface ReplResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Spawn the CLI in REPL mode and feed it `lines` one at a time, waiting for
 * the "pax8-cta> " prompt to reappear before sending the next line. This
 * avoids the race where readline closes before subsequent queued commands
 * have a chance to run.
 */
async function driveRepl(lines: string[], timeoutMs = 60000): Promise<ReplResult> {
  const cliPath = resolve(CLI_PACKAGE_ROOT, "dist/index.js");
  const proc = spawn(process.execPath, [cliPath], {
    cwd: CLI_PACKAGE_ROOT,
    env: {
      ...process.env,
      DEMO_MODE: "true",
      NO_COLOR: "1",
    },
  });

  let stdout = "";
  let stderr = "";

  proc.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  proc.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  const closed = new Promise<number | null>((resolveClose) => {
    proc.on("close", (code) => resolveClose(code));
  });

  const promptRegex = /pax8-cta>\s/g;
  let promptCount = 0;

  function waitForPrompt(target: number, deadline: number): Promise<void> {
    return new Promise((resolveWait, rejectWait) => {
      const check = () => {
        promptRegex.lastIndex = 0;
        const matches = stripAnsi(stdout).match(/pax8-cta>\s/g);
        const count = matches?.length ?? 0;
        if (count >= target) {
          promptCount = count;
          resolveWait();
          return;
        }
        if (Date.now() > deadline) {
          rejectWait(
            new Error(
              `Timed out waiting for prompt #${target} (saw ${count}). stdout tail:\n${stdout.slice(-500)}`
            )
          );
          return;
        }
        setTimeout(check, 50);
      };
      check();
    });
  }

  const deadline = Date.now() + timeoutMs;

  try {
    // Wait for the initial prompt before writing anything.
    await waitForPrompt(1, deadline);

    for (let i = 0; i < lines.length; i++) {
      proc.stdin.write(`${lines[i]}\n`);
      // After this command runs, REPL prints the next prompt. Wait for it
      // before sending the next line so commands don't queue up against a
      // closing readline.
      // The final command is "exit" — readline closes and there is no
      // subsequent prompt, so we don't wait for one after the last line.
      const isLast = i === lines.length - 1;
      if (!isLast) {
        await waitForPrompt(promptCount + 1, deadline);
      }
    }
  } finally {
    proc.stdin.end();
  }

  const exitCode = await Promise.race([
    closed,
    new Promise<number | null>((_, rej) =>
      setTimeout(() => rej(new Error(`REPL did not exit within ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);

  return { exitCode, stdout, stderr };
}

describe("demo deploy → deployments list (in-process store)", () => {
  it("the freshly deployed shipment ID appears in `deployments list --json`", async () => {
    const result = await driveRepl([
      "deploy CustomerServiceAgent --tag enterprise --json",
      "deployments list --limit 50 --offset 0 --json",
      "exit",
    ]);

    // We do not assert on the exit code: REPL teardown via piped stdin can
    // surface a non-zero "unsettled top-level await" code (13) — a
    // pre-existing quirk unrelated to this fix. The output produced before
    // exit is what we care about.

    const envelopes = extractAllJsonObjects(result.stdout);
    expect(envelopes.length).toBeGreaterThanOrEqual(2);

    const deployEnvelope = JSON.parse(envelopes[0]) as DemoDeployJsonEnvelope;
    expect(deployEnvelope.demo).toBe(true);
    expect(deployEnvelope.deploymentId).toMatch(/^dep-demo-/);

    const listEnvelope = JSON.parse(envelopes[1]) as DemoListJsonEnvelope;
    expect(Array.isArray(listEnvelope.deployments)).toBe(true);

    const ids = listEnvelope.deployments.map((d) => d.id);
    // Core regression guard: the bug had `ids` not contain the new shipment.
    expect(ids).toContain(deployEnvelope.deploymentId);

    // Newest record lands at the top so the user sees it first.
    expect(listEnvelope.deployments[0]?.id).toBe(deployEnvelope.deploymentId);
  }, 60000);

  it("the canned demo history is still surfaced alongside the new entry", async () => {
    // Without seeding, recording a deploy on a fresh store would leave only
    // the new entry visible. The store is supposed to lazily seed itself
    // with `generateMockDeploymentHistory()` so first-time `list` still has
    // content (the existing demo contract).
    const result = await driveRepl([
      "deploy CustomerServiceAgent --tag enterprise --json",
      "deployments list --limit 50 --offset 0 --json",
      "exit",
    ]);

    const envelopes = extractAllJsonObjects(result.stdout);
    const listEnvelope = JSON.parse(envelopes[1]) as DemoListJsonEnvelope;

    const cannedIds = listEnvelope.deployments
      .map((d) => d.id)
      .filter((id) => id.startsWith("demo-hist-"));
    expect(cannedIds.length).toBeGreaterThan(0);
  }, 60000);
});

describe("demo deploy → deployments show <id>", () => {
  it("`deployments show` resolves IDs from the same in-process store after a deploy", async () => {
    // We can't predict the deploy's `dep-demo-X` id ahead of time, so we
    // can't interpolate it into the REPL stdin script. Instead we exercise
    // the same code path (`demoDeploymentStore.findById`) by:
    //   1. Running a deploy → list to confirm the new id is recorded.
    //   2. Running `deployments show demo-hist-000` against the same store
    //      to confirm `show` reads through the in-process store as well.
    // The two halves together prove the regression is closed (both list and
    // show go through the store, and `record()` adds entries to it).
    const result = await driveRepl([
      "deploy CustomerServiceAgent --tag enterprise --json",
      "deployments list --limit 1 --offset 0 --json",
      "deployments show demo-hist-000 --json",
      "exit",
    ]);

    const envelopes = extractAllJsonObjects(result.stdout);
    expect(envelopes.length).toBeGreaterThanOrEqual(3);

    const deployEnvelope = JSON.parse(envelopes[0]) as DemoDeployJsonEnvelope;
    const listEnvelope = JSON.parse(envelopes[1]) as DemoListJsonEnvelope;
    const showEnvelope = JSON.parse(envelopes[2]) as DemoShowJsonEnvelope;

    // Recorded deploy lands at the top of the in-process store (proves
    // record() works through deploy.ts).
    expect(listEnvelope.deployments[0]?.id).toBe(deployEnvelope.deploymentId);

    // `deployments show <id>` reads from the same store. We assert against a
    // known seeded id so the test doesn't have to interpolate the
    // unpredictable `dep-demo-*` id into stdin.
    expect(showEnvelope.id).toBe("demo-hist-000");
  }, 60000);
});

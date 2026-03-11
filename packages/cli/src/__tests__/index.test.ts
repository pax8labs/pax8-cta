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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mockEnv } from "./test-utils.js";

// Mock ora
vi.mock("ora", () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    text: "",
  })),
}));

// Mock telemetry
vi.mock("../lib/telemetry.js", () => ({
  isTelemetryEnabled: vi.fn(() => false),
  hasShownFirstRunNotice: vi.fn(() => true),
  markFirstRunNoticeShown: vi.fn(),
  getFirstRunNotice: vi.fn(() => "Test notice"),
  trackCommand: vi.fn(),
  trackFirstRun: vi.fn(),
  shutdownTelemetry: vi.fn().mockResolvedValue(undefined),
}));

// Mock banner
vi.mock("../lib/banner.js", () => ({
  showBanner: vi.fn(),
  showWelcome: vi.fn(),
}));

// Mock repl
vi.mock("../lib/repl.js", () => ({
  startRepl: vi.fn().mockResolvedValue(undefined),
}));

describe("CLI Entry Point", () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    restoreEnv = mockEnv({ DEMO_MODE: "true" });
    vi.resetModules();
  });

  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
  });

  describe("createProgram", () => {
    it("should create a Commander program with all commands", async () => {
      // Import the module to test createProgram
      const { createProgram } = await import("../index.js");

      const program = createProgram();

      expect(program.name()).toBe("agentsync");
      expect(program.description()).toContain("AgentSync");
    });

    it("should have all expected commands registered", async () => {
      const { createProgram } = await import("../index.js");

      const program = createProgram();
      const commandNames = program.commands.map((cmd) => cmd.name());

      // Verify core commands are registered (some may be aliases)
      expect(commandNames).toContain("init");
      expect(commandNames).toContain("demo");
      expect(commandNames).toContain("analyze");
      expect(commandNames).toContain("deployments");
      expect(commandNames).toContain("agents");
      expect(commandNames).toContain("resolve-url");
      expect(commandNames).toContain("telemetry");

      // Commands with aliases - check either name or alias
      const hasExportOrPack = commandNames.includes("export") || commandNames.includes("pack");
      const hasDeployOrShip = commandNames.includes("deploy") || commandNames.includes("ship");
      const hasStatusOrTrack = commandNames.includes("status") || commandNames.includes("track");
      const hasTenantsOrFleet = commandNames.includes("tenants") || commandNames.includes("fleet");
      const hasImport = commandNames.includes("import") || commandNames.includes("deliver");

      expect(hasExportOrPack).toBe(true);
      expect(hasDeployOrShip).toBe(true);
      expect(hasStatusOrTrack).toBe(true);
      expect(hasTenantsOrFleet).toBe(true);
      expect(hasImport).toBe(true);
    });

    it("should have correct number of commands", async () => {
      const { createProgram } = await import("../index.js");

      const program = createProgram();

      // Should have 16 commands registered (including solutions, setup, auth, validate)
      expect(program.commands.length).toBe(16);
    });

    it("should have version set", async () => {
      const { createProgram } = await import("../index.js");

      const program = createProgram();

      expect(program.version()).toBeDefined();
      expect(program.version()).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });
});

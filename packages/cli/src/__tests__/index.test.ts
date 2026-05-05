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

      // Verify core commands are registered
      expect(commandNames).toContain("init");
      expect(commandNames).toContain("demo");
      expect(commandNames).toContain("analyze");
      expect(commandNames).toContain("deployments");
      expect(commandNames).toContain("solutions");
      expect(commandNames).toContain("telemetry");
      expect(commandNames).toContain("export");
      expect(commandNames).toContain("deploy");
      expect(commandNames).toContain("tenants");
      expect(commandNames).toContain("import");
      expect(commandNames).toContain("auth");
      expect(commandNames).toContain("validate");
      expect(commandNames).toContain("setup");
      expect(commandNames).toContain("status");
      expect(commandNames).toContain("config");
    });

    it("should have correct number of commands", async () => {
      const { createProgram } = await import("../index.js");

      const program = createProgram();

      // Should have 15 commands registered (added: config — issue #309)
      expect(program.commands.length).toBe(15);
    });

    it("should have version set", async () => {
      const { createProgram } = await import("../index.js");

      const program = createProgram();

      expect(program.version()).toBeDefined();
      expect(program.version()).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });
});

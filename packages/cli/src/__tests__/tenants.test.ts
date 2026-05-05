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

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Command } from "commander";
import {
  ConsoleCapture,
  mockEnv,
  stripAnsi,
  containsText,
  mockSpinner,
  extractJson,
} from "./test-utils.js";
import { DEMO_TENANTS } from "@agentsync/core";

// Mock ora to avoid spinner interference with console capture
vi.mock("ora", () => ({
  default: vi.fn(() => mockSpinner()),
}));

describe("Tenants Command (fleet)", () => {
  let consoleCapture: ConsoleCapture;
  let restoreEnv: () => void;

  beforeEach(async () => {
    consoleCapture = new ConsoleCapture();
    consoleCapture.start();

    // Enable demo mode for tests
    restoreEnv = mockEnv({ DEMO_MODE: "true" });

    // Reset modules to get fresh command instance for each test
    vi.resetModules();
  });

  afterEach(() => {
    consoleCapture.stop();
    restoreEnv();
    vi.restoreAllMocks();
  });

  describe("list command", () => {
    it("should list all tenants in demo mode", async () => {
      // Dynamically import to get fresh command instance
      const { tenantsCommand } = await import("../commands/tenants/index.js");

      // Create a test program
      const program = new Command();
      program.addCommand(tenantsCommand);

      // Execute "fleet list" command
      await program.parseAsync(["node", "test", "tenants", "list"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show demo mode warning
      expect(containsText(output, "DEMO MODE")).toBe(true);

      // Should show all demo tenants
      DEMO_TENANTS.forEach((tenant) => {
        expect(containsText(cleanOutput, tenant.name)).toBe(true);
      });

      // Should show fleet size - check for "10 destinations" since there are 10 tenants
      expect(containsText(cleanOutput, `Fleet size: ${DEMO_TENANTS.length} destinations`)).toBe(
        true
      );
    });

    it("should filter tenants by tag", async () => {
      const { tenantsCommand } = await import("../commands/tenants/index.js");
      const program = new Command();
      program.addCommand(tenantsCommand);

      // Execute with tag filter - use "enterprise" which exists in demo data
      await program.parseAsync(["node", "test", "tenants", "list", "--tag", "enterprise"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // When filtering, output shows "X tenants with tags: enterprise" instead of "Fleet size:"
      // Count tenants with enterprise tag
      const enterpriseTenants = DEMO_TENANTS.filter((t) => t.tags?.includes("enterprise"));
      expect(
        containsText(cleanOutput, `${enterpriseTenants.length} tenants with tags: enterprise`)
      ).toBe(true);
    });

    it("should support multiple tags", async () => {
      const { tenantsCommand } = await import("../commands/tenants/index.js");
      const program = new Command();
      program.addCommand(tenantsCommand);

      // Execute with multiple tags - use tags that a tenant has together (e.g., enterprise + priority)
      await program.parseAsync([
        "node",
        "test",
        "tenants",
        "list",
        "--tag",
        "enterprise",
        "priority",
      ]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Tag filter uses AND logic - tenant must have ALL specified tags
      const filteredTenants = DEMO_TENANTS.filter(
        (t) => t.tags?.includes("enterprise") && t.tags?.includes("priority")
      );

      // When filtering, output shows "X tenants with tags: enterprise AND priority"
      expect(
        containsText(
          cleanOutput,
          `${filteredTenants.length} tenants with tags: enterprise AND priority`
        )
      ).toBe(true);
    });

    it("should show enabled/disabled status", async () => {
      const { tenantsCommand } = await import("../commands/tenants/index.js");
      const program = new Command();
      program.addCommand(tenantsCommand);

      await program.parseAsync(["node", "test", "tenants", "list"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show "Yes" or "No" for enabled status
      expect(cleanOutput).toMatch(/Yes|No/);
    });

    it('should use "tenants" as command name', async () => {
      const { tenantsCommand } = await import("../commands/tenants/index.js");
      const program = new Command();
      program.addCommand(tenantsCommand);

      // Execute using "tenants" command
      await program.parseAsync(["node", "test", "tenants", "list"]);

      const output = consoleCapture.getAllOutput();

      expect(containsText(output, "DEMO MODE")).toBe(true);
      expect(containsText(output, `Fleet size: ${DEMO_TENANTS.length} destinations`)).toBe(true);
    });

    it('should support "ls" alias for list', async () => {
      const { tenantsCommand } = await import("../commands/tenants/index.js");
      const program = new Command();
      program.addCommand(tenantsCommand);

      // Execute using "ls" alias
      await program.parseAsync(["node", "test", "tenants", "ls"]);

      const output = consoleCapture.getAllOutput();

      // Should work the same as "list"
      expect(containsText(output, `Fleet size: ${DEMO_TENANTS.length} destinations`)).toBe(true);
    });
  });

  describe("output formatting", () => {
    it("should display tenants in a table format", async () => {
      const { tenantsCommand } = await import("../commands/tenants/index.js");
      const program = new Command();
      program.addCommand(tenantsCommand);

      await program.parseAsync(["node", "test", "tenants", "list"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should have table headers
      expect(containsText(cleanOutput, "Destination")).toBe(true);
      expect(containsText(cleanOutput, "Tenant ID")).toBe(true);
      expect(containsText(cleanOutput, "Port (Environment)")).toBe(true);
      expect(containsText(cleanOutput, "Tags")).toBe(true);
      expect(containsText(cleanOutput, "Active")).toBe(true);
    });

    it("should truncate tenant IDs", async () => {
      const { tenantsCommand } = await import("../commands/tenants/index.js");
      const program = new Command();
      program.addCommand(tenantsCommand);

      await program.parseAsync(["node", "test", "tenants", "list"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show truncated tenant IDs (first 8 chars + ...)
      DEMO_TENANTS.forEach((tenant) => {
        const truncatedId = tenant.tenantId.slice(0, 8) + "...";
        expect(containsText(cleanOutput, truncatedId)).toBe(true);
      });
    });

    it('should show "-" for missing tags', async () => {
      const { tenantsCommand } = await import("../commands/tenants/index.js");
      const program = new Command();
      program.addCommand(tenantsCommand);

      await program.parseAsync(["node", "test", "tenants", "list"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // If any tenant has no tags, should show "-"
      const tenantsWithoutTags = DEMO_TENANTS.filter((t) => !t.tags || t.tags.length === 0);
      if (tenantsWithoutTags.length > 0) {
        // Check for "-" in the tags column
        expect(cleanOutput).toContain("-");
      }
    });
  });

  describe("demo mode behavior", () => {
    it("should show demo mode warning", async () => {
      const { tenantsCommand } = await import("../commands/tenants/index.js");
      const program = new Command();
      program.addCommand(tenantsCommand);

      await program.parseAsync(["node", "test", "tenants", "list"]);

      const output = consoleCapture.getAllOutput();

      expect(containsText(output, "DEMO MODE")).toBe(true);
      expect(containsText(output, "Using mock data")).toBe(true);
    });

    it("should use DEMO_TENANTS data", async () => {
      const { tenantsCommand } = await import("../commands/tenants/index.js");
      const program = new Command();
      program.addCommand(tenantsCommand);

      await program.parseAsync(["node", "test", "tenants", "list"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Verify it's using the demo data
      expect(containsText(cleanOutput, `${DEMO_TENANTS.length} destinations from demo fleet`)).toBe(
        true
      );
    });

    it("should show count of active destinations", async () => {
      const { tenantsCommand } = await import("../commands/tenants/index.js");
      const program = new Command();
      program.addCommand(tenantsCommand);

      await program.parseAsync(["node", "test", "tenants", "list"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      const activeCount = DEMO_TENANTS.filter((t) => t.enabled).length;
      expect(containsText(cleanOutput, `${activeCount} active`)).toBe(true);
    });
  });

  describe("show command", () => {
    it("should show tenant details by name", async () => {
      const { tenantsCommand } = await import("../commands/tenants/index.js");
      const program = new Command();
      program.addCommand(tenantsCommand);

      const tenant = DEMO_TENANTS[0];
      await program.parseAsync(["node", "test", "tenants", "show", tenant.name]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show tenant details
      expect(containsText(cleanOutput, tenant.name)).toBe(true);
      expect(containsText(cleanOutput, tenant.tenantId)).toBe(true);
      expect(containsText(cleanOutput, tenant.environmentUrl)).toBe(true);
    });

    it("should show tenant details by partial name", async () => {
      const { tenantsCommand } = await import("../commands/tenants/index.js");
      const program = new Command();
      program.addCommand(tenantsCommand);

      // Search for "Contoso" which should match "Contoso Corporation"
      await program.parseAsync(["node", "test", "tenants", "show", "contoso"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should find the tenant
      const contoso = DEMO_TENANTS.find((t) => t.name.toLowerCase().includes("contoso"));
      if (contoso) {
        expect(containsText(cleanOutput, contoso.name)).toBe(true);
      }
    });

    it("should show enabled/disabled status", async () => {
      const { tenantsCommand } = await import("../commands/tenants/index.js");
      const program = new Command();
      program.addCommand(tenantsCommand);

      const tenant = DEMO_TENANTS[0];
      await program.parseAsync(["node", "test", "tenants", "show", tenant.name]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show status
      expect(cleanOutput).toMatch(/Active|Disabled/);
    });

    it("should show tags", async () => {
      const { tenantsCommand } = await import("../commands/tenants/index.js");
      const program = new Command();
      program.addCommand(tenantsCommand);

      const tenantWithTags = DEMO_TENANTS.find((t) => t.tags && t.tags.length > 0);
      if (tenantWithTags) {
        await program.parseAsync(["node", "test", "tenants", "show", tenantWithTags.name]);

        const output = consoleCapture.getAllOutput();
        const cleanOutput = stripAnsi(output);

        // Should show tags
        expect(containsText(cleanOutput, "Tags:")).toBe(true);
      }
    });

    it("should show agents when --agents flag is used", async () => {
      const { tenantsCommand } = await import("../commands/tenants/index.js");
      const program = new Command();
      program.addCommand(tenantsCommand);

      const tenant = DEMO_TENANTS[0];
      await program.parseAsync(["node", "test", "tenants", "show", tenant.name, "--agents"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show deployed agents section
      expect(containsText(cleanOutput, "Deployed Agents")).toBe(true);
    });

    it("should show health when --health flag is used", async () => {
      const { tenantsCommand } = await import("../commands/tenants/index.js");
      const program = new Command();
      program.addCommand(tenantsCommand);

      const tenant = DEMO_TENANTS[0];
      await program.parseAsync(["node", "test", "tenants", "show", tenant.name, "--health"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show health section
      expect(containsText(cleanOutput, "Health Status")).toBe(true);
    });

    it("should output JSON when --json flag is used", async () => {
      const { tenantsCommand } = await import("../commands/tenants/index.js");
      const program = new Command();
      program.addCommand(tenantsCommand);

      const tenant = DEMO_TENANTS[0];
      await program.parseAsync(["node", "test", "tenants", "show", tenant.name, "--json"]);

      const output = consoleCapture.getAllOutput();

      // Extract JSON from output (may contain demo mode warning)
      const json = extractJson<{ name: string; tenantId: string }>(output);
      expect(json).not.toBeNull();
      expect(json!.name).toBe(tenant.name);
      expect(json!.tenantId).toBe(tenant.tenantId);
    });

    it("should handle tenant not found", async () => {
      const { tenantsCommand } = await import("../commands/tenants/index.js");
      const program = new Command();
      program.addCommand(tenantsCommand);

      // Issue #360: "not found" now flows through handleCommandError, which
      // writes a structured JSON envelope to process.stderr (in JSON mode /
      // non-TTY) or a chalk-formatted message via console.error (TTY). Tests
      // run in non-TTY by default, so stderr.write captures the envelope —
      // patch it to assert on the message content.
      const stderrWrites: string[] = [];
      const writeSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: any) => {
        stderrWrites.push(typeof chunk === "string" ? chunk : chunk.toString());
        return true;
      });

      // Use a non-existent tenant name
      try {
        await program.parseAsync(["node", "test", "tenants", "show", "nonexistent-tenant-xyz"]);
      } catch {
        // Expected to throw due to process.exit
      }

      writeSpy.mockRestore();

      const consoleOutput = stripAnsi(consoleCapture.getAllOutput());
      const stderrOutput = stripAnsi(stderrWrites.join(""));
      const combined = consoleOutput + "\n" + stderrOutput;

      // Should show error message in either console capture or stderr writes
      expect(containsText(combined, "not found")).toBe(true);
    });
  });

  describe("health command", () => {
    it("should show fleet-wide health summary", async () => {
      const { tenantsCommand } = await import("../commands/tenants/index.js");
      const program = new Command();
      program.addCommand(tenantsCommand);

      await program.parseAsync(["node", "test", "tenants", "health"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show health summary
      expect(containsText(cleanOutput, "Fleet Health Summary")).toBe(true);
      expect(containsText(cleanOutput, "healthy")).toBe(true);
    });

    it("should show health for specific tenant", async () => {
      const { tenantsCommand } = await import("../commands/tenants/index.js");
      const program = new Command();
      program.addCommand(tenantsCommand);

      const tenant = DEMO_TENANTS[0];
      await program.parseAsync(["node", "test", "tenants", "health", tenant.name]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show tenant-specific health
      expect(containsText(cleanOutput, tenant.name)).toBe(true);
      expect(containsText(cleanOutput, "Health Details")).toBe(true);
    });

    it("should filter by tag", async () => {
      const { tenantsCommand } = await import("../commands/tenants/index.js");
      const program = new Command();
      program.addCommand(tenantsCommand);

      await program.parseAsync(["node", "test", "tenants", "health", "--tag", "enterprise"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show health summary
      expect(containsText(cleanOutput, "Fleet Health Summary")).toBe(true);
    });

    it("should output JSON when --json flag is used", async () => {
      const { tenantsCommand } = await import("../commands/tenants/index.js");
      const program = new Command();
      program.addCommand(tenantsCommand);

      await program.parseAsync(["node", "test", "tenants", "health", "--json"]);

      const output = consoleCapture.getAllOutput();

      // Extract JSON from output (may contain demo mode warning)
      const json = extractJson<{ summary: { total: number }; tenants: unknown[] }>(output);
      expect(json).not.toBeNull();
      expect(json!.summary).toBeDefined();
      expect(json!.summary.total).toBeGreaterThan(0);
      expect(json!.tenants).toBeDefined();
    });

    it("should output JSON for specific tenant", async () => {
      const { tenantsCommand } = await import("../commands/tenants/index.js");
      const program = new Command();
      program.addCommand(tenantsCommand);

      const tenant = DEMO_TENANTS[0];
      await program.parseAsync(["node", "test", "tenants", "health", tenant.name, "--json"]);

      const output = consoleCapture.getAllOutput();

      // Extract JSON from output (may contain demo mode warning)
      const json = extractJson<{ tenant: string; healthy: boolean; checks: unknown[] }>(output);
      expect(json).not.toBeNull();
      expect(json!.tenant).toBe(tenant.name);
      expect(json!.healthy).toBeDefined();
      expect(json!.checks).toBeDefined();
    });

    it("should handle tenant not found in health command", async () => {
      const { tenantsCommand } = await import("../commands/tenants/index.js");
      const program = new Command();
      program.addCommand(tenantsCommand);

      try {
        await program.parseAsync(["node", "test", "tenants", "health", "nonexistent-tenant"]);
      } catch {
        // Expected to throw due to process.exit
      }

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      expect(containsText(cleanOutput, "not found")).toBe(true);
    });
  });

  describe("list search and filter", () => {
    it("should filter by search query", async () => {
      const { tenantsCommand } = await import("../commands/tenants/index.js");
      const program = new Command();
      program.addCommand(tenantsCommand);

      // Search for "contoso"
      await program.parseAsync(["node", "test", "tenants", "list", "--search", "contoso"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show filter info
      expect(containsText(cleanOutput, 'matching "contoso"')).toBe(true);
    });

    it("should filter by enabled status", async () => {
      const { tenantsCommand } = await import("../commands/tenants/index.js");
      const program = new Command();
      program.addCommand(tenantsCommand);

      await program.parseAsync(["node", "test", "tenants", "list", "--status", "enabled"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show status filter info
      expect(containsText(cleanOutput, "status: enabled")).toBe(true);
    });

    it("should filter by disabled status", async () => {
      const { tenantsCommand } = await import("../commands/tenants/index.js");
      const program = new Command();
      program.addCommand(tenantsCommand);

      await program.parseAsync(["node", "test", "tenants", "list", "--status", "disabled"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show status filter info
      expect(containsText(cleanOutput, "status: disabled")).toBe(true);
    });

    it("should output JSON when --json flag is used on list", async () => {
      const { tenantsCommand } = await import("../commands/tenants/index.js");
      const program = new Command();
      program.addCommand(tenantsCommand);

      await program.parseAsync(["node", "test", "tenants", "list", "--json"]);

      const output = consoleCapture.getAllOutput();

      // Extract JSON from output (may contain demo mode warning or loading message)
      const json = extractJson<{ tenants: unknown[]; total: number; active: number }>(output);
      expect(json).not.toBeNull();
      expect(json!.tenants).toBeDefined();
      expect(json!.total).toBe(DEMO_TENANTS.length);
      expect(json!.active).toBeDefined();
    });

    it("should combine multiple filters", async () => {
      const { tenantsCommand } = await import("../commands/tenants/index.js");
      const program = new Command();
      program.addCommand(tenantsCommand);

      // Combine tag and status filter
      await program.parseAsync([
        "node",
        "test",
        "tenants",
        "list",
        "--tag",
        "enterprise",
        "--status",
        "enabled",
      ]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show both filters
      expect(containsText(cleanOutput, "enterprise")).toBe(true);
      expect(containsText(cleanOutput, "status: enabled")).toBe(true);
    });
  });

  describe("enable command", () => {
    it("should enable a tenant in demo mode", async () => {
      const { tenantsCommand } = await import("../commands/tenants/index.js");
      const program = new Command();
      program.addCommand(tenantsCommand);

      // Get a disabled tenant from demo data
      const disabledTenant = DEMO_TENANTS.find((t) => !t.enabled) || DEMO_TENANTS[0];
      await program.parseAsync(["node", "test", "tenants", "enable", disabledTenant.name]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show demo mode warning
      expect(containsText(output, "DEMO MODE")).toBe(true);
      // Should show success or already enabled message
      expect(
        containsText(cleanOutput, "enabled") || containsText(cleanOutput, "already enabled")
      ).toBe(true);
    });

    it("should show already enabled message for enabled tenant", async () => {
      const { tenantsCommand } = await import("../commands/tenants/index.js");
      const program = new Command();
      program.addCommand(tenantsCommand);

      // Get an enabled tenant from demo data
      const enabledTenant = DEMO_TENANTS.find((t) => t.enabled) || DEMO_TENANTS[0];
      await program.parseAsync(["node", "test", "tenants", "enable", enabledTenant.name]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      expect(containsText(cleanOutput, "already enabled")).toBe(true);
    });

    it("should handle tenant not found", async () => {
      const { tenantsCommand } = await import("../commands/tenants/index.js");
      const program = new Command();
      program.addCommand(tenantsCommand);

      try {
        await program.parseAsync(["node", "test", "tenants", "enable", "nonexistent-tenant"]);
      } catch {
        // Expected to throw due to process.exit
      }

      const output = consoleCapture.getAllOutput();
      expect(containsText(output, "not found")).toBe(true);
    });

    it("should output JSON when --json flag is used", async () => {
      const { tenantsCommand } = await import("../commands/tenants/index.js");
      const program = new Command();
      program.addCommand(tenantsCommand);

      const tenant = DEMO_TENANTS.find((t) => !t.enabled) || DEMO_TENANTS[0];
      await program.parseAsync(["node", "test", "tenants", "enable", tenant.name, "--json"]);

      const output = consoleCapture.getAllOutput();
      const json = extractJson<{ success: boolean; tenant: string; enabled: boolean }>(output);

      // If tenant was already enabled, no JSON output, otherwise check JSON
      if (json) {
        expect(json.success).toBe(true);
        expect(json.enabled).toBe(true);
      }
    });
  });

  describe("disable command", () => {
    it("should disable a tenant in demo mode", async () => {
      const { tenantsCommand } = await import("../commands/tenants/index.js");
      const program = new Command();
      program.addCommand(tenantsCommand);

      // Get an enabled tenant from demo data
      const enabledTenant = DEMO_TENANTS.find((t) => t.enabled) || DEMO_TENANTS[0];
      await program.parseAsync(["node", "test", "tenants", "disable", enabledTenant.name]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show demo mode warning
      expect(containsText(output, "DEMO MODE")).toBe(true);
      // Should show success message
      expect(containsText(cleanOutput, "disabled")).toBe(true);
    });

    it("should show already disabled message for disabled tenant", async () => {
      const { tenantsCommand } = await import("../commands/tenants/index.js");
      const program = new Command();
      program.addCommand(tenantsCommand);

      // Get a disabled tenant from demo data
      const disabledTenant = DEMO_TENANTS.find((t) => !t.enabled) || DEMO_TENANTS[0];
      await program.parseAsync(["node", "test", "tenants", "disable", disabledTenant.name]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // If already disabled, should show that message
      if (!disabledTenant.enabled) {
        expect(containsText(cleanOutput, "already disabled")).toBe(true);
      }
    });

    it("should include reason when provided", async () => {
      const { tenantsCommand } = await import("../commands/tenants/index.js");
      const program = new Command();
      program.addCommand(tenantsCommand);

      const tenant = DEMO_TENANTS.find((t) => t.enabled) || DEMO_TENANTS[0];
      await program.parseAsync([
        "node",
        "test",
        "tenants",
        "disable",
        tenant.name,
        "--reason",
        "Maintenance window",
      ]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      expect(containsText(cleanOutput, "Maintenance window")).toBe(true);
    });

    it("should handle tenant not found", async () => {
      const { tenantsCommand } = await import("../commands/tenants/index.js");
      const program = new Command();
      program.addCommand(tenantsCommand);

      try {
        await program.parseAsync(["node", "test", "tenants", "disable", "nonexistent-tenant"]);
      } catch {
        // Expected to throw due to process.exit
      }

      const output = consoleCapture.getAllOutput();
      expect(containsText(output, "not found")).toBe(true);
    });

    it("should output JSON when --json flag is used", async () => {
      const { tenantsCommand } = await import("../commands/tenants/index.js");
      const program = new Command();
      program.addCommand(tenantsCommand);

      const tenant = DEMO_TENANTS.find((t) => t.enabled) || DEMO_TENANTS[0];
      await program.parseAsync(["node", "test", "tenants", "disable", tenant.name, "--json"]);

      const output = consoleCapture.getAllOutput();
      const json = extractJson<{
        success: boolean;
        tenant: string;
        enabled: boolean;
        reason: string | null;
      }>(output);

      if (json) {
        expect(json.success).toBe(true);
        expect(json.enabled).toBe(false);
      }
    });
  });

  describe("tag command", () => {
    it("should show current tags when no operation specified", async () => {
      const { tenantsCommand } = await import("../commands/tenants/index.js");
      const program = new Command();
      program.addCommand(tenantsCommand);

      const tenant = DEMO_TENANTS[0];
      await program.parseAsync(["node", "test", "tenants", "tag", tenant.name]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      expect(containsText(cleanOutput, "No tag operation specified")).toBe(true);
      expect(containsText(cleanOutput, "Current tags")).toBe(true);
    });

    it("should add tags to tenant", async () => {
      const { tenantsCommand } = await import("../commands/tenants/index.js");
      const program = new Command();
      program.addCommand(tenantsCommand);

      const tenant = DEMO_TENANTS[0];
      await program.parseAsync([
        "node",
        "test",
        "tenants",
        "tag",
        tenant.name,
        "--add",
        "new-tag",
        "another-tag",
      ]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      expect(containsText(cleanOutput, "Updated tags")).toBe(true);
      expect(containsText(cleanOutput, "new-tag")).toBe(true);
      expect(containsText(cleanOutput, "another-tag")).toBe(true);
    });

    it("should remove tags from tenant", async () => {
      const { tenantsCommand } = await import("../commands/tenants/index.js");
      const program = new Command();
      program.addCommand(tenantsCommand);

      const tenant = DEMO_TENANTS[0];
      const existingTag = tenant.tags?.[0] || "enterprise";
      await program.parseAsync([
        "node",
        "test",
        "tenants",
        "tag",
        tenant.name,
        "--remove",
        existingTag,
      ]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      expect(containsText(cleanOutput, "Updated tags")).toBe(true);
      expect(containsText(cleanOutput, "Before:")).toBe(true);
      expect(containsText(cleanOutput, "After:")).toBe(true);
    });

    it("should set tags to replace all existing", async () => {
      const { tenantsCommand } = await import("../commands/tenants/index.js");
      const program = new Command();
      program.addCommand(tenantsCommand);

      const tenant = DEMO_TENANTS[0];
      await program.parseAsync([
        "node",
        "test",
        "tenants",
        "tag",
        tenant.name,
        "--set",
        "tag1,tag2,tag3",
      ]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      expect(containsText(cleanOutput, "Updated tags")).toBe(true);
      expect(containsText(cleanOutput, "tag1")).toBe(true);
      expect(containsText(cleanOutput, "tag2")).toBe(true);
      expect(containsText(cleanOutput, "tag3")).toBe(true);
    });

    it("should handle tenant not found", async () => {
      const { tenantsCommand } = await import("../commands/tenants/index.js");
      const program = new Command();
      program.addCommand(tenantsCommand);

      try {
        await program.parseAsync([
          "node",
          "test",
          "tenants",
          "tag",
          "nonexistent-tenant",
          "--add",
          "tag",
        ]);
      } catch {
        // Expected to throw due to process.exit
      }

      const output = consoleCapture.getAllOutput();
      expect(containsText(output, "not found")).toBe(true);
    });

    it("should output JSON when --json flag is used", async () => {
      const { tenantsCommand } = await import("../commands/tenants/index.js");
      const program = new Command();
      program.addCommand(tenantsCommand);

      const tenant = DEMO_TENANTS[0];
      await program.parseAsync([
        "node",
        "test",
        "tenants",
        "tag",
        tenant.name,
        "--add",
        "json-test-tag",
        "--json",
      ]);

      const output = consoleCapture.getAllOutput();
      const json = extractJson<{
        success: boolean;
        tenant: string;
        before: string[];
        after: string[];
      }>(output);

      expect(json).not.toBeNull();
      expect(json!.success).toBe(true);
      expect(json!.before).toBeDefined();
      expect(json!.after).toBeDefined();
      expect(json!.after).toContain("json-test-tag");
    });
  });
});

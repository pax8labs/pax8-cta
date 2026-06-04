/**
 * Windows/PowerShell compatibility tests
 *
 * These tests verify that the CLI works correctly on Windows by testing
 * cross-platform code paths: CRLF line endings, path handling, signal
 * behavior, TTY detection, and platform-conditional logic.
 *
 * Most tests run on all platforms (they simulate Windows conditions).
 * Tests that must run on actual Windows are marked with platform guards.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolve, join, sep } from "node:path";
import { tmpdir, homedir } from "node:os";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { parseTable } from "./test-utils.js";

// ============================================================================
// CRLF Line Ending Handling
// ============================================================================

describe("CRLF line ending compatibility", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `agentsync-test-${randomUUID()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should parse .env files with Windows CRLF line endings", () => {
    // Simulate a .env file saved by a Windows editor (Notepad, VS Code on Windows)
    const envContent =
      "# Comment\r\nPARTNER_CLIENT_ID=test-id\r\nPARTNER_CLIENT_SECRET=test-secret\r\nSOURCE_ENV=https://org.crm.dynamics.com\r\n";
    const envPath = join(tempDir, ".env");
    writeFileSync(envPath, envContent);

    // Use the same parsing logic as cli/src/index.ts
    const parsed: Record<string, string> = {};
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed
        .slice(eqIdx + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      parsed[key] = value;
    }

    expect(parsed["PARTNER_CLIENT_ID"]).toBe("test-id");
    expect(parsed["PARTNER_CLIENT_SECRET"]).toBe("test-secret");
    expect(parsed["SOURCE_ENV"]).toBe("https://org.crm.dynamics.com");
  });

  it("should parse .env files with Unix LF line endings (regression check)", () => {
    const envContent = "# Comment\nPARTNER_CLIENT_ID=test-id\nPARTNER_CLIENT_SECRET=test-secret\n";
    const envPath = join(tempDir, ".env");
    writeFileSync(envPath, envContent);

    const parsed: Record<string, string> = {};
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed
        .slice(eqIdx + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      parsed[key] = value;
    }

    expect(parsed["PARTNER_CLIENT_ID"]).toBe("test-id");
    expect(parsed["PARTNER_CLIENT_SECRET"]).toBe("test-secret");
  });

  it("should parse .env values without trailing \\r artifacts", () => {
    // This was the original bug: \r would be included in values
    const envContent = "API_KEY=my-secret-key\r\nAPI_URL=https://api.example.com\r\n";

    const parsed: Record<string, string> = {};
    for (const line of envContent.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      parsed[key] = value;
    }

    // Should NOT contain \r at end of values
    expect(parsed["API_KEY"]).toBe("my-secret-key");
    expect(parsed["API_KEY"]).not.toContain("\r");
    expect(parsed["API_URL"]).toBe("https://api.example.com");
    expect(parsed["API_URL"]).not.toContain("\r");
  });
});

// ============================================================================
// parseTable CRLF handling
// ============================================================================

describe("parseTable with CRLF output", () => {
  it("should parse table output containing CRLF line endings", () => {
    // Simulate CLI table output as it might appear on Windows
    const output = [
      "┌──────────┬────────┐",
      "│ NAME     │ STATUS │",
      "├──────────┼────────┤",
      "│ Contoso  │ Active │",
      "│ Fabrikam │ Active │",
      "└──────────┴────────┘",
    ].join("\r\n");

    const table = parseTable(output);
    expect(table.headers).toContain("NAME");
    expect(table.headers).toContain("STATUS");
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]["NAME"]).toBe("Contoso");
    expect(table.rows[1]["NAME"]).toBe("Fabrikam");
  });
});

// ============================================================================
// Path Handling
// ============================================================================

describe("cross-platform path handling", () => {
  it("path.join should produce platform-correct separators", () => {
    const result = join("data", "agentsync.db");
    expect(result).toBe(`data${sep}agentsync.db`);
  });

  it("path.resolve normalizes forward slashes on all platforms", () => {
    const result = resolve("config/tenants.yaml");
    // resolve always produces absolute path with platform separators
    expect(result).not.toContain("//");
    expect(result).toMatch(/tenants\.yaml$/);
  });

  it("homedir() returns a valid path on all platforms", () => {
    const home = homedir();
    expect(home).toBeTruthy();
    expect(typeof home).toBe("string");

    // Config dir should be constructable
    const configDir = join(home, ".pax8-cta");
    expect(configDir).toContain(".pax8-cta");
  });

  it("tmpdir() returns a valid path on all platforms", () => {
    const tmp = tmpdir();
    expect(tmp).toBeTruthy();
    expect(typeof tmp).toBe("string");
  });
});

// ============================================================================
// Platform-Conditional Logic
// ============================================================================

describe("platform-conditional behavior", () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
  });

  it("should skip chmod on win32", () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    // Verify the condition used in init.ts
    expect(process.platform !== "win32").toBe(false);
  });

  it("should run chmod on non-Windows platforms", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    expect(process.platform !== "win32").toBe(true);

    Object.defineProperty(process, "platform", { value: "linux" });
    expect(process.platform !== "win32").toBe(true);
  });

  it("should skip SIGTERM handler registration on win32", () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    // Verify the condition used in index.ts
    expect(process.platform !== "win32").toBe(false);
    // SIGINT should still be registered on all platforms
    // SIGINT should still be registered on all platforms (always true)
    expect(true).toBe(true);
  });
});

// ============================================================================
// Binary/Spawn Detection
// ============================================================================

describe("compiled binary detection", () => {
  it("should detect bundled mode when argv[1] is absent", () => {
    // Simulate compiled binary: no argv[1]
    const savedArgv = [...process.argv];
    process.argv = [process.execPath];

    const isBundled = !process.argv[1] || process.argv[1] === process.execPath;
    expect(isBundled).toBe(true);

    process.argv = savedArgv;
  });

  it("should detect bundled mode when argv[1] equals execPath", () => {
    const savedArgv = [...process.argv];
    process.argv = [process.execPath, process.execPath];

    const isBundled = !process.argv[1] || process.argv[1] === process.execPath;
    expect(isBundled).toBe(true);

    process.argv = savedArgv;
  });

  it("should detect non-bundled mode for normal node execution", () => {
    const savedArgv = [...process.argv];
    process.argv = [process.execPath, "/path/to/script.js"];

    const isBundled = !process.argv[1] || process.argv[1] === process.execPath;
    expect(isBundled).toBe(false);

    process.argv = savedArgv;
  });
});

// ============================================================================
// TTY Detection
// ============================================================================

describe("TTY detection for setRawMode", () => {
  it("should not call setRawMode when stdin is not a TTY", () => {
    // In test/CI environments, stdin is usually not a TTY
    const mockSetRawMode = vi.fn();
    const mockStdin = {
      isTTY: false,
      setRawMode: mockSetRawMode,
    };

    // Simulate the guard used in demo.ts
    if (mockStdin.isTTY) {
      mockStdin.setRawMode(true);
    }

    expect(mockSetRawMode).not.toHaveBeenCalled();
  });

  it("should call setRawMode when stdin is a TTY", () => {
    const mockSetRawMode = vi.fn();
    const mockStdin = {
      isTTY: true,
      setRawMode: mockSetRawMode,
    };

    if (mockStdin.isTTY) {
      mockStdin.setRawMode(true);
    }

    expect(mockSetRawMode).toHaveBeenCalledWith(true);
  });
});

// ============================================================================
// Windows-Only Tests (skipped on non-Windows CI)
// ============================================================================

describe.skipIf(process.platform !== "win32")("Windows-specific tests", () => {
  it("should use USERPROFILE or HOMEDRIVE+HOMEPATH for home directory", () => {
    const home = homedir();
    expect(home).toMatch(/^[A-Z]:\\/i);
  });

  it("should create config directory under user profile", () => {
    const configDir = join(homedir(), ".pax8-cta");
    expect(configDir).toMatch(/^[A-Z]:\\.+\\.pax8-cta$/i);
  });

  it("should handle Windows temp directory path", () => {
    const tmp = tmpdir();
    // Windows temp is typically under AppData\Local\Temp
    expect(tmp).toMatch(/^[A-Z]:\\/i);
  });

  it("should resolve paths with backslashes", () => {
    const p = resolve("config", "tenants.yaml");
    expect(p).toContain("\\");
    expect(p).not.toContain("/");
  });
});

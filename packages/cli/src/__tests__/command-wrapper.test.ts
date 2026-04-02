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

import { describe, it, expect, beforeEach, vi } from "vitest";
import { resolve } from "node:path";

const mockLoadConfig = vi.fn();
const mockFilterTenantsByTags = vi.fn();
const mockIsDemoModeCore = vi.fn();
const mockGetDemoTenants = vi.fn();
const mockIsDemoModeEnabled = vi.fn();

vi.mock("@agentsync/core", () => ({
  loadConfig: mockLoadConfig,
  filterTenantsByTags: mockFilterTenantsByTags,
  isDemoMode: mockIsDemoModeCore,
}));

vi.mock("../commands/demo.js", () => ({
  getDemoTenants: mockGetDemoTenants,
  isDemoModeEnabled: mockIsDemoModeEnabled,
}));

describe("command-wrapper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsDemoModeEnabled.mockReturnValue(false);
    mockIsDemoModeCore.mockReturnValue(false);
  });

  it("withResolvedConfig uses demo handler in demo mode", async () => {
    mockIsDemoModeEnabled.mockReturnValue(true);

    const { withResolvedConfig } = await import("../lib/command-wrapper.js");

    const demoHandler = vi.fn().mockResolvedValue("demo");
    const realHandler = vi.fn();

    const result = await withResolvedConfig(
      { config: "./config/tenants.yaml" },
      demoHandler,
      realHandler
    );

    expect(result).toBe("demo");
    expect(demoHandler).toHaveBeenCalledTimes(1);
    expect(realHandler).not.toHaveBeenCalled();
    expect(mockLoadConfig).not.toHaveBeenCalled();
  });

  it("withResolvedConfig loads config and calls real handler outside demo mode", async () => {
    const { withResolvedConfig } = await import("../lib/command-wrapper.js");
    const config = { tenants: [] };
    mockLoadConfig.mockResolvedValue(config);

    const demoHandler = vi.fn();
    const realHandler = vi.fn().mockResolvedValue("real");

    const result = await withResolvedConfig({}, demoHandler, realHandler);

    expect(result).toBe("real");
    expect(demoHandler).not.toHaveBeenCalled();
    expect(mockLoadConfig).toHaveBeenCalledWith(resolve(process.cwd(), "./config/tenants.yaml"));
    expect(realHandler).toHaveBeenCalledWith(config);
  });

  it("withResolvedDestinations uses demo tenants in demo mode", async () => {
    mockIsDemoModeEnabled.mockReturnValue(true);
    const demoTenants = [{ name: "Demo One" }];
    mockGetDemoTenants.mockReturnValue(demoTenants);

    const { withResolvedDestinations } = await import("../lib/command-wrapper.js");
    const demoHandler = vi.fn().mockResolvedValue("ok");
    const realHandler = vi.fn();

    const result = await withResolvedDestinations(
      { tag: ["production"] },
      demoHandler,
      realHandler
    );

    expect(result).toBe("ok");
    expect(mockGetDemoTenants).toHaveBeenCalledWith({ tag: ["production"] });
    expect(demoHandler).toHaveBeenCalledWith(demoTenants);
    expect(realHandler).not.toHaveBeenCalled();
    expect(mockLoadConfig).not.toHaveBeenCalled();
  });

  it("withResolvedDestinations resolves enabled tenants when --all is set", async () => {
    const { withResolvedDestinations } = await import("../lib/command-wrapper.js");

    const tenantA = { name: "A", enabled: true };
    const tenantB = { name: "B", enabled: false };
    const config = { tenants: [tenantA, tenantB] };
    mockLoadConfig.mockResolvedValue(config);

    const realHandler = vi.fn().mockResolvedValue("real");

    const result = await withResolvedDestinations({ all: true }, vi.fn(), realHandler);

    expect(result).toBe("real");
    expect(mockFilterTenantsByTags).not.toHaveBeenCalled();
    expect(realHandler).toHaveBeenCalledWith({ config, destinations: [tenantA] });
  });

  it("withResolvedDestinations resolves filtered tenants by tags in real mode", async () => {
    const { withResolvedDestinations } = await import("../lib/command-wrapper.js");

    const config = { tenants: [{ name: "A", enabled: true }] };
    const filtered = [{ name: "A", enabled: true }];
    mockLoadConfig.mockResolvedValue(config);
    mockFilterTenantsByTags.mockReturnValue(filtered);

    const realHandler = vi.fn().mockResolvedValue("real");

    const result = await withResolvedDestinations(
      { config: "./config/custom.yaml", tag: ["production"] },
      vi.fn(),
      realHandler
    );

    expect(result).toBe("real");
    expect(mockLoadConfig).toHaveBeenCalledWith(resolve(process.cwd(), "./config/custom.yaml"));
    expect(mockFilterTenantsByTags).toHaveBeenCalledWith(config, ["production"]);
    expect(realHandler).toHaveBeenCalledWith({ config, destinations: filtered });
  });
});

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

import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET } from "./route";

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock environment variables
    process.env.APP_VERSION = "1.0.0";
  });

  it("should return healthy status", async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("healthy");
  });

  it("should include timestamp in response", async () => {
    const beforeCall = new Date().toISOString();

    const response = await GET();
    const data = await response.json();

    expect(data.timestamp).toBeDefined();
    expect(typeof data.timestamp).toBe("string");

    // Timestamp should be recent (within 1 second)
    const timestampDate = new Date(data.timestamp);
    const beforeDate = new Date(beforeCall);
    expect(timestampDate.getTime()).toBeGreaterThanOrEqual(beforeDate.getTime() - 1000);
  });

  it("should include version from environment variable", async () => {
    process.env.APP_VERSION = "2.5.3";

    const response = await GET();
    const data = await response.json();

    expect(data.version).toBe("2.5.3");
  });

  it("should default version to 0.1.0 when not set", async () => {
    delete process.env.APP_VERSION;

    const response = await GET();
    const data = await response.json();

    expect(data.version).toBe("0.1.0");
  });

  it("should return 200 status code", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
  });

  it("should have all required fields", async () => {
    const response = await GET();
    const data = await response.json();

    expect(data).toHaveProperty("status");
    expect(data).toHaveProperty("timestamp");
    expect(data).toHaveProperty("version");
  });

  it("should return JSON content-type", async () => {
    const response = await GET();

    const contentType = response.headers.get("content-type");
    expect(contentType).toContain("application/json");
  });
});

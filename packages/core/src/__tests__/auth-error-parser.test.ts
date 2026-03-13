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

import { describe, it, expect } from "vitest";
import { parseAuthError } from "../services/auth-error-parser.js";

describe("parseAuthError", () => {
  it("should parse invalid client secret (AADSTS7000215)", () => {
    const result = parseAuthError("AADSTS7000215: Invalid client secret provided");
    expect(result.message).toBe("Invalid client secret");
    expect(result.fix).toContain("secret value");
  });

  it("should parse invalid client secret by message text", () => {
    const result = parseAuthError("Invalid client secret was provided");
    expect(result.message).toBe("Invalid client secret");
  });

  it("should parse expired client secret (AADSTS7000222)", () => {
    const result = parseAuthError("AADSTS7000222: The provided client secret keys are expired");
    expect(result.message).toBe("Client secret has expired");
    expect(result.fix).toContain("new client secret");
  });

  it("should parse app not found (AADSTS700016)", () => {
    const result = parseAuthError("AADSTS700016: Application not found in the directory");
    expect(result.message).toBe("Application not found in Azure AD");
    expect(result.fix).toContain("PARTNER_CLIENT_ID");
  });

  it("should parse tenant not found (AADSTS90002)", () => {
    const result = parseAuthError("AADSTS90002: Tenant not found");
    expect(result.message).toBe("Tenant not found");
    expect(result.fix).toContain("PARTNER_TENANT_ID");
  });

  it("should parse not a member of organization", () => {
    const result = parseAuthError("User is not a member of the organization");
    expect(result.message).toBe("App not registered in environment");
    expect(result.fix).toContain("app user");
  });

  it('should parse "is not a member" variant', () => {
    const result = parseAuthError("The application is not a member of this tenant");
    expect(result.message).toBe("App not registered in environment");
  });

  it("should parse privilege errors", () => {
    const result = parseAuthError("prvReadSolution privilege is required");
    expect(result.message).toBe("Insufficient permissions");
    expect(result.fix).toContain("System Administrator");
  });

  it("should parse 403 errors", () => {
    const result = parseAuthError("Request returned status 403");
    expect(result.message).toBe("Insufficient permissions");
  });

  it("should parse prvWrite errors", () => {
    const result = parseAuthError("Missing prvWrite privilege");
    expect(result.message).toBe("Insufficient permissions");
  });

  it("should parse token acquisition failure with AADSTS code", () => {
    const result = parseAuthError("Token acquisition failed: AADSTS50001 - resource not found");
    expect(result.message).toContain("AADSTS50001");
    expect(result.fix).toContain("client ID");
  });

  it("should parse generic token acquisition failure", () => {
    const result = parseAuthError("Token acquisition failed: network error");
    expect(result.message).toBe("Authentication failed");
    expect(result.fix).toContain("credentials");
  });

  it("should return truncated first line for unknown errors", () => {
    const result = parseAuthError("Some completely unknown error\nwith multiple lines");
    expect(result.message).toBe("Some completely unknown error");
    expect(result.fix).toContain("verify your configuration");
  });

  it("should truncate very long unknown error messages to 100 chars", () => {
    const longMsg = "A".repeat(200);
    const result = parseAuthError(longMsg);
    expect(result.message.length).toBe(100);
  });
});

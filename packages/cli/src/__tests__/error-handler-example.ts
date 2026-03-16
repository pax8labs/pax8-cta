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
 * Example demonstrating the error handler output
 * Run this file to see how different error types are formatted
 *
 * Usage: npx tsx packages/cli/src/__tests__/error-handler-example.ts
 */

import { formatError, printError } from "../lib/error-handler.js";
import { GdapError, AuthError, SolutionError, NetworkError, ErrorCode } from "@agentsync/core";

console.log("=".repeat(80));
console.log("AgentSync Error Handler Examples");
console.log("=".repeat(80));

// Example 1: Structured GdapError (new code path)
console.log("\n\n1. Structured GdapError (code-based):");
console.log("-".repeat(80));
{
  const error = new GdapError(
    ErrorCode.GDAP_APP_USER_NOT_REGISTERED,
    "App user not registered in environment",
    {
      clientId: "12345678-1234-1234-1234-123456789abc",
      environmentUrl: "https://contoso.crm.dynamics.com",
    }
  );
  const formatted = formatError(error);
  printError(formatted);
}

// Example 2: Structured AuthError (code-based)
console.log("\n\n2. Structured AuthError (code-based):");
console.log("-".repeat(80));
{
  const error = new AuthError(ErrorCode.AUTH_INVALID_SECRET, "Client secret has expired", {
    clientId: "12345678-1234-1234-1234-123456789abc",
  });
  const formatted = formatError(error);
  printError(formatted);
}

// Example 3: Structured SolutionError (code-based)
console.log("\n\n3. Structured SolutionError (code-based):");
console.log("-".repeat(80));
{
  const error = new SolutionError(
    ErrorCode.SOLUTION_NOT_FOUND,
    "Solution 'MyCustomAgent' not found",
    { solutionName: "MyCustomAgent" }
  );
  const formatted = formatError(error);
  printError(formatted);
}

// Example 4: Structured NetworkError (code-based)
console.log("\n\n4. Structured NetworkError (code-based):");
console.log("-".repeat(80));
{
  const error = new NetworkError(ErrorCode.NETWORK_CONNECTION_REFUSED, "Connection refused", {
    environmentUrl: "https://contoso.crm.dynamics.com",
  });
  const formatted = formatError(error);
  printError(formatted);
}

// Example 5: Legacy plain Error (regex fallback)
console.log("\n\n5. Legacy plain Error (regex fallback):");
console.log("-".repeat(80));
try {
  throw new Error(
    "user is not a member of the organization. Environment: https://contoso.crm.dynamics.com"
  );
} catch (error) {
  const formatted = formatError(error);
  printError(formatted);
}

// Example 6: Legacy permission error (regex fallback)
console.log("\n\n6. Legacy permission error (regex fallback):");
console.log("-".repeat(80));
try {
  throw new Error(
    "prvReadSolution privilege required. Client ID: 12345678-1234-1234-1234-123456789abc"
  );
} catch (error) {
  const formatted = formatError(error);
  printError(formatted);
}

console.log("\n" + "=".repeat(80));
console.log("End of examples");
console.log("=".repeat(80));

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

/**
 * Example demonstrating the error handler output
 * Run this file to see how different error types are formatted
 *
 * Usage: npx tsx packages/cli/src/__tests__/error-handler-example.ts
 */

import { formatError, printError } from "../lib/error-handler.js";

console.log("=".repeat(80));
console.log("AgentSync Error Handler Examples");
console.log("=".repeat(80));

// Example 1: GDAP/App user missing
console.log("\n\n1. GDAP/App User Missing Error:");
console.log("-".repeat(80));
try {
  throw new Error(
    "user is not a member of the organization. Environment: https://contoso.crm.dynamics.com"
  );
} catch (error) {
  const formatted = formatError(error);
  printError(formatted);
}

// Example 2: Permission error
console.log("\n\n2. Permission Error:");
console.log("-".repeat(80));
try {
  throw new Error(
    "prvReadSolution privilege required. Client ID: 12345678-1234-1234-1234-123456789abc"
  );
} catch (error) {
  const formatted = formatError(error);
  printError(formatted);
}

// Example 3: Authentication error
console.log("\n\n3. Authentication Error:");
console.log("-".repeat(80));
try {
  throw new Error("401 Unauthorized - token invalid");
} catch (error) {
  const formatted = formatError(error);
  printError(formatted);
}

// Example 4: Solution not found
console.log("\n\n4. Solution Not Found Error:");
console.log("-".repeat(80));
try {
  throw new Error(
    "Solution 'MyCustomAgent' not found in environment https://contoso.crm.dynamics.com"
  );
} catch (error) {
  const formatted = formatError(error);
  printError(formatted);
}

// Example 5: Network error
console.log("\n\n5. Network Error:");
console.log("-".repeat(80));
try {
  throw new Error("ECONNREFUSED - Connection refused to https://contoso.crm.dynamics.com");
} catch (error) {
  const formatted = formatError(error);
  printError(formatted);
}

console.log("\n" + "=".repeat(80));
console.log("End of examples");
console.log("=".repeat(80));

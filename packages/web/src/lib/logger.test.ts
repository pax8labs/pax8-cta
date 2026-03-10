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
 * Tests for logger with sensitive data redaction
 */

import { logger, createLogger } from "./logger";

describe("Logger Sensitive Data Redaction", () => {
  let consoleOutput: string[] = [];
  let originalConsoleInfo: typeof console.info;
  let originalConsoleError: typeof console.error;
  let originalConsoleWarn: typeof console.warn;
  let originalConsoleLog: typeof console.log;

  beforeEach(() => {
    consoleOutput = [];

    // Capture console output
    originalConsoleInfo = console.info;
    originalConsoleError = console.error;
    originalConsoleWarn = console.warn;
    originalConsoleLog = console.log;

    // Capture the actual string output (first argument is the JSON string in production mode)
    console.info = (...args: unknown[]) => {
      consoleOutput.push(String(args[0]));
    };
    console.error = (...args: unknown[]) => {
      consoleOutput.push(String(args[0]));
    };
    console.warn = (...args: unknown[]) => {
      consoleOutput.push(String(args[0]));
    };
    console.log = (...args: unknown[]) => {
      consoleOutput.push(String(args[0]));
    };
  });

  afterEach(() => {
    console.info = originalConsoleInfo;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
    console.log = originalConsoleLog;
  });

  describe("Object field redaction", () => {
    it("should redact password fields", () => {
      logger.info("User login", {
        username: "alice",
        password: "supersecret123",
      });

      const output = consoleOutput[0];
      expect(output).toContain('"username":"alice"');
      expect(output).toContain('"password":"***"');
      expect(output).not.toContain("supersecret123");
    });

    it("should redact secret fields", () => {
      logger.info("Config loaded", {
        apiUrl: "https://api.example.com",
        clientSecret: "xyz789secret",
      });

      const output = consoleOutput[0];
      expect(output).toContain('"apiUrl":"https://api.example.com"');
      expect(output).toContain('"clientSecret":"***"');
      expect(output).not.toContain("xyz789secret");
    });

    it("should redact token fields", () => {
      logger.info("API request", {
        endpoint: "/api/users",
        authToken: "token_abcdef123456",
      });

      const output = consoleOutput[0];
      expect(output).toContain('"authToken":"***"');
      expect(output).not.toContain("token_abcdef123456");
    });

    it("should redact apiKey fields", () => {
      logger.info("External service call", {
        service: "stripe",
        apiKey: "sk_live_abc123",
      });

      const output = consoleOutput[0];
      expect(output).toContain('"apiKey":"***"');
      expect(output).not.toContain("sk_live_abc123");
    });

    it("should redact authorization fields", () => {
      logger.info("Request headers", {
        "content-type": "application/json",
        authorization: "Bearer token123",
      });

      const output = consoleOutput[0];
      expect(output).toContain('"authorization":"***"');
      expect(output).not.toContain("token123");
    });

    it("should redact cookie fields", () => {
      logger.info("Request received", {
        cookie: "session=abc123; auth=xyz789",
      });

      const output = consoleOutput[0];
      expect(output).toContain('"cookie":"***"');
      expect(output).not.toContain("abc123");
    });

    it("should redact connection string fields", () => {
      logger.info("Database connection", {
        connectionString: "Server=myserver;Database=mydb;User Id=sa;Password=secret123;",
      });

      const output = consoleOutput[0];
      expect(output).toContain('"connectionString":"***"');
      expect(output).not.toContain("secret123");
    });
  });

  describe("Nested object redaction", () => {
    it("should redact nested sensitive fields", () => {
      logger.info("Complex config", {
        database: {
          host: "localhost",
          password: "dbpass123",
        },
        api: {
          url: "https://api.example.com",
          secret: "apisecret",
        },
      });

      const output = consoleOutput[0];
      expect(output).toContain('"host":"localhost"');
      expect(output).toContain('"password":"***"');
      expect(output).toContain('"secret":"***"');
      expect(output).not.toContain("dbpass123");
      expect(output).not.toContain("apisecret");
    });

    it("should redact sensitive data in arrays", () => {
      logger.info("User batch", {
        users: [
          { username: "alice", password: "pass1" },
          { username: "bob", password: "pass2" },
        ],
      });

      const output = consoleOutput[0];
      expect(output).toContain('"username":"alice"');
      expect(output).toContain('"username":"bob"');
      expect(output).toContain('"password":"***"');
      expect(output).not.toContain("pass1");
      expect(output).not.toContain("pass2");
    });
  });

  describe("String message redaction", () => {
    it("should redact Bearer tokens from messages", () => {
      logger.info("Auth failed with Bearer abc123token");

      const output = consoleOutput[0];
      expect(output).toContain("Bearer ***");
      expect(output).not.toContain("abc123token");
    });

    it("should redact password=value patterns", () => {
      logger.info("Using password=secret123");
      const output1 = consoleOutput[0];
      expect(output1).toContain("password=***");
      expect(output1).not.toContain("secret123");

      consoleOutput = [];
      logger.info("Using apiKey=xyz789");
      const output2 = consoleOutput[0];
      expect(output2).toContain("apiKey=***");
      expect(output2).not.toContain("xyz789");
    });

    it("should redact Azure AD secrets", () => {
      logger.info("Environment: AZURE_AD_CLIENT_SECRET=supersecret");

      const output = consoleOutput[0];
      expect(output).toContain("AZURE_AD_CLIENT_SECRET=***");
      expect(output).not.toContain("supersecret");
    });

    it("should redact GitHub tokens", () => {
      logger.info("Using GITHUB_TOKEN=ghp_abc123xyz");

      const output = consoleOutput[0];
      expect(output).toContain("GITHUB_TOKEN=***");
      expect(output).not.toContain("ghp_abc123xyz");
    });

    it("should redact connection strings", () => {
      logger.info("Connecting to: Server=localhost;Database=test;Password=dbpass123");

      const output = consoleOutput[0];
      expect(output).toContain("Password=***");
      expect(output).not.toContain("dbpass123");
    });
  });

  describe("Error message redaction", () => {
    it("should redact sensitive data in error messages", () => {
      const error = new Error("Authentication failed with password: secret123");
      logger.error("Login error", error);

      const output = consoleOutput[0];
      expect(output).toContain("password=***");
      expect(output).not.toContain("secret123");
    });

    it("should redact sensitive data in error stacks", () => {
      const error = new Error("API call failed");
      error.stack = "Error: API call failed\n  at fetch(token=abc123)\n  at handler()";
      logger.error("Request error", error);

      const output = consoleOutput[0];
      expect(output).toContain("token=***");
      expect(output).not.toContain("abc123");
    });

    it("should redact sensitive data in nested error context", () => {
      logger.error("Database error", new Error("Connection failed"), {
        connectionString: "Server=prod;Password=secret",
        attempt: 3,
      });

      const output = consoleOutput[0];
      expect(output).toContain('"connectionString":"***"');
      expect(output).toContain('"attempt":3');
      expect(output).not.toContain("secret");
    });
  });

  describe("Case-insensitive matching", () => {
    it("should redact fields with different casing", () => {
      logger.info("Mixed case fields", {
        PASSWORD: "pass1",
        Password: "pass2",
        password: "pass3",
        API_KEY: "key1",
        ApiKey: "key2",
        apikey: "key3",
      });

      const output = consoleOutput[0];
      expect(output).toContain('"PASSWORD":"***"');
      expect(output).toContain('"Password":"***"');
      expect(output).toContain('"password":"***"');
      expect(output).toContain('"API_KEY":"***"');
      expect(output).toContain('"ApiKey":"***"');
      expect(output).toContain('"apikey":"***"');
      expect(output).not.toContain("pass1");
      expect(output).not.toContain("pass2");
      expect(output).not.toContain("pass3");
      expect(output).not.toContain("key1");
      expect(output).not.toContain("key2");
      expect(output).not.toContain("key3");
    });
  });

  describe("Non-sensitive data preservation", () => {
    it("should preserve non-sensitive fields", () => {
      logger.info("User data", {
        username: "alice",
        email: "alice@example.com",
        role: "admin",
        lastLogin: "2024-01-01T00:00:00Z",
      });

      const output = consoleOutput[0];
      expect(output).toContain('"username":"alice"');
      expect(output).toContain('"email":"alice@example.com"');
      expect(output).toContain('"role":"admin"');
      expect(output).toContain('"lastLogin":"2024-01-01T00:00:00Z"');
    });

    it("should preserve error names and types", () => {
      const error = new Error("Test error message");
      error.name = "ValidationError";
      logger.error("Error occurred", error);

      const output = consoleOutput[0];
      expect(output).toContain('"errorName":"ValidationError"');
    });
  });

  describe("Component logger", () => {
    it("should apply redaction to component loggers", () => {
      const componentLogger = createLogger("auth-service");

      componentLogger.info("Login attempt", {
        username: "alice",
        password: "secret123",
      });

      const output = consoleOutput[0];
      expect(output).toContain('"component":"auth-service"');
      expect(output).toContain('"username":"alice"');
      expect(output).toContain('"password":"***"');
      expect(output).not.toContain("secret123");
    });
  });

  describe("Edge cases", () => {
    it("should handle null and undefined values", () => {
      logger.info("Null values", {
        password: null,
        secret: undefined,
        token: "",
      });

      const output = consoleOutput[0];
      // Should not crash, exact behavior may vary
      expect(output).toBeDefined();
    });

    it("should prevent infinite recursion on circular references", () => {
      const circular: Record<string, unknown> = {
        name: "test",
      };
      circular.self = circular;

      expect(() => {
        logger.info("Circular test", circular);
      }).not.toThrow();
    });

    it("should handle very deep nesting", () => {
      const deep = {
        l1: {
          l2: {
            l3: {
              l4: {
                l5: {
                  l6: {
                    l7: {
                      l8: {
                        l9: {
                          l10: {
                            l11: {
                              password: "secret",
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      expect(() => {
        logger.info("Deep test", deep);
      }).not.toThrow();

      const output = consoleOutput[0];
      expect(output).toBeDefined();
    });
  });
});

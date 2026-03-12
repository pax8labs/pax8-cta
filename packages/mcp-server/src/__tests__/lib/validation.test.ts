import { describe, it, expect } from "vitest";
import {
  DeploymentStatusSchema,
  DeploymentIdSchema,
  TenantIdSchema,
  AgentNameSchema,
  ListDeploymentsSchema,
  GetDeploymentStatusSchema,
  CreateDeploymentSchema,
  MonitorDeploymentSchema,
  RetryDeploymentSchema,
  NoParamsSchema,
  validate,
  validateSafe,
} from "../../lib/validation.js";

describe("Validation Schemas", () => {
  describe("DeploymentStatusSchema", () => {
    it("should accept valid status values", () => {
      const validStatuses = ["pending", "in_progress", "completed", "failed", "cancelled"];

      validStatuses.forEach((status) => {
        expect(() => DeploymentStatusSchema.parse(status)).not.toThrow();
      });
    });

    it("should reject invalid status values", () => {
      expect(() => DeploymentStatusSchema.parse("invalid")).toThrow();
    });
  });

  describe("DeploymentIdSchema", () => {
    it("should accept valid deployment IDs", () => {
      const validIds = ["batch-123", "batch_456", "deployment-test-789"];

      validIds.forEach((id) => {
        expect(() => DeploymentIdSchema.parse(id)).not.toThrow();
      });
    });

    it("should reject empty deployment IDs", () => {
      expect(() => DeploymentIdSchema.parse("")).toThrow();
    });

    it("should reject invalid characters", () => {
      expect(() => DeploymentIdSchema.parse("batch@123")).toThrow();
      expect(() => DeploymentIdSchema.parse("batch 123")).toThrow();
    });
  });

  describe("TenantIdSchema", () => {
    it("should accept valid UUIDs", () => {
      const validUuid = "11111111-1111-1111-1111-111111111111";
      expect(() => TenantIdSchema.parse(validUuid)).not.toThrow();
    });

    it("should reject invalid UUIDs", () => {
      expect(() => TenantIdSchema.parse("not-a-uuid")).toThrow();
      expect(() => TenantIdSchema.parse("123")).toThrow();
    });
  });

  describe("AgentNameSchema", () => {
    it("should accept valid agent names", () => {
      const validNames = ["TestAgent_v1", "agent-123", "MyAgent"];

      validNames.forEach((name) => {
        expect(() => AgentNameSchema.parse(name)).not.toThrow();
      });
    });

    it("should reject invalid agent names", () => {
      expect(() => AgentNameSchema.parse("")).toThrow();
      expect(() => AgentNameSchema.parse("agent@test")).toThrow();
    });
  });

  describe("ListDeploymentsSchema", () => {
    it("should accept valid params", () => {
      const params = {
        status: "completed",
        limit: 50,
        offset: 10,
      };

      expect(() => ListDeploymentsSchema.parse(params)).not.toThrow();
    });

    it("should accept empty params", () => {
      expect(() => ListDeploymentsSchema.parse({})).not.toThrow();
    });

    it("should reject invalid limit", () => {
      expect(() => ListDeploymentsSchema.parse({ limit: 0 })).toThrow();
      expect(() => ListDeploymentsSchema.parse({ limit: 101 })).toThrow();
    });

    it("should reject negative offset", () => {
      expect(() => ListDeploymentsSchema.parse({ offset: -1 })).toThrow();
    });
  });

  describe("GetDeploymentStatusSchema", () => {
    it("should accept valid deployment ID", () => {
      const params = { deploymentId: "batch-123" };
      expect(() => GetDeploymentStatusSchema.parse(params)).not.toThrow();
    });

    it("should reject missing deployment ID", () => {
      expect(() => GetDeploymentStatusSchema.parse({})).toThrow();
    });
  });

  describe("CreateDeploymentSchema", () => {
    it("should accept valid params", () => {
      const params = {
        solutionFile: "/path/to/solution.zip",
        tenantIds: ["11111111-1111-1111-1111-111111111111"],
      };

      expect(() => CreateDeploymentSchema.parse(params)).not.toThrow();
    });

    it("should reject empty tenant IDs array", () => {
      const params = {
        solutionFile: "/path/to/solution.zip",
        tenantIds: [],
      };

      expect(() => CreateDeploymentSchema.parse(params)).toThrow();
    });

    it("should reject missing solution file", () => {
      const params = {
        tenantIds: ["11111111-1111-1111-1111-111111111111"],
      };

      expect(() => CreateDeploymentSchema.parse(params)).toThrow();
    });
  });

  describe("MonitorDeploymentSchema", () => {
    it("should accept valid params", () => {
      const params = {
        deploymentId: "batch-123",
        pollIntervalMs: 5000,
      };

      expect(() => MonitorDeploymentSchema.parse(params)).not.toThrow();
    });

    it("should reject invalid poll interval", () => {
      const params = {
        deploymentId: "batch-123",
        pollIntervalMs: 500, // Too short
      };

      expect(() => MonitorDeploymentSchema.parse(params)).toThrow();
    });
  });

  describe("RetryDeploymentSchema", () => {
    it("should accept valid deployment ID", () => {
      const params = { deploymentId: "batch-123" };
      expect(() => RetryDeploymentSchema.parse(params)).not.toThrow();
    });
  });

  describe("NoParamsSchema", () => {
    it("should accept empty object", () => {
      expect(() => NoParamsSchema.parse({})).not.toThrow();
    });

    it("should reject object with properties", () => {
      expect(() => NoParamsSchema.parse({ foo: "bar" })).toThrow();
    });
  });

  describe("validate function", () => {
    it("should return parsed data on success", () => {
      const result = validate(DeploymentIdSchema, "batch-123");
      expect(result).toBe("batch-123");
    });

    it("should throw descriptive error on failure", () => {
      expect(() => validate(DeploymentIdSchema, "")).toThrow(/Validation failed/);
    });
  });

  describe("validateSafe function", () => {
    it("should return parsed data on success", () => {
      const result = validateSafe(DeploymentIdSchema, "batch-123");
      expect(result).toBe("batch-123");
    });

    it("should return null on failure", () => {
      const result = validateSafe(DeploymentIdSchema, "");
      expect(result).toBeNull();
    });
  });
});

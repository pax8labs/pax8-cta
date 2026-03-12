import { describe, it, expect, beforeEach } from "vitest";
import { AuditLogService } from "../services/audit-log.js";

describe("AuditLogService", () => {
  let auditLog: AuditLogService;

  beforeEach(() => {
    auditLog = new AuditLogService();
  });

  describe("log", () => {
    it("should log an audit entry", async () => {
      await auditLog.log("deployment.created", {
        userId: "user-123",
        resourceType: "deployment",
        resourceId: "deploy-456",
        details: { tenantCount: 5 },
      });

      const entries = await auditLog.query({ userId: "user-123" });
      expect(entries.length).toBeGreaterThan(0);
      expect(entries[0].action).toBe("deployment.created");
    });

    it("should include all provided context", async () => {
      await auditLog.log("user.login", {
        userId: "user-123",
        userEmail: "user@example.com",
        userRoles: ["Admin"],
        resourceType: "auth",
        ipAddress: "192.168.1.1",
        userAgent: "Mozilla/5.0",
        success: true,
      });

      const entries = await auditLog.query({ action: "user.login" });
      expect(entries.length).toBeGreaterThan(0);
      expect(entries[0].userEmail).toBe("user@example.com");
      expect(entries[0].ipAddress).toBe("192.168.1.1");
    });

    it("should handle failed operations", async () => {
      await auditLog.log("deployment.failed", {
        userId: "user-123",
        resourceType: "deployment",
        resourceId: "deploy-789",
        success: false,
        errorMessage: "Import failed",
      });

      const entries = await auditLog.query({ success: false });
      expect(entries.length).toBeGreaterThan(0);
      expect(entries[0].success).toBe(false);
      expect(entries[0].errorMessage).toBe("Import failed");
    });
  });

  describe("query", () => {
    beforeEach(async () => {
      // Create some test entries
      await auditLog.log("deployment.created", {
        userId: "user-1",
        resourceType: "deployment",
        resourceId: "deploy-1",
      });
      await auditLog.log("deployment.completed", {
        userId: "user-2",
        resourceType: "deployment",
        resourceId: "deploy-1",
      });
      await auditLog.log("user.login", {
        userId: "user-1",
        resourceType: "auth",
      });
    });

    it("should filter by userId", async () => {
      const entries = await auditLog.query({ userId: "user-1" });
      expect(entries.every((e) => e.userId === "user-1")).toBe(true);
    });

    it("should filter by action", async () => {
      const entries = await auditLog.query({ action: "deployment.created" });
      expect(entries.every((e) => e.action === "deployment.created")).toBe(true);
    });

    it("should filter by resourceType", async () => {
      const entries = await auditLog.query({ resourceType: "deployment" });
      expect(entries.every((e) => e.resourceType === "deployment")).toBe(true);
    });

    it("should respect limit parameter", async () => {
      const entries = await auditLog.query({ limit: 1 });
      expect(entries.length).toBeLessThanOrEqual(1);
    });
  });

  describe("count", () => {
    it("should count matching entries", async () => {
      await auditLog.log("api.access", {
        userId: "user-1",
        resourceType: "api",
      });
      await auditLog.log("api.access", {
        userId: "user-1",
        resourceType: "api",
      });

      const count = await auditLog.count({ action: "api.access" });
      expect(count).toBeGreaterThanOrEqual(2);
    });
  });

  describe("convenience methods", () => {
    it("logDeploymentCreated should create correct entry", async () => {
      await auditLog.logDeploymentCreated("user-1", "deploy-1", { solution: "TestSolution" });

      const entries = await auditLog.query({ action: "deployment.created" });
      expect(entries.length).toBeGreaterThan(0);
      expect(entries[0].resourceId).toBe("deploy-1");
    });

    it("logDeploymentCompleted should handle success", async () => {
      await auditLog.logDeploymentCompleted("user-1", "deploy-1", true, { duration: 5000 });

      const entries = await auditLog.query({ action: "deployment.completed" });
      expect(entries.length).toBeGreaterThan(0);
      expect(entries[0].success).toBe(true);
    });

    it("logDeploymentCompleted should handle failure", async () => {
      await auditLog.logDeploymentCompleted("user-1", "deploy-1", false, { error: "Failed" });

      const entries = await auditLog.query({ action: "deployment.failed" });
      expect(entries.length).toBeGreaterThan(0);
      expect(entries[0].success).toBe(false);
    });

    it("logUserLogin should create auth entry", async () => {
      await auditLog.logUserLogin("user-1", "user@test.com", "10.0.0.1", "Chrome", true);

      const entries = await auditLog.query({ action: "user.login" });
      expect(entries.length).toBeGreaterThan(0);
      expect(entries[0].userEmail).toBe("user@test.com");
    });
  });
});

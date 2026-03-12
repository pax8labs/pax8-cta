/**
 * Unit tests for authentication functions
 */

import { describe, it, expect } from "vitest";
import { hasRole, AppRoles } from "@/lib/auth";

describe("Authentication", () => {
  describe("hasRole", () => {
    it("should return true if user has the exact required role", () => {
      const roles = ["Deployer", "Viewer"];
      expect(hasRole(roles, "Deployer")).toBe(true);
      expect(hasRole(roles, "Viewer")).toBe(true);
    });

    it("should return false if user does not have the required role", () => {
      const roles = ["Viewer"];
      expect(hasRole(roles, "Deployer")).toBe(false);
    });

    it("should return true if user has Admin role (Admin bypasses all checks)", () => {
      const roles = ["Admin"];
      expect(hasRole(roles, "Deployer")).toBe(true);
      expect(hasRole(roles, "Viewer")).toBe(true);
      expect(hasRole(roles, "SomeOtherRole")).toBe(true);
    });

    it("should return false if roles array is undefined", () => {
      expect(hasRole(undefined, "Deployer")).toBe(false);
    });

    it("should return false if roles array is empty", () => {
      expect(hasRole([], "Deployer")).toBe(false);
    });

    it("should be case-sensitive", () => {
      const roles = ["deployer"];
      expect(hasRole(roles, "Deployer")).toBe(false);
    });

    it("should work with AppRoles constants", () => {
      const adminRoles = [AppRoles.ADMIN];
      const deployerRoles = [AppRoles.DEPLOYER];
      const viewerRoles = [AppRoles.VIEWER];

      expect(hasRole(adminRoles, AppRoles.ADMIN)).toBe(true);
      expect(hasRole(adminRoles, AppRoles.DEPLOYER)).toBe(true); // Admin bypasses
      expect(hasRole(adminRoles, AppRoles.VIEWER)).toBe(true); // Admin bypasses

      expect(hasRole(deployerRoles, AppRoles.DEPLOYER)).toBe(true);
      expect(hasRole(deployerRoles, AppRoles.ADMIN)).toBe(false);

      expect(hasRole(viewerRoles, AppRoles.VIEWER)).toBe(true);
      expect(hasRole(viewerRoles, AppRoles.DEPLOYER)).toBe(false);
    });

    it("should handle multiple roles correctly", () => {
      const roles = ["Deployer", "Viewer", "CustomRole"];

      expect(hasRole(roles, "Deployer")).toBe(true);
      expect(hasRole(roles, "Viewer")).toBe(true);
      expect(hasRole(roles, "CustomRole")).toBe(true);
      expect(hasRole(roles, "Admin")).toBe(false);
      expect(hasRole(roles, "NonExistentRole")).toBe(false);
    });

    it("should return true if user has Admin among other roles", () => {
      const roles = ["Viewer", "Admin", "Deployer"];
      expect(hasRole(roles, "SomeRandomRole")).toBe(true);
    });
  });

  describe("AppRoles constants", () => {
    it("should define all expected roles", () => {
      expect(AppRoles.ADMIN).toBe("Admin");
      expect(AppRoles.DEPLOYER).toBe("Deployer");
      expect(AppRoles.VIEWER).toBe("Viewer");
    });

    it("should have exactly 3 roles", () => {
      const roleCount = Object.keys(AppRoles).length;
      expect(roleCount).toBe(3);
    });
  });
});

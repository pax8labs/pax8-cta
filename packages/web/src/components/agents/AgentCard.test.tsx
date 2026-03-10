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

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgentCard } from "./AgentCard";
import type { Agent } from "@/types/agent";

// Mock sonner
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { toast } from "sonner";

const createMockAgent = (overrides: Partial<Agent> = {}): Agent => ({
  id: "agent-1",
  uniqueName: "test_agent",
  friendlyName: "Test Agent",
  version: "1.0.0",
  isManaged: true,
  status: "active",
  deployedTenants: [],
  totalDeployments: 0,
  ...overrides,
});

describe("AgentCard", () => {
  const defaultProps = {
    agent: createMockAgent(),
    isSelected: false,
    isExpanded: false,
    onSelect: vi.fn(),
    onToggleExpand: vi.fn(),
    onDeploy: vi.fn(),
    onShowDeployments: vi.fn(),
    onRefresh: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  describe("rendering", () => {
    it("should render agent basic info", () => {
      render(<AgentCard {...defaultProps} />);

      expect(screen.getByText("Test Agent")).toBeInTheDocument();
      expect(screen.getByText("v1.0.0")).toBeInTheDocument();
      expect(screen.getByText("test_agent")).toBeInTheDocument();
    });

    it("should render description when provided", () => {
      const agent = createMockAgent({ description: "A helpful test agent" });
      render(<AgentCard {...defaultProps} agent={agent} />);

      expect(screen.getByText("A helpful test agent")).toBeInTheDocument();
    });

    it("should render publisher name when provided", () => {
      const agent = createMockAgent({ publisherName: "Acme Corp" });
      render(<AgentCard {...defaultProps} agent={agent} />);

      expect(screen.getByText("by Acme Corp")).toBeInTheDocument();
    });

    it("should render category badge when provided", () => {
      const agent = createMockAgent({ category: "Sales" });
      render(<AgentCard {...defaultProps} agent={agent} />);

      expect(screen.getByText("Sales")).toBeInTheDocument();
    });

    it("should render custom badge for custom agents", () => {
      const agent = createMockAgent({ isCustom: true });
      render(<AgentCard {...defaultProps} agent={agent} />);

      expect(screen.getByText("custom")).toBeInTheDocument();
    });

    it("should render tags when provided", () => {
      const agent = createMockAgent({ tags: ["sales", "automation"] });
      render(<AgentCard {...defaultProps} agent={agent} />);

      expect(screen.getByText("sales")).toBeInTheDocument();
      expect(screen.getByText("automation")).toBeInTheDocument();
    });

    it("should render capabilities when provided", () => {
      const agent = createMockAgent({ capabilities: ["chat", "email"] });
      render(<AgentCard {...defaultProps} agent={agent} />);

      expect(screen.getByText("chat")).toBeInTheDocument();
      expect(screen.getByText("email")).toBeInTheDocument();
    });
  });

  describe("status badges", () => {
    it("should render deprecated badge for deprecated agents", () => {
      const agent = createMockAgent({ status: "deprecated" });
      render(<AgentCard {...defaultProps} agent={agent} />);

      expect(screen.getByText("deprecated")).toBeInTheDocument();
    });

    it("should render archived badge for archived agents", () => {
      const agent = createMockAgent({ status: "archived" });
      render(<AgentCard {...defaultProps} agent={agent} />);

      expect(screen.getByText("archived")).toBeInTheDocument();
    });

    it("should not render status badge for active agents", () => {
      const agent = createMockAgent({ status: "active" });
      render(<AgentCard {...defaultProps} agent={agent} />);

      // Should not have deprecated or archived badges
      expect(screen.queryByText("deprecated")).not.toBeInTheDocument();
      expect(screen.queryByText("archived")).not.toBeInTheDocument();
    });
  });

  describe("deployment info", () => {
    it('should show "Not deployed" when no deployments', () => {
      render(<AgentCard {...defaultProps} />);

      expect(screen.getByText("Not deployed")).toBeInTheDocument();
    });

    it("should show tenant count when deployed", () => {
      const agent = createMockAgent({
        totalDeployments: 5,
        deployedTenants: [
          {
            tenantId: "t1",
            tenantName: "Tenant 1",
            version: "1.0.0",
            status: "active",
            deployedAt: "2024-01-01",
          },
          {
            tenantId: "t2",
            tenantName: "Tenant 2",
            version: "1.0.0",
            status: "active",
            deployedAt: "2024-01-01",
          },
          {
            tenantId: "t3",
            tenantName: "Tenant 3",
            version: "1.0.0",
            status: "active",
            deployedAt: "2024-01-01",
          },
          {
            tenantId: "t4",
            tenantName: "Tenant 4",
            version: "1.0.0",
            status: "active",
            deployedAt: "2024-01-01",
          },
          {
            tenantId: "t5",
            tenantName: "Tenant 5",
            version: "1.0.0",
            status: "active",
            deployedAt: "2024-01-01",
          },
        ],
      });
      render(<AgentCard {...defaultProps} agent={agent} />);

      expect(screen.getByText("5 tenants")).toBeInTheDocument();
    });

    it("should show health percentage when tenants exist", () => {
      const agent = createMockAgent({
        totalDeployments: 4,
        deployedTenants: [
          {
            tenantId: "t1",
            tenantName: "Tenant 1",
            version: "1.0.0",
            status: "active",
            deployedAt: "2024-01-01",
          },
          {
            tenantId: "t2",
            tenantName: "Tenant 2",
            version: "1.0.0",
            status: "active",
            deployedAt: "2024-01-01",
          },
          {
            tenantId: "t3",
            tenantName: "Tenant 3",
            version: "1.0.0",
            status: "active",
            deployedAt: "2024-01-01",
          },
          {
            tenantId: "t4",
            tenantName: "Tenant 4",
            version: "1.0.0",
            status: "failed",
            deployedAt: "2024-01-01",
          },
        ],
      });
      render(<AgentCard {...defaultProps} agent={agent} />);

      // 3 active out of 4
      expect(screen.getByText("3/4 healthy")).toBeInTheDocument();
    });

    it("should show tenants button when deployed", () => {
      const agent = createMockAgent({ totalDeployments: 3 });
      render(<AgentCard {...defaultProps} agent={agent} />);

      expect(screen.getByText("tenants")).toBeInTheDocument();
    });
  });

  describe("deploy button", () => {
    it("should show Deploy button for active agents", () => {
      const agent = createMockAgent({ status: "active" });
      render(<AgentCard {...defaultProps} agent={agent} />);

      expect(screen.getByText("Deploy")).toBeInTheDocument();
    });

    it("should show Deprecated label for deprecated agents", () => {
      const agent = createMockAgent({ status: "deprecated" });
      render(<AgentCard {...defaultProps} agent={agent} />);

      expect(screen.getByText("Deprecated")).toBeInTheDocument();
      expect(screen.queryByText("Deploy")).not.toBeInTheDocument();
    });

    it("should show Archived label for archived agents", () => {
      const agent = createMockAgent({ status: "archived" });
      render(<AgentCard {...defaultProps} agent={agent} />);

      expect(screen.getByText("Archived")).toBeInTheDocument();
      expect(screen.queryByText("Deploy")).not.toBeInTheDocument();
    });

    it("should call onDeploy when Deploy button clicked", async () => {
      const onDeploy = vi.fn();
      const agent = createMockAgent();
      render(<AgentCard {...defaultProps} agent={agent} onDeploy={onDeploy} />);

      fireEvent.click(screen.getByText("Deploy"));

      expect(onDeploy).toHaveBeenCalledWith(agent);
    });
  });

  describe("selection", () => {
    it("should call onSelect when card clicked", () => {
      const onSelect = vi.fn();
      const agent = createMockAgent();
      render(<AgentCard {...defaultProps} agent={agent} onSelect={onSelect} />);

      fireEvent.click(screen.getByText("Test Agent"));

      expect(onSelect).toHaveBeenCalledWith(agent);
    });

    it("should call onSelect with null when selected card clicked", () => {
      const onSelect = vi.fn();
      const agent = createMockAgent();
      render(<AgentCard {...defaultProps} agent={agent} onSelect={onSelect} isSelected={true} />);

      fireEvent.click(screen.getByText("Test Agent"));

      expect(onSelect).toHaveBeenCalledWith(null);
    });

    it("should have selected styles when isSelected is true", () => {
      render(<AgentCard {...defaultProps} isSelected={true} />);

      const card = screen.getByText("Test Agent").closest('div[class*="bg-white"]');
      expect(card).toHaveClass("border-blue-400");
    });
  });

  describe("expand/collapse", () => {
    it("should call onToggleExpand when expand button clicked", () => {
      const onToggleExpand = vi.fn();
      render(<AgentCard {...defaultProps} onToggleExpand={onToggleExpand} />);

      // Find the expand button by its aria-label
      const expandButton = screen.getByRole("button", { name: /expand test agent details/i });
      fireEvent.click(expandButton);

      expect(onToggleExpand).toHaveBeenCalled();
    });

    it("should show expanded details when isExpanded is true", () => {
      render(<AgentCard {...defaultProps} isExpanded={true} />);

      expect(screen.getByText("Tags")).toBeInTheDocument();
      expect(screen.getByText("Dependencies")).toBeInTheDocument();
      expect(screen.getByText("Connection References")).toBeInTheDocument();
    });

    it("should not show expanded details when isExpanded is false", () => {
      render(<AgentCard {...defaultProps} isExpanded={false} />);

      expect(screen.queryByText("Dependencies")).not.toBeInTheDocument();
      expect(screen.queryByText("Connection References")).not.toBeInTheDocument();
    });
  });

  describe("expanded details content", () => {
    it("should show dependencies when provided", () => {
      const agent = createMockAgent({ dependencies: ["dep1", "dep2"] });
      render(<AgentCard {...defaultProps} agent={agent} isExpanded={true} />);

      expect(screen.getByText("dep1")).toBeInTheDocument();
      expect(screen.getByText("dep2")).toBeInTheDocument();
    });

    it('should show "No dependencies" when empty', () => {
      const agent = createMockAgent({ dependencies: [] });
      render(<AgentCard {...defaultProps} agent={agent} isExpanded={true} />);

      expect(screen.getByText("No dependencies")).toBeInTheDocument();
    });

    it("should show connection references when provided", () => {
      const agent = createMockAgent({
        connectionReferences: [
          { name: "SharePoint", required: true },
          { name: "Dataverse", required: false },
        ],
      });
      render(<AgentCard {...defaultProps} agent={agent} isExpanded={true} />);

      expect(screen.getByText("SharePoint")).toBeInTheDocument();
      expect(screen.getByText("(required)")).toBeInTheDocument();
      expect(screen.getByText("Dataverse")).toBeInTheDocument();
    });

    it("should show environment variables when provided", () => {
      const agent = createMockAgent({
        environmentVariables: [
          { name: "API_KEY", type: "string", required: true },
          { name: "DEBUG", type: "boolean", required: false, defaultValue: "false" },
        ],
      });
      render(<AgentCard {...defaultProps} agent={agent} isExpanded={true} />);

      expect(screen.getByText("Environment Variables")).toBeInTheDocument();
      expect(screen.getByText("API_KEY")).toBeInTheDocument();
      expect(screen.getByText("DEBUG")).toBeInTheDocument();
      expect(screen.getByText("default: false")).toBeInTheDocument();
    });

    it("should show changelog when provided", () => {
      const agent = createMockAgent({ changelog: "Fixed bug in v1.0.1" });
      render(<AgentCard {...defaultProps} agent={agent} isExpanded={true} />);

      expect(screen.getByText("Changelog")).toBeInTheDocument();
      expect(screen.getByText("Fixed bug in v1.0.1")).toBeInTheDocument();
    });
  });

  describe("tag editing", () => {
    it("should show Edit button when expanded", () => {
      render(<AgentCard {...defaultProps} isExpanded={true} />);

      expect(screen.getByText("Edit")).toBeInTheDocument();
    });

    it("should show tag input when Edit clicked", async () => {
      const user = userEvent.setup();
      render(<AgentCard {...defaultProps} isExpanded={true} />);

      await user.click(screen.getByText("Edit"));

      expect(screen.getByPlaceholderText("tag1, tag2, tag3")).toBeInTheDocument();
    });

    it("should pre-fill input with existing tags", async () => {
      const user = userEvent.setup();
      const agent = createMockAgent({ tags: ["existing", "tags"] });
      render(<AgentCard {...defaultProps} agent={agent} isExpanded={true} />);

      await user.click(screen.getByText("Edit"));

      const input = screen.getByPlaceholderText("tag1, tag2, tag3") as HTMLInputElement;
      expect(input.value).toBe("existing, tags");
    });

    it("should cancel tag editing", async () => {
      const user = userEvent.setup();
      render(<AgentCard {...defaultProps} isExpanded={true} />);

      await user.click(screen.getByText("Edit"));
      expect(screen.getByPlaceholderText("tag1, tag2, tag3")).toBeInTheDocument();

      await user.click(screen.getByText("Cancel"));
      expect(screen.queryByPlaceholderText("tag1, tag2, tag3")).not.toBeInTheDocument();
    });

    it("should save tags successfully", async () => {
      const user = userEvent.setup();
      const onRefresh = vi.fn();
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      render(<AgentCard {...defaultProps} onRefresh={onRefresh} isExpanded={true} />);

      await user.click(screen.getByText("Edit"));
      const input = screen.getByPlaceholderText("tag1, tag2, tag3");
      await user.clear(input);
      await user.type(input, "new-tag, another-tag");
      await user.click(screen.getByText("Save"));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/agents/agent-1/tags",
          expect.objectContaining({
            method: "PUT",
            body: JSON.stringify({ tags: ["new-tag", "another-tag"] }),
          })
        );
      });

      expect(toast.success).toHaveBeenCalledWith("Tags updated");
      expect(onRefresh).toHaveBeenCalled();
    });

    it("should handle tag save failure", async () => {
      const user = userEvent.setup();
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
      });

      render(<AgentCard {...defaultProps} isExpanded={true} />);

      await user.click(screen.getByText("Edit"));
      await user.click(screen.getByText("Save"));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Failed to save tags");
      });
    });
  });

  describe("status change", () => {
    describe("active agent", () => {
      it("should show Deprecate and Archive buttons", () => {
        const agent = createMockAgent({ status: "active" });
        render(<AgentCard {...defaultProps} agent={agent} isExpanded={true} />);

        expect(screen.getByText("Deprecate")).toBeInTheDocument();
        expect(screen.getByText("Archive")).toBeInTheDocument();
      });

      it("should show confirmation when Deprecate clicked", async () => {
        const user = userEvent.setup();
        const agent = createMockAgent({ status: "active" });
        render(<AgentCard {...defaultProps} agent={agent} isExpanded={true} />);

        await user.click(screen.getByText("Deprecate"));

        expect(screen.getByText("Deprecate this agent?")).toBeInTheDocument();
        expect(
          screen.getByText(
            "Deprecating will prevent new deployments but keep existing installations."
          )
        ).toBeInTheDocument();
      });

      it("should show confirmation with warning when Archive clicked on deployed agent", async () => {
        const user = userEvent.setup();
        const agent = createMockAgent({ status: "active", totalDeployments: 3 });
        render(<AgentCard {...defaultProps} agent={agent} isExpanded={true} />);

        await user.click(screen.getByText("Archive"));

        expect(screen.getByText("Archive this agent?")).toBeInTheDocument();
        expect(screen.getByText(/This agent is deployed to 3 tenants/)).toBeInTheDocument();
      });
    });

    describe("deprecated agent", () => {
      it("should show Restore and Archive buttons", () => {
        const agent = createMockAgent({ status: "deprecated" });
        render(<AgentCard {...defaultProps} agent={agent} isExpanded={true} />);

        expect(screen.getByText("Restore to Active")).toBeInTheDocument();
        expect(screen.getByText("Archive")).toBeInTheDocument();
      });
    });

    describe("archived agent", () => {
      it("should show only Restore button", () => {
        const agent = createMockAgent({ status: "archived" });
        render(<AgentCard {...defaultProps} agent={agent} isExpanded={true} />);

        expect(screen.getByText("Restore to Active")).toBeInTheDocument();
        expect(screen.queryByText("Archive")).not.toBeInTheDocument();
        expect(screen.queryByText("Deprecate")).not.toBeInTheDocument();
      });
    });

    it("should confirm status change successfully", async () => {
      const user = userEvent.setup();
      const onRefresh = vi.fn();
      const agent = createMockAgent({ status: "active" });
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      render(<AgentCard {...defaultProps} agent={agent} onRefresh={onRefresh} isExpanded={true} />);

      await user.click(screen.getByText("Deprecate"));
      await user.click(screen.getByText("Confirm"));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/agents/agent-1/status",
          expect.objectContaining({
            method: "PUT",
            body: JSON.stringify({ status: "deprecated" }),
          })
        );
      });

      expect(toast.success).toHaveBeenCalledWith("Agent deprecated");
      expect(onRefresh).toHaveBeenCalled();
    });

    it("should handle status change failure", async () => {
      const user = userEvent.setup();
      const agent = createMockAgent({ status: "active" });
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: "Server error" }),
      });

      render(<AgentCard {...defaultProps} agent={agent} isExpanded={true} />);

      await user.click(screen.getByText("Archive"));
      await user.click(screen.getByText("Confirm"));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Server error");
      });
    });

    it("should cancel status change confirmation", async () => {
      const user = userEvent.setup();
      const agent = createMockAgent({ status: "active" });
      render(<AgentCard {...defaultProps} agent={agent} isExpanded={true} />);

      await user.click(screen.getByText("Deprecate"));
      expect(screen.getByText("Deprecate this agent?")).toBeInTheDocument();

      await user.click(screen.getByText("Cancel"));
      expect(screen.queryByText("Deprecate this agent?")).not.toBeInTheDocument();
    });
  });

  describe("tenants button", () => {
    it("should call onShowDeployments when tenants button clicked", async () => {
      const user = userEvent.setup();
      const onShowDeployments = vi.fn();
      const agent = createMockAgent({ totalDeployments: 5 });
      render(<AgentCard {...defaultProps} agent={agent} onShowDeployments={onShowDeployments} />);

      await user.click(screen.getByText("tenants"));

      expect(onShowDeployments).toHaveBeenCalled();
    });
  });
});

describe("formatRelativeTime", () => {
  // Test the formatRelativeTime function through rendering
  it('should show "now" for recent times', () => {
    const agent = createMockAgent({ lastPublished: new Date().toISOString() });
    render(
      <AgentCard
        agent={agent}
        isSelected={false}
        isExpanded={false}
        onSelect={vi.fn()}
        onToggleExpand={vi.fn()}
        onDeploy={vi.fn()}
        onShowDeployments={vi.fn()}
        onRefresh={vi.fn()}
      />
    );

    expect(screen.getByText("published now")).toBeInTheDocument();
  });

  it("should show minutes for times less than an hour", () => {
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const agent = createMockAgent({ lastPublished: thirtyMinsAgo });
    render(
      <AgentCard
        agent={agent}
        isSelected={false}
        isExpanded={false}
        onSelect={vi.fn()}
        onToggleExpand={vi.fn()}
        onDeploy={vi.fn()}
        onShowDeployments={vi.fn()}
        onRefresh={vi.fn()}
      />
    );

    expect(screen.getByText("published 30m")).toBeInTheDocument();
  });

  it("should show hours for times less than a day", () => {
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    const agent = createMockAgent({ lastPublished: fiveHoursAgo });
    render(
      <AgentCard
        agent={agent}
        isSelected={false}
        isExpanded={false}
        onSelect={vi.fn()}
        onToggleExpand={vi.fn()}
        onDeploy={vi.fn()}
        onShowDeployments={vi.fn()}
        onRefresh={vi.fn()}
      />
    );

    expect(screen.getByText("published 5h")).toBeInTheDocument();
  });

  it("should show days for times less than a week", () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const agent = createMockAgent({ lastPublished: threeDaysAgo });
    render(
      <AgentCard
        agent={agent}
        isSelected={false}
        isExpanded={false}
        onSelect={vi.fn()}
        onToggleExpand={vi.fn()}
        onDeploy={vi.fn()}
        onShowDeployments={vi.fn()}
        onRefresh={vi.fn()}
      />
    );

    expect(screen.getByText("published 3d")).toBeInTheDocument();
  });
});

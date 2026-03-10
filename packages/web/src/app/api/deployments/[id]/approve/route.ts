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

import { NextRequest, NextResponse } from "next/server";
import { loadConfig, isDemoMode } from "@agentsync/core";
import { resolve } from "path";
import * as approvalRepo from "@/lib/repositories/approval-repository";
import { logApprovalAction } from "@/lib/repositories/audit-repository";
import { demoDeployments, demoBatches } from "@/lib/demo-store";
import { startDemoDeployment } from "@/lib/demo-worker";
import * as deploymentRepo from "@/lib/repositories/deployment-repository";
import { requireAuth, requireApproverEmail, logAuthFailure } from "@/lib/api-middleware";
import { createLogger } from "@/lib/logger";
import { deploymentRateLimit, createRateLimitResponse } from "@/lib/rate-limit";
import { parseAndValidate, approvalActionSchema } from "@/lib/validation";
import { validationError, invalidRequest, internalError } from "@/lib/errors";

const logger = createLogger("deployment-approve");

export const dynamic = "force-dynamic";

const CONFIG_PATH = process.env.CONFIG_PATH || "./config/tenants.yaml";

/**
 * GET /api/deployments/[id]/approve - Get approval status
 * Requires authentication
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireAuth();
  if (session instanceof NextResponse) {
    logAuthFailure(undefined, `/api/deployments/${params.id}/approve`, "unauthorized");
    return session;
  }
  try {
    const approval = approvalRepo.getApprovalByDeployment(params.id);

    if (!approval) {
      return NextResponse.json({
        requiresApproval: false,
        message: "No approval required or not found",
      });
    }

    return NextResponse.json({
      requiresApproval: true,
      status: approval.status,
      requiredApprovals: approval.requiredApprovals,
      currentApprovals: approval.approvals.length,
      approvals: approval.approvals.map((a) => ({
        approver: a.approver,
        timestamp: a.timestamp,
      })),
      rejections: approval.rejections.map((r) => ({
        approver: r.approver,
        reason: r.reason,
        timestamp: r.timestamp,
      })),
      expiresAt: approval.expiresAt,
    });
  } catch (error) {
    logger.error("Get approval error", error as Error);
    return internalError("Failed to get approval status");
  }
}

/**
 * POST /api/deployments/[id]/approve - Approve or reject a deployment
 * Body: { action: 'approve' | 'reject', reason?: string }
 *
 * SECURITY: The approver email is taken from the authenticated session, not from the request body.
 * This prevents users from approving deployments with someone else's email.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  // Load config first to get approvers list
  const config = await loadConfig(resolve(CONFIG_PATH));
  const approvalConfig = config.settings?.approval;
  const allowedApprovers = approvalConfig?.approvers || [];

  // Check if user is an authorized approver
  const session = await requireApproverEmail(allowedApprovers);
  if (session instanceof NextResponse) {
    logAuthFailure(undefined, `/api/deployments/${params.id}/approve`, "forbidden", {
      action: "approve_deployment",
      deploymentId: params.id,
    });
    return session;
  }

  // Apply rate limiting
  const rateLimitResult = await deploymentRateLimit(request, session.user.email ?? undefined);
  if (rateLimitResult && !rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult.reset);
  }

  // SECURITY: Use the authenticated user's email, not from request body
  const approver = session.user.email!;

  try {
    // Validate request body
    const validation = await parseAndValidate(request, approvalActionSchema);
    if (!validation.success || !validation.data) {
      return validationError(
        "Invalid request body",
        validation.errors?.map((e) => `${e.path}: ${e.message}`)
      );
    }

    const { action, reason } = validation.data;

    let approval = approvalRepo.getApprovalByDeployment(params.id);

    // Create new approval record if doesn't exist
    if (!approval) {
      const timeout = approvalConfig?.timeout || "24h";
      const timeoutMs = parseTimeout(timeout);
      const expiresAt = new Date(Date.now() + timeoutMs);

      const newApproval = approvalRepo.createApproval({
        deploymentId: params.id,
        status: "pending",
        requiredApprovals: approvalConfig?.minApprovals || 1,
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString(),
      });

      approval = {
        ...newApproval,
        approvals: [],
        rejections: [],
      };
    }

    // Check if already decided
    if (approval.status !== "pending") {
      return invalidRequest(`Deployment already ${approval.status}`);
    }

    // Check expiration
    if (new Date() > new Date(approval.expiresAt)) {
      approvalRepo.updateApprovalStatus(approval.id, "rejected");
      logApprovalAction("approval.expired", params.id);
      return invalidRequest("Approval request has expired");
    }

    // Check if this approver already voted
    if (approvalRepo.hasVoted(approval.id, approver)) {
      return invalidRequest(`${approver} has already voted on this deployment`);
    }

    // Add the vote
    approvalRepo.addVote(approval.id, approver, action, reason);

    // Get updated approval state
    const updatedApproval = approvalRepo.getApprovalByDeployment(params.id)!;

    let newStatus: "pending" | "approved" | "rejected" = "pending";

    if (action === "approve") {
      // Check if we have enough approvals
      if (updatedApproval.approvals.length >= updatedApproval.requiredApprovals) {
        newStatus = "approved";
      }
    } else {
      // Single rejection rejects the deployment
      newStatus = "rejected";
    }

    // Update approval status
    if (newStatus !== "pending") {
      approvalRepo.updateApprovalStatus(approval.id, newStatus);

      // Update deployment status
      const deploymentStatus = newStatus === "approved" ? "in_progress" : "rejected";

      // Update in database
      try {
        deploymentRepo.updateBatchStatus(params.id, deploymentStatus);
      } catch (e) {
        logger.warn("Failed to update batch status in DB", { error: e });
      }

      // Update in demo stores (if demo mode)
      if (isDemoMode()) {
        const legacyDep = demoDeployments.get(params.id);
        if (legacyDep) {
          legacyDep.status = deploymentStatus;
          legacyDep.updatedAt = new Date().toISOString();
          if (newStatus === "approved") {
            legacyDep.startedAt = new Date().toISOString();
          }
          demoDeployments.set(params.id, legacyDep);
        }

        const batch = demoBatches.get(params.id);
        if (batch) {
          batch.status = deploymentStatus;
          batch.updatedAt = new Date().toISOString();
          if (newStatus === "approved") {
            batch.startedAt = new Date().toISOString();
            // Start demo worker to auto-complete deployment
            startDemoDeployment(params.id);
          }
          demoBatches.set(params.id, batch);
        }
      }

      logApprovalAction(
        newStatus === "approved" ? "approval.approved" : "approval.rejected",
        params.id,
        approver,
        reason
      );
    }

    return NextResponse.json({
      status: newStatus,
      message:
        action === "approve"
          ? `Deployment ${newStatus === "approved" ? "approved" : "approval recorded"}`
          : "Deployment rejected",
      currentApprovals: updatedApproval.approvals.length,
      requiredApprovals: updatedApproval.requiredApprovals,
    });
  } catch (error) {
    logger.error("Approval error", error as Error);
    return internalError("Failed to process approval");
  }
}

/**
 * Parse timeout string like "24h", "30m", "7d"
 */
function parseTimeout(timeout: string): number {
  const match = timeout.match(/^(\d+)([mhd])$/);
  if (!match) {
    return 24 * 60 * 60 * 1000; // Default 24 hours
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case "m":
      return value * 60 * 1000;
    case "h":
      return value * 60 * 60 * 1000;
    case "d":
      return value * 24 * 60 * 60 * 1000;
    default:
      return 24 * 60 * 60 * 1000;
  }
}

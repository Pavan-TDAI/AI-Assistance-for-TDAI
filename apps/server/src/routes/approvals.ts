import type { Request, Response, Router } from "express";

import { ApprovalDecisionSchema } from "@personal-ai/shared";

import type { AgentDatabase } from "@personal-ai/db";

import { getAuthContext } from "../auth-context.js";
import type { ApprovalService } from "../services/approval-service.js";
import { asyncHandler } from "./async-handler.js";

export const registerApprovalRoutes = (
  router: Router,
  db: AgentDatabase,
  approvalService: ApprovalService
) => {
  router.get(
    "/api/approvals",
    asyncHandler(async (request: Request, response: Response) => {
      const { user } = getAuthContext(request);
      response.json(await db.listPendingApprovalsForProfile(user.profileId));
    })
  );

  router.post(
    "/api/approvals/:approvalId/decision",
    asyncHandler(async (request: Request, response: Response) => {
      const { user } = getAuthContext(request);
      const payload = ApprovalDecisionSchema.parse(request.body);
      const approvalId = String(request.params.approvalId ?? "");
      const approval = await db.getApproval(approvalId);
      if (!approval) {
        throw new Error("Approval not found.");
      }

      const session = await db.getSession(approval.sessionId, user.profileId);
      if (!session) {
        throw new Error("Approval not found.");
      }

      const updated = await approvalService.resolveApproval(
        approvalId,
        payload.decision,
        payload.note
      );

      response.json(updated);
    })
  );
};

import { nowIso } from "@personal-ai/shared";
import type { ApprovalCoordinator, ApprovalResolution } from "@personal-ai/agent-core";
import type { AgentDatabase } from "@personal-ai/db";

import type { AuditLogService } from "./audit-log-service.js";

export class ApprovalService implements ApprovalCoordinator {
  private readonly waiters = new Map<
    string,
    (resolution: ApprovalResolution) => void
  >();

  constructor(
    private readonly db: AgentDatabase,
    private readonly audit: AuditLogService
  ) {}

  async requestApproval({
    approval
  }: Parameters<ApprovalCoordinator["requestApproval"]>[0]): Promise<ApprovalResolution> {
    return new Promise((resolve) => {
      this.waiters.set(approval.id, resolve);
    });
  }

  async resolveApproval(
    approvalId: string,
    decision: "approved" | "denied",
    note?: string
  ) {
    const updated = await this.db.updateApproval(approvalId, {
      status: decision,
      note,
      decidedAt: nowIso()
    });

    if (!updated) {
      throw new Error(`Approval ${approvalId} was not found.`);
    }

    await this.audit.log({
      action: "approval_resolved",
      message: `Approval ${decision}: ${updated.toolName}`,
      sessionId: updated.sessionId,
      conversationId: updated.conversationId,
      runId: updated.runId,
      entityType: "approval",
      entityId: updated.id,
      payload: {
        decision,
        note
      }
    });

    const waiter = this.waiters.get(approvalId);
    if (waiter) {
      waiter({
        approved: decision === "approved",
        approval: updated
      });
      this.waiters.delete(approvalId);
    }

    return updated;
  }
}

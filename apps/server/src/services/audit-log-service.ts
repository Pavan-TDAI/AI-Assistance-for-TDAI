import type { AgentDatabase } from "@personal-ai/db";
import type { AuditLoggerLike, LoggerLike } from "@personal-ai/tool-registry";

export class AuditLogService implements AuditLoggerLike {
  constructor(
    private readonly db: AgentDatabase,
    private readonly logger: LoggerLike
  ) {}

  async log(input: Parameters<AuditLoggerLike["log"]>[0]) {
    await this.db.createAuditLog({
      action: input.action,
      message: input.message,
      sessionId: input.sessionId,
      conversationId: input.conversationId,
      runId: input.runId,
      entityType: input.entityType,
      entityId: input.entityId,
      payload: input.payload
    });

    this.logger.info(input.message, {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId
    });
  }
}

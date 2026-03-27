import type { AgentDatabase } from "@personal-ai/db";
import type {
  ChatSession,
  SessionBundle,
  SessionWithPreview
} from "@personal-ai/shared";
import type { AuditLogService } from "./audit-log-service.js";

export class SessionService {
  constructor(
    private readonly db: AgentDatabase,
    private readonly audit: AuditLogService
  ) {}

  async resolveSession(input: {
    sessionId?: string;
    profileId: string;
    initialPrompt: string;
  }) {
    if (input.sessionId) {
      const session = await this.db.getSession(input.sessionId, input.profileId);
      const conversation = await this.db.getConversationBySessionId(input.sessionId);

      if (!session || !conversation) {
        throw new Error("The requested session could not be found.");
      }

      return { session, conversation };
    }

    return this.db.createSession({
      profileId: input.profileId,
      titleFromContent: input.initialPrompt
    });
  }

  listSessions(options?: {
    includeArchived?: boolean;
    archivedOnly?: boolean;
    profileId?: string;
  }): Promise<SessionWithPreview[]> {
    return this.db.listSessionsWithPreview({
      includeArchived: options?.includeArchived,
      archivedOnly: options?.archivedOnly,
      profileId: options?.profileId
    });
  }

  async getSessionBundle(sessionId: string, profileId?: string): Promise<SessionBundle> {
    const [session, conversation, messages, toolCalls, approvals, runs] = await Promise.all([
      this.db.getSession(sessionId, profileId),
      this.db.getConversationBySessionId(sessionId),
      this.db
        .getConversationBySessionId(sessionId)
        .then((record) => (record ? this.db.listMessages(record.id) : [])),
      this.db.listToolCallsBySession(sessionId),
      this.db.listApprovalsBySession(sessionId),
      this.db.listRunsBySession(sessionId)
    ]);

    if (!session || !conversation) {
      throw new Error("Session not found.");
    }

    return {
      session,
      conversation,
      messages,
      toolCalls,
      approvals,
      runs
    };
  }

  async archiveSession(sessionId: string, profileId?: string): Promise<ChatSession> {
    if (profileId) {
      await this.requireOwnedSession(sessionId, profileId);
    }

    const session = await this.db.archiveSession(sessionId);
    if (!session) {
      throw new Error("Session not found.");
    }

    await this.audit.log({
      action: "session_archived",
      message: `Session archived: ${session.title}`,
      sessionId,
      entityType: "session",
      entityId: sessionId,
      payload: {
        archived: true
      }
    });

    return session;
  }

  async restoreSession(sessionId: string, profileId?: string): Promise<ChatSession> {
    if (profileId) {
      await this.requireOwnedSession(sessionId, profileId);
    }

    const session = await this.db.restoreSession(sessionId);
    if (!session) {
      throw new Error("Session not found.");
    }

    await this.audit.log({
      action: "session_restored",
      message: `Session restored: ${session.title}`,
      sessionId,
      entityType: "session",
      entityId: sessionId,
      payload: {
        archived: false
      }
    });

    return session;
  }

  async deleteSession(sessionId: string, profileId?: string): Promise<void> {
    const session = await this.db.getSession(sessionId, profileId);
    if (!session) {
      throw new Error("Session not found.");
    }

    await this.db.deleteSessionCascade(sessionId);
    await this.audit.log({
      action: "session_deleted",
      message: `Session deleted: ${session.title}`,
      sessionId,
      entityType: "session",
      entityId: sessionId,
      payload: {
        deleted: true
      }
    });
  }

  async requireOwnedSession(sessionId: string, profileId: string): Promise<ChatSession> {
    const session = await this.db.getSession(sessionId, profileId);
    if (!session) {
      throw new Error("Session not found.");
    }

    return session;
  }
}

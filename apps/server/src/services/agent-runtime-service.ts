import {
  createId,
  PromptRequestSchema,
  type PromptRequest,
  type PromptResponse
} from "@personal-ai/shared";
import type { AgentExecutionEngine } from "@personal-ai/agent-core";
import type { AgentDatabase } from "@personal-ai/db";
import type { BrowserSessionManager } from "@personal-ai/local-tools";
import type { LoggerLike } from "@personal-ai/tool-registry";

import type { AuditLogService } from "./audit-log-service.js";
import type { SessionService } from "./session-service.js";
import type { SettingsService } from "./settings-service.js";

interface MailConnectorLike {
  searchMessages(query: string, limit?: number): Promise<Record<string, unknown>>;
  createDraft(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  sendMessage(input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

interface CalendarConnectorLike {
  listEvents(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  createEvent(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  updateEvent(input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

interface DriveConnectorLike {
  searchFiles(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  getFileMetadata(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  downloadFile(input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export class AgentRuntimeService {
  constructor(
    private readonly db: AgentDatabase,
    private readonly sessionService: SessionService,
    private readonly settingsService: SettingsService,
    private readonly engine: AgentExecutionEngine,
    private readonly audit: AuditLogService,
    private readonly logger: LoggerLike,
    private readonly browser: BrowserSessionManager,
    private readonly gmail: MailConnectorLike,
    private readonly calendar: CalendarConnectorLike,
    private readonly drive: DriveConnectorLike,
    private readonly workingDirectory: string
  ) {}

  async sendPrompt(payload: PromptRequest): Promise<PromptResponse> {
    const request = PromptRequestSchema.parse(payload);
    const settings = await this.settingsService.getSettings();
    const profileId = request.profileId ?? "profile_local";
    const { session, conversation } = await this.sessionService.resolveSession({
      sessionId: request.sessionId,
      profileId,
      initialPrompt: request.content
    });

    const runId = createId("run");

    await this.db.createMessage({
      sessionId: session.id,
      conversationId: conversation.id,
      runId,
      role: "user",
      content: request.content
    });

    await this.audit.log({
      action: "prompt_received",
      message: "Prompt received.",
      sessionId: session.id,
      conversationId: conversation.id,
      runId,
      entityType: "run",
      entityId: runId,
      payload: {
        provider: settings.provider
      }
    });

    if (!request.sessionId) {
      await this.audit.log({
        action: "session_created",
        message: "Chat session created.",
        sessionId: session.id,
        conversationId: conversation.id,
        runId,
        entityType: "session",
        entityId: session.id,
        payload: {
          title: session.title
        }
      });
    }

    void this.engine
      .run({
        runId,
        sessionId: session.id,
        conversationId: conversation.id,
        profileId,
        userPrompt: request.content,
        selectedMeetingId: request.selectedMeetingId,
        settings,
        services: {
          db: this.db,
          audit: this.audit,
          logger: this.logger,
          browser: this.browser,
          gmail: this.gmail,
          calendar: this.calendar,
          drive: this.drive,
          settings,
          workingDirectory: this.workingDirectory
        }
      })
      .catch((error) => {
        this.logger.error("Agent run crashed unexpectedly.", {
          runId,
          error: error instanceof Error ? error.message : String(error)
        });
      });

    return {
      runId,
      sessionId: session.id,
      conversationId: conversation.id
    };
  }
}

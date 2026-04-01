import type { AgentDatabase } from "@personal-ai/db";
import type {
  AuditAction,
  PermissionCategory,
  SettingsRecord,
  ToolCallRecord
} from "@personal-ai/shared";
import type { z } from "zod";

export interface LoggerLike {
  info(message: string, payload?: Record<string, unknown>): void;
  warn(message: string, payload?: Record<string, unknown>): void;
  error(message: string, payload?: Record<string, unknown>): void;
}

export interface AuditLoggerLike {
  log(input: {
    action: AuditAction;
    message: string;
    sessionId?: string;
    conversationId?: string;
    runId?: string;
    entityType: string;
    entityId?: string;
    payload?: Record<string, unknown>;
  }): Promise<void>;
}

export interface BrowserManagerLike {
  navigate(url: string): Promise<{ title: string; url: string }>;
  click(selector: string): Promise<{ selector: string }>;
  type(selector: string, text: string, submit?: boolean): Promise<{ selector: string }>;
  extractText(selector?: string): Promise<{ text: string; selector: string }>;
}

export interface GmailConnectorLike {
  searchMessages(query: string, limit?: number): Promise<Record<string, unknown>>;
  getMessage(messageId: string): Promise<Record<string, unknown>>;
  createDraft(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  sendMessage(input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface CalendarConnectorLike {
  listEvents(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  createEvent(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  updateEvent(input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface DriveConnectorLike {
  searchFiles(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  getFileMetadata(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  downloadFile(input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface ToolRuntimeServices {
  db: AgentDatabase;
  logger: LoggerLike;
  audit: AuditLoggerLike;
  browser: BrowserManagerLike;
  gmail: GmailConnectorLike;
  calendar: CalendarConnectorLike;
  drive: DriveConnectorLike;
  settings: SettingsRecord;
  workingDirectory: string;
}

export interface ToolExecutionContext {
  services: ToolRuntimeServices;
  sessionId: string;
  conversationId: string;
  runId: string;
  toolCallId?: string;
}

export interface ToolResult {
  summary: string;
  output: Record<string, unknown>;
}

export interface ModelToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolDefinition<TSchema extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  permissionCategory: PermissionCategory;
  safeByDefault?: boolean;
  timeoutMs?: number;
  schema: TSchema;
  summariseInput?: (input: z.infer<TSchema>) => string;
  handler: (
    input: z.infer<TSchema>,
    context: ToolExecutionContext
  ) => Promise<ToolResult>;
}

export interface ToolExecutionOutcome {
  tool: ToolDefinition;
  input: Record<string, unknown>;
  result: ToolResult;
}

export interface ToolCatalogEntry {
  name: string;
  description: string;
  permissionCategory: PermissionCategory;
  safeByDefault: boolean;
  timeoutMs: number;
}

export interface PendingToolCall {
  toolCall: ToolCallRecord;
  inputSummary: string;
}

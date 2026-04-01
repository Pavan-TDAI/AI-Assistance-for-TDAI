import { z } from "zod";

export const providerValues = ["mock", "openai", "gemini", "ollama"] as const;
export type ModelProviderName = (typeof providerValues)[number];

export const providerSelectionModeValues = ["auto", "manual"] as const;
export type ProviderSelectionMode = (typeof providerSelectionModeValues)[number];

export const routingPolicyValues = ["hosted", "local", "fallback"] as const;
export type RoutingPolicy = (typeof routingPolicyValues)[number];

export const messageRoleValues = ["system", "user", "assistant", "tool"] as const;
export type MessageRole = (typeof messageRoleValues)[number];

export const permissionCategoryValues = [
  "filesystem_list",
  "filesystem_read",
  "filesystem_write",
  "filesystem_delete",
  "shell_execute",
  "browser_automation",
  "system_app",
  "gmail",
  "calendar",
  "drive",
  "external_api"
] as const;
export type PermissionCategory = (typeof permissionCategoryValues)[number];

export const approvalStatusValues = ["pending", "approved", "denied"] as const;
export type ApprovalStatus = (typeof approvalStatusValues)[number];

export const toolExecutionStatusValues = [
  "pending_approval",
  "approved",
  "running",
  "success",
  "failed",
  "denied"
] as const;
export type ToolExecutionStatus = (typeof toolExecutionStatusValues)[number];

export const runStatusValues = [
  "queued",
  "running",
  "waiting_approval",
  "completed",
  "failed",
  "cancelled"
] as const;
export type RunStatus = (typeof runStatusValues)[number];

export const taskStatusValues = [
  "open",
  "in_progress",
  "blocked",
  "completed",
  "cancelled"
] as const;
export type TaskStatus = (typeof taskStatusValues)[number];

export const connectorStatusValues = [
  "connected",
  "not_configured",
  "available",
  "unavailable",
  "error"
] as const;
export type ConnectorStatusValue = (typeof connectorStatusValues)[number];

export const connectorAuthTypeValues = [
  "oauth",
  "api_key",
  "local_runtime",
  "browser_session"
] as const;
export type ConnectorAuthType = (typeof connectorAuthTypeValues)[number];

export const meetingSourceValues = [
  "transcript_upload",
  "notes_paste",
  "calendar_enriched"
] as const;
export type MeetingSource = (typeof meetingSourceValues)[number];

export const meetingStatusValues = ["draft", "generated", "emailed"] as const;
export type MeetingStatus = (typeof meetingStatusValues)[number];

export const updateMailTypeValues = ["morning", "evening", "night", "unknown"] as const;
export type UpdateMailType = (typeof updateMailTypeValues)[number];

export const blockerStatusValues = ["open", "resolved", "carried_forward"] as const;
export type BlockerStatus = (typeof blockerStatusValues)[number];

export const reportTableKindValues = [
  "daily_updates",
  "pending_blockers",
  "resolved_blockers",
  "employee_summary",
  "weekly_business_report",
  "completed_vs_pending",
  "team_weekly_summary"
] as const;
export type ReportTableKind = (typeof reportTableKindValues)[number];

export const exportFormatValues = ["csv", "excel", "pdf"] as const;
export type ExportFormat = (typeof exportFormatValues)[number];

export const reportSyncModeValues = ["auto", "stored_only", "force_sync"] as const;
export type ReportSyncMode = (typeof reportSyncModeValues)[number];

export const userRoleValues = ["employee", "manager", "admin"] as const;
export type UserRole = (typeof userRoleValues)[number];

export const workflowArtifactKindValues = ["campaign", "proposal", "solution"] as const;
export type WorkflowArtifactKind = (typeof workflowArtifactKindValues)[number];

export const workflowArtifactStatusValues = [
  "draft",
  "ready",
  "approved",
  "sent"
] as const;
export type WorkflowArtifactStatus = (typeof workflowArtifactStatusValues)[number];

export const auditActionValues = [
  "prompt_received",
  "session_created",
  "session_deleted",
  "session_archived",
  "session_restored",
  "message_created",
  "tool_requested",
  "tool_started",
  "tool_succeeded",
  "tool_failed",
  "approval_requested",
  "approval_resolved",
  "settings_updated",
  "provider_called",
  "meeting_created",
  "meeting_generated",
  "meeting_emailed",
  "update_email_processed",
  "blocker_updated",
  "weekly_report_generated",
  "report_exported",
  "attachment_uploaded",
  "artifact_generated",
  "artifact_emailed",
  "connector_updated",
  "error"
] as const;
export type AuditAction = (typeof auditActionValues)[number];

export const TimestampedRecordSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const LocalProfileSchema = TimestampedRecordSchema.extend({
  displayName: z.string(),
  email: z.string().email().optional(),
  timezone: z.string().default("UTC")
});
export type LocalProfile = z.infer<typeof LocalProfileSchema>;

export const LocalAccountSchema = TimestampedRecordSchema.extend({
  profileId: z.string(),
  displayName: z.string(),
  email: z.string().email(),
  role: z.enum(userRoleValues).default("employee"),
  passwordHash: z.string(),
  passwordSalt: z.string(),
  lastLoginAt: z.string().optional()
});
export type LocalAccount = z.infer<typeof LocalAccountSchema>;

export const AuthSessionSchema = TimestampedRecordSchema.extend({
  accountId: z.string(),
  profileId: z.string(),
  tokenHash: z.string(),
  expiresAt: z.string(),
  lastSeenAt: z.string()
});
export type AuthSessionRecord = z.infer<typeof AuthSessionSchema>;

export const AuthUserSchema = TimestampedRecordSchema.extend({
  profileId: z.string(),
  displayName: z.string(),
  email: z.string().email(),
  role: z.enum(userRoleValues).default("employee")
});
export type AuthUser = z.infer<typeof AuthUserSchema>;

export const ChatSessionSchema = TimestampedRecordSchema.extend({
  profileId: z.string(),
  title: z.string(),
  lastMessageAt: z.string(),
  archived: z.boolean().default(false)
});
export type ChatSession = z.infer<typeof ChatSessionSchema>;

export const ConversationSchema = TimestampedRecordSchema.extend({
  sessionId: z.string(),
  title: z.string()
});
export type ConversationRecord = z.infer<typeof ConversationSchema>;

export const MessageAttachmentSchema = z.object({
  id: z.string(),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  extension: z.string().min(1),
  sizeBytes: z.number().int().min(0),
  storagePath: z.string().min(1),
  extractedTextPreview: z.string().optional(),
  uploadedAt: z.string().optional()
});
export type MessageAttachment = z.infer<typeof MessageAttachmentSchema>;

export const MessageSchema = TimestampedRecordSchema.extend({
  sessionId: z.string(),
  conversationId: z.string(),
  runId: z.string().optional(),
  role: z.enum(messageRoleValues),
  content: z.string(),
  toolName: z.string().optional(),
  toolCallId: z.string().optional(),
  attachments: z.array(MessageAttachmentSchema).default([]),
  metadata: z.record(z.unknown()).optional()
});
export type MessageRecord = z.infer<typeof MessageSchema>;

export const ToolCallSchema = TimestampedRecordSchema.extend({
  sessionId: z.string(),
  conversationId: z.string(),
  runId: z.string(),
  toolName: z.string(),
  permissionCategory: z.enum(permissionCategoryValues),
  status: z.enum(toolExecutionStatusValues),
  input: z.record(z.unknown()),
  result: z.record(z.unknown()).optional(),
  error: z.string().optional(),
  summary: z.string().optional(),
  approvalId: z.string().optional(),
  provider: z.enum(providerValues).optional()
});
export type ToolCallRecord = z.infer<typeof ToolCallSchema>;

export const RunUsageSchema = z.object({
  promptTokens: z.number().int().min(0).default(0),
  completionTokens: z.number().int().min(0).default(0),
  totalTokens: z.number().int().min(0).default(0),
  promptChars: z.number().int().min(0).default(0),
  completionChars: z.number().int().min(0).default(0),
  estimatedCostUsd: z.number().min(0).default(0)
});
export type RunUsage = z.infer<typeof RunUsageSchema>;

export const RunRecordSchema = TimestampedRecordSchema.extend({
  sessionId: z.string(),
  conversationId: z.string(),
  status: z.enum(runStatusValues),
  provider: z.enum(providerValues),
  model: z.string(),
  userPrompt: z.string(),
  plan: z.string().optional(),
  summary: z.string().optional(),
  error: z.string().optional(),
  usage: RunUsageSchema.optional(),
  routingPolicy: z.enum(routingPolicyValues).optional(),
  fallbackProvider: z.enum(providerValues).optional()
});
export type RunRecord = z.infer<typeof RunRecordSchema>;

export const ApprovalSchema = TimestampedRecordSchema.extend({
  sessionId: z.string(),
  conversationId: z.string(),
  runId: z.string(),
  toolCallId: z.string(),
  toolName: z.string(),
  permissionCategory: z.enum(permissionCategoryValues),
  status: z.enum(approvalStatusValues),
  reason: z.string(),
  inputSummary: z.string(),
  note: z.string().optional(),
  decidedAt: z.string().optional()
});
export type ApprovalRecord = z.infer<typeof ApprovalSchema>;

export const TaskSchema = TimestampedRecordSchema.extend({
  sessionId: z.string().optional(),
  sourceMessageId: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  status: z.enum(taskStatusValues),
  outcome: z.string().optional()
});
export type TaskRecord = z.infer<typeof TaskSchema>;

export const MeetingActionItemSchema = z.object({
  title: z.string().min(1),
  owner: z.string().optional(),
  dueDate: z.string().optional(),
  status: z.enum(taskStatusValues).default("open")
});
export type MeetingActionItem = z.infer<typeof MeetingActionItemSchema>;

export const MeetingMomAssignmentSchema = z.object({
  owner: z.string().min(1),
  tasks: z.array(z.string().min(1)).default([])
});
export type MeetingMomAssignment = z.infer<typeof MeetingMomAssignmentSchema>;

export const MeetingStructuredMomSchema = z.object({
  dateLabel: z.string().min(1),
  headline: z.string().min(1).default("Today's tasks"),
  assignments: z.array(MeetingMomAssignmentSchema).default([])
});
export type MeetingStructuredMom = z.infer<typeof MeetingStructuredMomSchema>;

export const MeetingEmailDraftSchema = z.object({
  to: z.array(z.string().email()).default([]),
  subject: z.string().min(1),
  body: z.string().min(1),
  gmailDraftId: z.string().optional(),
  sentAt: z.string().optional()
});
export type MeetingEmailDraft = z.infer<typeof MeetingEmailDraftSchema>;

export const MeetingSchema = TimestampedRecordSchema.extend({
  sessionId: z.string().optional(),
  title: z.string(),
  source: z.enum(meetingSourceValues),
  status: z.enum(meetingStatusValues).default("draft"),
  transcript: z.string(),
  notes: z.string().optional(),
  attendees: z.array(z.string().email()).default([]),
  calendarEventId: z.string().optional(),
  summary: z.string().optional(),
  decisions: z.array(z.string()).default([]),
  actionItems: z.array(MeetingActionItemSchema).default([]),
  structuredMom: MeetingStructuredMomSchema.optional(),
  followUpEmail: MeetingEmailDraftSchema.optional(),
  generatedAt: z.string().optional()
});
export type MeetingRecord = z.infer<typeof MeetingSchema>;

export const DailyUpdateSchema = TimestampedRecordSchema.extend({
  employeeName: z.string().min(1),
  emailDate: z.string().min(1),
  completedTasks: z.array(z.string().min(1)).default([]),
  blockers: z.array(z.string().min(1)).default([]),
  nextTasks: z.array(z.string().min(1)).default([]),
  plannedTasks: z.array(z.string().min(1)).default([]),
  pendingTasks: z.array(z.string().min(1)).default([]),
  sourceEmailId: z.string().min(1),
  sourceThreadId: z.string().optional(),
  emailSubject: z.string().optional(),
  fromEmail: z.string().optional(),
  mailType: z.enum(updateMailTypeValues).default("unknown"),
  rawEmailBody: z.string().min(1)
});
export type DailyUpdateRecord = z.infer<typeof DailyUpdateSchema>;

export const BlockerTrackingSchema = TimestampedRecordSchema.extend({
  employeeName: z.string().min(1),
  blockerText: z.string().min(1),
  normalizedBlockerKey: z.string().min(1),
  firstSeenDate: z.string().min(1),
  lastSeenDate: z.string().min(1),
  status: z.enum(blockerStatusValues).default("open"),
  resolvedDate: z.string().optional(),
  resolutionNotes: z.string().optional(),
  relatedTaskReference: z.string().optional(),
  relatedDailyUpdateIds: z.array(z.string().min(1)).default([])
});
export type BlockerTrackingRecord = z.infer<typeof BlockerTrackingSchema>;

export const WeeklyReportSchema = TimestampedRecordSchema.extend({
  employeeName: z.string().min(1),
  weekStartDate: z.string().min(1),
  weekEndDate: z.string().min(1),
  lastWeekCompletedTasks: z.array(z.string().min(1)).default([]),
  openBlockers: z.array(z.string().min(1)).default([]),
  resolvedBlockers: z.array(z.string().min(1)).default([]),
  nextWeekPlan: z.array(z.string().min(1)).default([]),
  blockerResolutionSummary: z.array(z.string().min(1)).default([]),
  generatedAt: z.string().min(1)
});
export type WeeklyReportRecord = z.infer<typeof WeeklyReportSchema>;

export const WorkflowArtifactSectionSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1)
});
export type WorkflowArtifactSection = z.infer<typeof WorkflowArtifactSectionSchema>;

export const WorkflowArtifactSchema = TimestampedRecordSchema.extend({
  profileId: z.string().min(1),
  sessionId: z.string().optional(),
  sourceMessageId: z.string().optional(),
  kind: z.enum(workflowArtifactKindValues),
  status: z.enum(workflowArtifactStatusValues).default("draft"),
  title: z.string().min(1),
  prompt: z.string().min(1),
  summary: z.string().optional(),
  sourceReferences: z.array(z.string().min(1)).default([]),
  sections: z.array(WorkflowArtifactSectionSchema).default([]),
  generatedContent: z.record(z.unknown()).default({}),
  approvalIds: z.array(z.string().min(1)).default([]),
  sentAt: z.string().optional(),
  exportedAt: z.string().optional()
});
export type WorkflowArtifactRecord = z.infer<typeof WorkflowArtifactSchema>;

export const MemorySchema = TimestampedRecordSchema.extend({
  profileId: z.string(),
  sessionId: z.string().optional(),
  kind: z.enum(["fact", "preference", "summary", "task"]),
  content: z.string(),
  confidence: z.number().min(0).max(1).default(0.5),
  source: z.string().optional()
});
export type MemoryRecord = z.infer<typeof MemorySchema>;

export const SettingsApprovalDefaultsSchema = z.object({
  filesystemList: z.boolean().default(true),
  filesystemRead: z.boolean().default(false),
  filesystemWrite: z.boolean().default(false),
  filesystemDelete: z.boolean().default(false),
  shellExecute: z.boolean().default(false),
  browserAutomation: z.boolean().default(false),
  systemApp: z.boolean().default(false),
  gmail: z.boolean().default(false),
  calendar: z.boolean().default(false),
  drive: z.boolean().default(false),
  externalApi: z.boolean().default(false)
});
export type SettingsApprovalDefaults = z.infer<typeof SettingsApprovalDefaultsSchema>;

export const ToolPreferencesSchema = z.object({
  safeRoots: z.array(z.string()).default([]),
  safeShellCommands: z.array(z.string()).default([]),
  blockedShellPatterns: z.array(z.string()).default([]),
  alwaysAllowDomains: z.array(z.string()).default([]),
  headlessBrowser: z.boolean().default(false),
  maxShellOutputChars: z.number().int().min(500).max(50000).default(8000)
});
export type ToolPreferences = z.infer<typeof ToolPreferencesSchema>;

export const UsageControlsSchema = z.object({
  contextMessageWindow: z.number().int().min(6).max(40).default(14),
  summaryTriggerMessages: z.number().int().min(8).max(80).default(22),
  maxPromptChars: z.number().int().min(2000).max(120000).default(28000),
  warningCostUsd: z.number().min(0).max(100).default(0.1),
  hardLimitCostUsd: z.number().min(0).max(250).default(0.6)
});
export type UsageControls = z.infer<typeof UsageControlsSchema>;

export const SettingsSchema = TimestampedRecordSchema.extend({
  profileName: z.string(),
  mongoUri: z.string(),
  provider: z.enum(providerValues),
  providerSelectionMode: z.enum(providerSelectionModeValues).default("auto"),
  routingPolicy: z.enum(routingPolicyValues).default("fallback"),
  activeModel: z.string(),
  openAiModel: z.string(),
  geminiModel: z.string(),
  ollamaModel: z.string(),
  maxToolSteps: z.number().int().min(1).max(20).default(6),
  approvalDefaults: SettingsApprovalDefaultsSchema,
  toolPreferences: ToolPreferencesSchema,
  usageControls: UsageControlsSchema
});
export type SettingsRecord = z.infer<typeof SettingsSchema>;

export const RegisterRequestSchema = z.object({
  displayName: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(160),
  role: z.enum(userRoleValues).default("employee")
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(160),
  role: z.enum(userRoleValues).optional()
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const AuthResponseSchema = z.object({
  accessToken: z.string(),
  user: AuthUserSchema
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

export const ConnectorStatusSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: z.enum(connectorStatusValues),
  authType: z.enum(connectorAuthTypeValues),
  source: z.enum(["env", "vault", "local", "none"]).default("none"),
  detail: z.string().optional(),
  capabilities: z.array(z.string()).default([]),
  lastCheckedAt: z.string().optional()
});
export type ConnectorStatusRecord = z.infer<typeof ConnectorStatusSchema>;

export const GoogleWorkspaceConnectorSecretSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  redirectUri: z.string().min(1),
  refreshToken: z.string().min(1)
});
export type GoogleWorkspaceConnectorSecret = z.infer<
  typeof GoogleWorkspaceConnectorSecretSchema
>;

export const Microsoft365ConnectorSecretSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  tenantId: z.string().min(1).default("organizations"),
  redirectUri: z.string().min(1),
  refreshToken: z.string().min(1)
});
export type Microsoft365ConnectorSecret = z.infer<
  typeof Microsoft365ConnectorSecretSchema
>;

export const AuditLogSchema = TimestampedRecordSchema.extend({
  sessionId: z.string().optional(),
  conversationId: z.string().optional(),
  runId: z.string().optional(),
  entityType: z.string(),
  entityId: z.string().optional(),
  action: z.enum(auditActionValues),
  message: z.string(),
  payload: z.record(z.unknown()).optional()
});
export type AuditLogRecord = z.infer<typeof AuditLogSchema>;

export const PromptRequestSchema = z.object({
  sessionId: z.string().optional(),
  conversationId: z.string().optional(),
  content: z.string().max(12000).default(""),
  profileId: z.string().optional(),
  selectedMeetingId: z.string().optional(),
  attachments: z.array(MessageAttachmentSchema).default([])
}).superRefine((value, context) => {
  if (!value.content.trim() && !value.attachments.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide a prompt or at least one attachment."
    });
  }
});
export type PromptRequest = z.infer<typeof PromptRequestSchema>;

export const PromptResponseSchema = z.object({
  runId: z.string(),
  sessionId: z.string(),
  conversationId: z.string()
});
export type PromptResponse = z.infer<typeof PromptResponseSchema>;

export const ApprovalDecisionSchema = z.object({
  decision: z.enum(["approved", "denied"]),
  note: z.string().max(1000).optional()
});
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;

export const SettingsUpdateSchema = z.object({
  profileName: z.string().min(1).optional(),
  provider: z.enum(providerValues).optional(),
  providerSelectionMode: z.enum(providerSelectionModeValues).optional(),
  routingPolicy: z.enum(routingPolicyValues).optional(),
  activeModel: z.string().min(1).optional(),
  openAiModel: z.string().min(1).optional(),
  geminiModel: z.string().min(1).optional(),
  ollamaModel: z.string().min(1).optional(),
  mongoUri: z.string().min(1).optional(),
  maxToolSteps: z.number().int().min(1).max(20).optional(),
  approvalDefaults: SettingsApprovalDefaultsSchema.partial().optional(),
  toolPreferences: ToolPreferencesSchema.partial().optional(),
  usageControls: UsageControlsSchema.partial().optional()
});
export type SettingsUpdate = z.infer<typeof SettingsUpdateSchema>;

export const CreateMeetingRequestSchema = z
  .object({
    title: z.string().min(1).max(160),
    source: z.enum(meetingSourceValues).default("notes_paste"),
    transcript: z.string().optional(),
    notes: z.string().optional(),
    attendees: z.array(z.string().email()).default([]),
    calendarEventId: z.string().optional(),
    sessionId: z.string().optional()
  })
  .superRefine((value, context) => {
    if (!value.transcript?.trim() && !value.notes?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide a transcript or meeting notes."
      });
    }
  });
export type CreateMeetingRequest = z.infer<typeof CreateMeetingRequestSchema>;

export const GenerateMeetingMomRequestSchema = z.object({
  includeEmailDraft: z.boolean().default(true)
});
export type GenerateMeetingMomRequest = z.infer<typeof GenerateMeetingMomRequestSchema>;

export const DraftMeetingEmailRequestSchema = z.object({
  to: z.array(z.string().email()).optional()
});
export type DraftMeetingEmailRequest = z.infer<typeof DraftMeetingEmailRequestSchema>;

export const SendMeetingEmailRequestSchema = z.object({
  to: z.array(z.string().email()).optional()
});
export type SendMeetingEmailRequest = z.infer<typeof SendMeetingEmailRequestSchema>;

export const ListMeetingsToolRequestSchema = z.object({
  limit: z.number().int().min(1).max(10).default(5)
});
export type ListMeetingsToolRequest = z.infer<typeof ListMeetingsToolRequestSchema>;

export const MeetingToolActionRequestSchema = z.object({
  meetingId: z.string().optional(),
  to: z.array(z.string().email()).optional(),
  includeEmailDraft: z.boolean().default(true)
});
export type MeetingToolActionRequest = z.infer<typeof MeetingToolActionRequestSchema>;

export const IngestUpdateEmailRequestSchema = z.object({
  sourceEmailId: z.string().min(1).optional(),
  sourceThreadId: z.string().optional(),
  subject: z.string().optional(),
  fromEmail: z.string().optional(),
  emailDate: z.string().optional(),
  rawEmailBody: z.string().min(1),
  forceReprocess: z.boolean().default(false)
});
export type IngestUpdateEmailRequest = z.infer<typeof IngestUpdateEmailRequestSchema>;

export const SyncUpdateEmailsRequestSchema = z.object({
  query: z
    .string()
    .min(1)
    .default("daily update OR EOD OR highlights OR challenges OR next steps"),
  limit: z.number().int().min(1).max(25).default(10),
  forceReprocess: z.boolean().default(false)
});
export type SyncUpdateEmailsRequest = z.infer<typeof SyncUpdateEmailsRequestSchema>;

export const UpdateEmailExtractionSchema = z.object({
  employeeName: z.string().min(1),
  plannedTasks: z.array(z.string().min(1)).default([]),
  completedTasks: z.array(z.string().min(1)).default([]),
  blockers: z.array(z.string().min(1)).default([]),
  nextTasks: z.array(z.string().min(1)).default([]),
  mailType: z.enum(updateMailTypeValues).default("unknown")
});
export type UpdateEmailExtraction = z.infer<typeof UpdateEmailExtractionSchema>;

export const DailyUpdateComparisonSchema = z.object({
  employeeName: z.string().min(1),
  emailDate: z.string().min(1),
  plannedTasks: z.array(z.string().min(1)).default([]),
  completedTasks: z.array(z.string().min(1)).default([]),
  pendingTasks: z.array(z.string().min(1)).default([]),
  blockers: z.array(z.string().min(1)).default([]),
  statusSummary: z.string()
});
export type DailyUpdateComparison = z.infer<typeof DailyUpdateComparisonSchema>;

export const ReportFiltersSchema = z.object({
  employeeName: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  weekStartDate: z.string().optional(),
  blockerStatus: z.enum(blockerStatusValues).optional(),
  search: z.string().optional()
});
export type ReportFilters = z.infer<typeof ReportFiltersSchema>;

export const ReportTableColumnSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  sortable: z.boolean().default(true)
});
export type ReportTableColumn = z.infer<typeof ReportTableColumnSchema>;

export const ReportTableSchema = z.object({
  kind: z.enum(reportTableKindValues),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  columns: z.array(ReportTableColumnSchema).default([]),
  rows: z.array(z.record(z.unknown())).default([]),
  appliedFilters: z.record(z.string()).default({}),
  generatedAt: z.string().min(1),
  emptyMessage: z.string().optional()
});
export type ReportTable = z.infer<typeof ReportTableSchema>;

export const ReportQueryRequestSchema = z.object({
  query: z.string().min(1),
  syncMode: z.enum(reportSyncModeValues).default("auto")
});
export type ReportQueryRequest = z.infer<typeof ReportQueryRequestSchema>;

export const ExportTableRequestSchema = z.object({
  title: z.string().min(1),
  format: z.enum(exportFormatValues),
  columns: z.array(ReportTableColumnSchema).min(1),
  rows: z.array(z.record(z.unknown())).default([]),
  appliedFilters: z.record(z.string()).default({}),
  fileName: z.string().optional()
});
export type ExportTableRequest = z.infer<typeof ExportTableRequestSchema>;

export const ListWorkflowArtifactsRequestSchema = z.object({
  kind: z.enum(workflowArtifactKindValues).optional(),
  limit: z.number().int().min(1).max(20).default(8)
});
export type ListWorkflowArtifactsRequest = z.infer<typeof ListWorkflowArtifactsRequestSchema>;

const WorkflowSourceInputSchema = z.object({
  attachmentPaths: z.array(z.string().min(1)).default([]),
  researchNotes: z.array(z.string().min(1)).default([]),
  useBrowserResearch: z.boolean().default(true)
});

export const GenerateCampaignArtifactRequestSchema = WorkflowSourceInputSchema.extend({
  brief: z.string().min(1),
  campaignTitle: z.string().optional(),
  audience: z.string().optional(),
  goals: z.array(z.string().min(1)).default([]),
  to: z.array(z.string().email()).default([])
});
export type GenerateCampaignArtifactRequest = z.infer<
  typeof GenerateCampaignArtifactRequestSchema
>;

export const GenerateProposalArtifactRequestSchema = WorkflowSourceInputSchema.extend({
  prompt: z.string().min(1),
  title: z.string().optional()
});
export type GenerateProposalArtifactRequest = z.infer<
  typeof GenerateProposalArtifactRequestSchema
>;

export const GenerateSolutionArtifactRequestSchema = WorkflowSourceInputSchema.extend({
  prompt: z.string().min(1),
  title: z.string().optional()
});
export type GenerateSolutionArtifactRequest = z.infer<
  typeof GenerateSolutionArtifactRequestSchema
>;

export const DraftArtifactEmailRequestSchema = z.object({
  artifactId: z.string().min(1),
  to: z.array(z.string().email()).default([]),
  subject: z.string().optional()
});
export type DraftArtifactEmailRequest = z.infer<typeof DraftArtifactEmailRequestSchema>;

export type RunEvent =
  | {
      type: "run_started";
      runId: string;
      sessionId: string;
      conversationId: string;
      timestamp: string;
      status: RunStatus;
      message: string;
    }
  | {
      type: "status";
      runId: string;
      sessionId: string;
      conversationId: string;
      timestamp: string;
      status: RunStatus;
      message: string;
    }
  | {
      type: "tool_pending_approval";
      runId: string;
      sessionId: string;
      conversationId: string;
      timestamp: string;
      approval: ApprovalRecord;
      toolCall: ToolCallRecord;
    }
  | {
      type: "tool_approved" | "tool_denied" | "tool_started" | "tool_result";
      runId: string;
      sessionId: string;
      conversationId: string;
      timestamp: string;
      toolCall: ToolCallRecord;
      approval?: ApprovalRecord;
      message?: MessageRecord;
    }
  | {
      type: "assistant_message";
      runId: string;
      sessionId: string;
      conversationId: string;
      timestamp: string;
      message: MessageRecord;
    }
  | {
      type: "error";
      runId: string;
      sessionId: string;
      conversationId: string;
      timestamp: string;
      error: string;
    }
  | {
      type: "completed";
      runId: string;
      sessionId: string;
      conversationId: string;
      timestamp: string;
      status: RunStatus;
      run?: RunRecord;
    };

export interface SessionWithPreview {
  session: ChatSession;
  conversation: ConversationRecord;
  latestMessage?: MessageRecord;
}

export interface SessionBundle {
  session: ChatSession;
  conversation: ConversationRecord;
  messages: MessageRecord[];
  toolCalls: ToolCallRecord[];
  approvals: ApprovalRecord[];
  runs: RunRecord[];
}

export interface HistorySnapshot {
  sessions: SessionWithPreview[];
  archivedSessions: SessionWithPreview[];
  pendingApprovals: ApprovalRecord[];
  recentToolCalls: ToolCallRecord[];
  recentRuns: RunRecord[];
  memories: MemoryRecord[];
  tasks: TaskRecord[];
  meetings: MeetingRecord[];
}

export interface HealthResponse {
  ok: boolean;
  provider: ModelProviderName;
  model: string;
  routingPolicy: RoutingPolicy;
  availableProviders: ModelProviderName[];
  mongo: {
    uri: string;
    dbName: string;
  };
}

import { MongoClient, type Db } from "mongodb";

import {
  MeetingSchema,
  RunRecordSchema,
  SettingsSchema,
  createDefaultSettings,
  createId,
  nowIso,
  titleFromPrompt,
  type ApprovalRecord,
  type AuthSessionRecord,
  type LocalAccount,
  type AuditLogRecord,
  type ChatSession,
  type ConversationRecord,
  type HistorySnapshot,
  type LocalProfile,
  type MeetingRecord,
  type MemoryRecord,
  type MessageRecord,
  type RunRecord,
  type SessionWithPreview,
  type SettingsRecord,
  type SettingsUpdate,
  type TaskRecord,
  type ToolCallRecord
} from "@personal-ai/shared";

const collections = {
  profiles: "profiles",
  accounts: "accounts",
  authSessions: "auth_sessions",
  sessions: "sessions",
  conversations: "conversations",
  messages: "messages",
  toolCalls: "tool_calls",
  approvals: "approvals",
  runs: "runs",
  meetings: "meetings",
  tasks: "tasks",
  memories: "memory",
  settings: "settings",
  auditLogs: "audit_logs"
} as const;

export interface DatabaseConnectionOptions {
  uri: string;
  dbName: string;
}

export class AgentDatabase {
  private constructor(
    private readonly client: MongoClient,
    private readonly db: Db
  ) {}

  static async connect(options: DatabaseConnectionOptions) {
    const client = new MongoClient(options.uri);
    await client.connect();

    const database = new AgentDatabase(client, client.db(options.dbName));
    await database.ensureIndexes();
    return database;
  }

  async close() {
    await this.client.close();
  }

  private profiles() {
    return this.db.collection<LocalProfile>(collections.profiles);
  }

  private accounts() {
    return this.db.collection<LocalAccount>(collections.accounts);
  }

  private authSessions() {
    return this.db.collection<AuthSessionRecord>(collections.authSessions);
  }

  private sessions() {
    return this.db.collection<ChatSession>(collections.sessions);
  }

  private conversations() {
    return this.db.collection<ConversationRecord>(collections.conversations);
  }

  private messages() {
    return this.db.collection<MessageRecord>(collections.messages);
  }

  private toolCalls() {
    return this.db.collection<ToolCallRecord>(collections.toolCalls);
  }

  private approvals() {
    return this.db.collection<ApprovalRecord>(collections.approvals);
  }

  private runs() {
    return this.db.collection<RunRecord>(collections.runs);
  }

  private meetings() {
    return this.db.collection<MeetingRecord>(collections.meetings);
  }

  private tasks() {
    return this.db.collection<TaskRecord>(collections.tasks);
  }

  private memories() {
    return this.db.collection<MemoryRecord>(collections.memories);
  }

  private settings() {
    return this.db.collection<SettingsRecord>(collections.settings);
  }

  private auditLogs() {
    return this.db.collection<AuditLogRecord>(collections.auditLogs);
  }

  async ensureIndexes() {
    await Promise.all([
      this.profiles().createIndex({ id: 1 }, { unique: true }),
      this.accounts().createIndex({ id: 1 }, { unique: true }),
      this.accounts().createIndex({ email: 1 }, { unique: true }),
      this.accounts().createIndex({ profileId: 1 }, { unique: true }),
      this.authSessions().createIndex({ id: 1 }, { unique: true }),
      this.authSessions().createIndex({ tokenHash: 1 }, { unique: true }),
      this.authSessions().createIndex({ accountId: 1, expiresAt: -1 }),
      this.sessions().createIndex({ id: 1 }, { unique: true }),
      this.sessions().createIndex({ profileId: 1, archived: 1, lastMessageAt: -1 }),
      this.conversations().createIndex({ id: 1 }, { unique: true }),
      this.conversations().createIndex({ sessionId: 1 }, { unique: true }),
      this.messages().createIndex({ id: 1 }, { unique: true }),
      this.messages().createIndex({ conversationId: 1, createdAt: 1 }),
      this.messages().createIndex({ sessionId: 1, createdAt: 1 }),
      this.toolCalls().createIndex({ id: 1 }, { unique: true }),
      this.toolCalls().createIndex({ runId: 1, createdAt: 1 }),
      this.approvals().createIndex({ id: 1 }, { unique: true }),
      this.approvals().createIndex({ status: 1, createdAt: -1 }),
      this.runs().createIndex({ id: 1 }, { unique: true }),
      this.runs().createIndex({ sessionId: 1, createdAt: -1 }),
      this.meetings().createIndex({ id: 1 }, { unique: true }),
      this.meetings().createIndex({ generatedAt: -1 }),
      this.tasks().createIndex({ id: 1 }, { unique: true }),
      this.tasks().createIndex({ sessionId: 1, createdAt: -1 }),
      this.memories().createIndex({ id: 1 }, { unique: true }),
      this.memories().createIndex({ profileId: 1, createdAt: -1 }),
      this.settings().createIndex({ id: 1 }, { unique: true }),
      this.auditLogs().createIndex({ id: 1 }, { unique: true }),
      this.auditLogs().createIndex({ createdAt: -1 }),
      this.auditLogs().createIndex({ runId: 1, createdAt: -1 })
    ]);
  }

  async seedDefaults(defaultMongoUri: string) {
    const existingSettings = await this.getSettings();
    if (!existingSettings) {
      const defaults = SettingsSchema.parse(
        createDefaultSettings({
          MONGODB_URI: defaultMongoUri
        })
      );
      await this.settings().insertOne(defaults);
    }

    const existingProfile = await this.profiles().findOne({ id: "profile_local" });
    if (!existingProfile) {
      const timestamp = nowIso();
      await this.profiles().insertOne({
        id: "profile_local",
        createdAt: timestamp,
        updatedAt: timestamp,
        displayName: "Local User",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      });
    }
  }

  async getSettings() {
    const settings = await this.settings().findOne({ id: "settings_default" });
    if (!settings) {
      return null;
    }

    const parsed = SettingsSchema.safeParse(settings);
    if (parsed.success) {
      return parsed.data;
    }

    const migrated = this.hydrateSettings(settings as Partial<SettingsRecord>);
    await this.settings().updateOne({ id: migrated.id }, { $set: migrated }, { upsert: true });
    return migrated;
  }

  async updateSettings(update: SettingsUpdate) {
    const existing = await this.getSettings();
    const base =
      existing ??
      SettingsSchema.parse(
        createDefaultSettings({
          MONGODB_URI: update.mongoUri ?? "mongodb://localhost:27017"
        })
      );

    const next = SettingsSchema.parse({
      ...base,
      ...update,
      approvalDefaults: {
        ...base.approvalDefaults,
        ...update.approvalDefaults
      },
      toolPreferences: {
        ...base.toolPreferences,
        ...update.toolPreferences
      },
      usageControls: {
        ...base.usageControls,
        ...update.usageControls
      },
      updatedAt: nowIso()
    });

    await this.settings().updateOne({ id: next.id }, { $set: next }, { upsert: true });
    return next;
  }

  private hydrateSettings(settings: Partial<SettingsRecord>): SettingsRecord {
    const defaults = createDefaultSettings({
      MONGODB_URI: settings.mongoUri ?? "mongodb://localhost:27017",
      DEFAULT_PROVIDER: settings.provider,
      DEFAULT_OPENAI_MODEL: settings.openAiModel,
      DEFAULT_GEMINI_MODEL: settings.geminiModel,
      DEFAULT_OLLAMA_MODEL: settings.ollamaModel
    });

    return SettingsSchema.parse({
      ...defaults,
      ...settings,
      approvalDefaults: {
        ...defaults.approvalDefaults,
        ...settings.approvalDefaults
      },
      toolPreferences: {
        ...defaults.toolPreferences,
        ...settings.toolPreferences
      },
      usageControls: {
        ...defaults.usageControls,
        ...settings.usageControls
      },
      createdAt: settings.createdAt ?? defaults.createdAt,
      updatedAt: settings.updatedAt ?? defaults.updatedAt
    });
  }

  async getProfile(profileId = "profile_local") {
    return this.profiles().findOne({ id: profileId });
  }

  async createAccount(args: {
    displayName: string;
    email: string;
    passwordHash: string;
    passwordSalt: string;
  }) {
    const timestamp = nowIso();
    const profile: LocalProfile = {
      id: createId("profile"),
      createdAt: timestamp,
      updatedAt: timestamp,
      displayName: args.displayName,
      email: args.email,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };

    const account: LocalAccount = {
      id: createId("account"),
      createdAt: timestamp,
      updatedAt: timestamp,
      profileId: profile.id,
      displayName: args.displayName,
      email: args.email.toLowerCase(),
      passwordHash: args.passwordHash,
      passwordSalt: args.passwordSalt
    };

    await Promise.all([this.profiles().insertOne(profile), this.accounts().insertOne(account)]);
    return { account, profile };
  }

  async getAccountByEmail(email: string) {
    return this.accounts().findOne({ email: email.toLowerCase() });
  }

  async getAccountById(accountId: string) {
    return this.accounts().findOne({ id: accountId });
  }

  async touchAccountLogin(accountId: string) {
    const timestamp = nowIso();
    await this.accounts().updateOne(
      { id: accountId },
      { $set: { updatedAt: timestamp, lastLoginAt: timestamp } }
    );
    return this.getAccountById(accountId);
  }

  async createAuthSession(input: {
    accountId: string;
    profileId: string;
    tokenHash: string;
    expiresAt: string;
  }) {
    const timestamp = nowIso();
    const record: AuthSessionRecord = {
      id: createId("auth"),
      createdAt: timestamp,
      updatedAt: timestamp,
      accountId: input.accountId,
      profileId: input.profileId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      lastSeenAt: timestamp
    };
    await this.authSessions().insertOne(record);
    return record;
  }

  async getAuthSessionByTokenHash(tokenHash: string) {
    return this.authSessions().findOne({ tokenHash });
  }

  async touchAuthSession(sessionId: string) {
    const timestamp = nowIso();
    await this.authSessions().updateOne(
      { id: sessionId },
      { $set: { updatedAt: timestamp, lastSeenAt: timestamp } }
    );
    return this.authSessions().findOne({ id: sessionId });
  }

  async deleteAuthSessionByTokenHash(tokenHash: string) {
    await this.authSessions().deleteOne({ tokenHash });
  }

  async listSessionsWithPreview(options?: {
    limit?: number;
    includeArchived?: boolean;
    archivedOnly?: boolean;
    profileId?: string;
  }): Promise<SessionWithPreview[]> {
    const limit = options?.limit ?? 30;
    const baseFilter = options?.profileId ? { profileId: options.profileId } : {};
    const filter = options?.archivedOnly
      ? { ...baseFilter, archived: true }
      : options?.includeArchived
        ? baseFilter
        : { ...baseFilter, archived: false };

    const sessions = await this.sessions()
      .find(filter)
      .sort({ lastMessageAt: -1 })
      .limit(limit)
      .toArray();

    return Promise.all(
      sessions.map(async (session) => {
        const [conversation, latestMessage] = await Promise.all([
          this.conversations().findOne({ sessionId: session.id }),
          this.messages()
            .find({ sessionId: session.id })
            .sort({ createdAt: -1 })
            .limit(1)
            .next()
        ]);

        return {
          session,
          conversation:
            conversation ??
            ({
              id: "",
              createdAt: session.createdAt,
              updatedAt: session.updatedAt,
              sessionId: session.id,
              title: session.title
            } satisfies ConversationRecord),
          latestMessage: latestMessage ?? undefined
        };
      })
    );
  }

  async createSession(args: {
    profileId: string;
    titleFromContent: string;
  }): Promise<{ session: ChatSession; conversation: ConversationRecord }> {
    const timestamp = nowIso();
    const session: ChatSession = {
      id: createId("session"),
      createdAt: timestamp,
      updatedAt: timestamp,
      profileId: args.profileId,
      title: titleFromPrompt(args.titleFromContent),
      lastMessageAt: timestamp,
      archived: false
    };

    const conversation: ConversationRecord = {
      id: createId("conv"),
      createdAt: timestamp,
      updatedAt: timestamp,
      sessionId: session.id,
      title: session.title
    };

    await Promise.all([
      this.sessions().insertOne(session),
      this.conversations().insertOne(conversation)
    ]);

    return { session, conversation };
  }

  async getSession(sessionId: string, profileId?: string) {
    return this.sessions().findOne(profileId ? { id: sessionId, profileId } : { id: sessionId });
  }

  async archiveSession(sessionId: string) {
    await this.sessions().updateOne(
      { id: sessionId },
      { $set: { archived: true, updatedAt: nowIso() } }
    );
    return this.getSession(sessionId);
  }

  async restoreSession(sessionId: string) {
    await this.sessions().updateOne(
      { id: sessionId },
      { $set: { archived: false, updatedAt: nowIso() } }
    );
    return this.getSession(sessionId);
  }

  async getConversation(conversationId: string) {
    return this.conversations().findOne({ id: conversationId });
  }

  async getConversationBySessionId(sessionId: string) {
    return this.conversations().findOne({ sessionId });
  }

  async touchSession(sessionId: string) {
    const timestamp = nowIso();
    await this.sessions().updateOne(
      { id: sessionId },
      { $set: { updatedAt: timestamp, lastMessageAt: timestamp } }
    );
  }

  async listMessages(conversationId: string) {
    return this.messages().find({ conversationId }).sort({ createdAt: 1 }).toArray();
  }

  async createMessage(
    input: Omit<MessageRecord, "id" | "createdAt" | "updatedAt">
  ): Promise<MessageRecord> {
    const timestamp = nowIso();
    const message: MessageRecord = {
      id: createId("msg"),
      createdAt: timestamp,
      updatedAt: timestamp,
      ...input
    };

    await this.messages().insertOne(message);
    await this.touchSession(input.sessionId);
    return message;
  }

  async createRun(
    input: Omit<RunRecord, "createdAt" | "updatedAt"> & { id?: string }
  ) {
    const timestamp = nowIso();
    const { id, ...rest } = input;
    const run = RunRecordSchema.parse({
      id: id ?? createId("runmeta"),
      createdAt: timestamp,
      updatedAt: timestamp,
      ...rest
    });

    await this.runs().insertOne(run);
    return run;
  }

  async updateRun(runId: string, patch: Partial<RunRecord>) {
    await this.runs().updateOne(
      { id: runId },
      { $set: { ...patch, updatedAt: nowIso() } }
    );
    return this.runs().findOne({ id: runId });
  }

  async getRun(runId: string) {
    return this.runs().findOne({ id: runId });
  }

  async listRunsBySession(sessionId: string, limit = 50) {
    return this.runs().find({ sessionId }).sort({ createdAt: -1 }).limit(limit).toArray();
  }

  async listRecentRuns(limit = 30) {
    return this.runs().find({}).sort({ createdAt: -1 }).limit(limit).toArray();
  }

  async listRecentRunsForProfile(profileId: string, limit = 30) {
    const sessionIds = await this.listSessionIdsForProfile(profileId);
    if (!sessionIds.length) {
      return [];
    }

    return this.runs()
      .find({ sessionId: { $in: sessionIds } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
  }

  async createToolCall(
    input: Omit<ToolCallRecord, "id" | "createdAt" | "updatedAt">
  ): Promise<ToolCallRecord> {
    const timestamp = nowIso();
    const record: ToolCallRecord = {
      id: createId("tool"),
      createdAt: timestamp,
      updatedAt: timestamp,
      ...input
    };

    await this.toolCalls().insertOne(record);
    return record;
  }

  async updateToolCall(
    toolCallId: string,
    patch: Partial<ToolCallRecord>
  ): Promise<ToolCallRecord | null> {
    await this.toolCalls().updateOne(
      { id: toolCallId },
      { $set: { ...patch, updatedAt: nowIso() } }
    );
    return this.toolCalls().findOne({ id: toolCallId });
  }

  async listRecentToolCalls(limit = 30) {
    return this.toolCalls().find({}).sort({ createdAt: -1 }).limit(limit).toArray();
  }

  async listRecentToolCallsForProfile(profileId: string, limit = 30) {
    const sessionIds = await this.listSessionIdsForProfile(profileId);
    if (!sessionIds.length) {
      return [];
    }

    return this.toolCalls()
      .find({ sessionId: { $in: sessionIds } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
  }

  async listToolCallsBySession(sessionId: string, limit = 100) {
    return this.toolCalls()
      .find({ sessionId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
  }

  async createApproval(
    input: Omit<ApprovalRecord, "id" | "createdAt" | "updatedAt">
  ): Promise<ApprovalRecord> {
    const timestamp = nowIso();
    const record: ApprovalRecord = {
      id: createId("approval"),
      createdAt: timestamp,
      updatedAt: timestamp,
      ...input
    };

    await this.approvals().insertOne(record);
    return record;
  }

  async updateApproval(
    approvalId: string,
    patch: Partial<ApprovalRecord>
  ): Promise<ApprovalRecord | null> {
    await this.approvals().updateOne(
      { id: approvalId },
      { $set: { ...patch, updatedAt: nowIso() } }
    );

    return this.approvals().findOne({ id: approvalId });
  }

  async getApproval(approvalId: string) {
    return this.approvals().findOne({ id: approvalId });
  }

  async listPendingApprovals() {
    return this.approvals()
      .find({ status: "pending" })
      .sort({ createdAt: -1 })
      .toArray();
  }

  async listPendingApprovalsForProfile(profileId: string) {
    const sessionIds = await this.listSessionIdsForProfile(profileId);
    if (!sessionIds.length) {
      return [];
    }

    return this.approvals()
      .find({
        status: "pending",
        sessionId: { $in: sessionIds }
      })
      .sort({ createdAt: -1 })
      .toArray();
  }

  async listApprovalsBySession(sessionId: string, limit = 100) {
    return this.approvals()
      .find({ sessionId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
  }

  async createMeeting(input: Omit<MeetingRecord, "id" | "createdAt" | "updatedAt">) {
    const timestamp = nowIso();
    const meeting = MeetingSchema.parse({
      id: createId("meeting"),
      createdAt: timestamp,
      updatedAt: timestamp,
      ...input
    });
    await this.meetings().insertOne(meeting);
    return meeting;
  }

  async updateMeeting(meetingId: string, patch: Partial<MeetingRecord>) {
    await this.meetings().updateOne(
      { id: meetingId },
      { $set: { ...patch, updatedAt: nowIso() } }
    );
    return this.meetings().findOne({ id: meetingId });
  }

  async getMeeting(meetingId: string) {
    return this.meetings().findOne({ id: meetingId });
  }

  async listMeetings(limit = 30) {
    return this.meetings().find({}).sort({ createdAt: -1 }).limit(limit).toArray();
  }

  async createTask(input: Omit<TaskRecord, "id" | "createdAt" | "updatedAt">) {
    const timestamp = nowIso();
    const task: TaskRecord = {
      id: createId("task"),
      createdAt: timestamp,
      updatedAt: timestamp,
      ...input
    };
    await this.tasks().insertOne(task);
    return task;
  }

  async updateTask(taskId: string, patch: Partial<TaskRecord>) {
    await this.tasks().updateOne(
      { id: taskId },
      { $set: { ...patch, updatedAt: nowIso() } }
    );
    return this.tasks().findOne({ id: taskId });
  }

  async listTasks(limit = 30) {
    return this.tasks().find({}).sort({ createdAt: -1 }).limit(limit).toArray();
  }

  async createMemory(input: Omit<MemoryRecord, "id" | "createdAt" | "updatedAt">) {
    const timestamp = nowIso();
    const memory: MemoryRecord = {
      id: createId("memory"),
      createdAt: timestamp,
      updatedAt: timestamp,
      ...input
    };
    await this.memories().insertOne(memory);
    return memory;
  }

  async listMemory(profileId = "profile_local", limit = 50) {
    return this.memories()
      .find({ profileId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
  }

  async createAuditLog(
    input: Omit<AuditLogRecord, "id" | "createdAt" | "updatedAt">
  ): Promise<AuditLogRecord> {
    const timestamp = nowIso();
    const log: AuditLogRecord = {
      id: createId("audit"),
      createdAt: timestamp,
      updatedAt: timestamp,
      ...input
    };
    await this.auditLogs().insertOne(log);
    return log;
  }

  async listAuditLogs(limit = 100) {
    return this.auditLogs().find({}).sort({ createdAt: -1 }).limit(limit).toArray();
  }

  async buildHistorySnapshot(profileId = "profile_local"): Promise<HistorySnapshot> {
    const [
      sessions,
      archivedSessions,
      pendingApprovals,
      recentToolCalls,
      recentRuns,
      memories,
      tasks,
      meetings
    ] = await Promise.all([
      this.listSessionsWithPreview({ limit: 30, profileId }),
      this.listSessionsWithPreview({ limit: 30, archivedOnly: true, profileId }),
      this.listPendingApprovalsForProfile(profileId),
      this.listRecentToolCallsForProfile(profileId, 30),
      this.listRecentRunsForProfile(profileId, 30),
      this.listMemory(profileId, 20),
      this.listTasks(20),
      this.listMeetings(20)
    ]);

    return {
      sessions,
      archivedSessions,
      pendingApprovals,
      recentToolCalls,
      recentRuns,
      memories,
      tasks,
      meetings
    };
  }

  async deleteAllData() {
    await Promise.all(
      Object.values(collections).map((name) => this.db.collection(name).deleteMany({}))
    );
  }

  async deleteSessionCascade(sessionId: string) {
    await Promise.all([
      this.sessions().deleteOne({ id: sessionId }),
      this.conversations().deleteMany({ sessionId }),
      this.messages().deleteMany({ sessionId }),
      this.toolCalls().deleteMany({ sessionId }),
      this.approvals().deleteMany({ sessionId }),
      this.runs().deleteMany({ sessionId }),
      this.meetings().deleteMany({ sessionId }),
      this.tasks().deleteMany({ sessionId }),
      this.memories().deleteMany({ sessionId }),
      this.auditLogs().deleteMany({ sessionId })
    ]);
  }

  private async listSessionIdsForProfile(profileId: string) {
    const sessions = await this.sessions()
      .find({ profileId }, { projection: { id: 1 } })
      .toArray();

    return sessions.map((session) => session.id);
  }
}

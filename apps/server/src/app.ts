import cors from "cors";
import express, { type Express } from "express";

import { AgentExecutionEngine, PermissionEngine, ProviderFactory } from "@personal-ai/agent-core";
import { AgentDatabase } from "@personal-ai/db";
import { createGoogleConnectorBundle, createGoogleTools } from "@personal-ai/google-connectors";
import { BrowserSessionManager, createLocalTools } from "@personal-ai/local-tools";
import { ToolRegistry } from "@personal-ai/tool-registry";

import { env } from "./config.js";
import { logger } from "./logger.js";
import { registerApprovalRoutes } from "./routes/approvals.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerChatRoutes } from "./routes/chat.js";
import { registerConnectorRoutes } from "./routes/connectors.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerHistoryRoutes } from "./routes/history.js";
import { registerMeetingRoutes } from "./routes/meetings.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerSettingsRoutes } from "./routes/settings.js";
import { authMiddleware } from "./auth-context.js";
import { AgentRuntimeService } from "./services/agent-runtime-service.js";
import { ApprovalService } from "./services/approval-service.js";
import { AuthService } from "./services/auth-service.js";
import { AuditLogService } from "./services/audit-log-service.js";
import { ConnectorService } from "./services/connector-service.js";
import { ConnectorVaultService } from "./services/connector-vault-service.js";
import { MeetingService } from "./services/meeting-service.js";
import {
  Microsoft365OAuthManager,
  MicrosoftCalendarConnector,
  MicrosoftMailConnector
} from "./services/microsoft-365-connectors.js";
import { RunStreamService } from "./services/run-stream-service.js";
import { SessionService } from "./services/session-service.js";
import { SettingsService } from "./services/settings-service.js";
import {
  WorkspaceCalendarConnector,
  WorkspaceDriveConnector,
  WorkspaceMailConnector
} from "./services/workspace-connectors.js";
import { createMeetingTools } from "./tools/meeting-tools.js";

export interface CreatedServer {
  app: Express;
  close: () => Promise<void>;
}

const inferStatusCode = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  if (/not found|could not be found/i.test(message)) {
    return 404;
  }

  if (/not configured|missing|invalid/i.test(message)) {
    return 400;
  }

  if (/denied|forbidden/i.test(message)) {
    return 403;
  }

  return 500;
};

export const createServer = async (): Promise<CreatedServer> => {
  const app = express();
  const db = await AgentDatabase.connect({
    uri: env.MONGODB_URI,
    dbName: env.MONGODB_DB_NAME
  });
  await db.seedDefaults(env.MONGODB_URI);

  const registry = new ToolRegistry();
  registry.register(...createLocalTools(), ...createGoogleTools());

  const browser = new BrowserSessionManager(env.HEADLESS_BROWSER);
  const vault = new ConnectorVaultService(process.cwd());
  const connectorService = new ConnectorService(vault, env);
  const providerFactory = new ProviderFactory({
    openAiApiKey: env.OPENAI_API_KEY,
    geminiApiKey: env.GEMINI_API_KEY,
    ollamaBaseUrl: env.OLLAMA_BASE_URL
  });
  const googleConnectors = createGoogleConnectorBundle(async () => {
    const googleConfig = await connectorService.getGoogleWorkspaceConfig();
    return googleConfig.config;
  });
  const microsoftOauth = new Microsoft365OAuthManager(
    async () => await connectorService.getMicrosoft365Config(),
    async (refreshToken) => {
      const current = await connectorService.getMicrosoft365Config();
      if (current.source === "none") {
        return;
      }

      await connectorService.saveMicrosoft365Config({
        ...current.config,
        refreshToken
      });
    }
  );
  const microsoftMail = new MicrosoftMailConnector(microsoftOauth);
  const microsoftCalendar = new MicrosoftCalendarConnector(microsoftOauth);
  const workspaceMail = new WorkspaceMailConnector(
    connectorService,
    googleConnectors.gmail,
    microsoftMail
  );
  const workspaceCalendar = new WorkspaceCalendarConnector(
    connectorService,
    googleConnectors.calendar,
    microsoftCalendar
  );
  const workspaceDrive = new WorkspaceDriveConnector(
    connectorService,
    googleConnectors.drive
  );

  const audit = new AuditLogService(db, logger);
  const authService = new AuthService(db);
  const streamService = new RunStreamService();
  const approvalService = new ApprovalService(db, audit);
  const settingsService = new SettingsService(db, audit, {
    openAiConfigured: Boolean(env.OPENAI_API_KEY),
    geminiConfigured: Boolean(env.GEMINI_API_KEY),
    defaultOpenAiModel: env.DEFAULT_OPENAI_MODEL,
    defaultGeminiModel: env.DEFAULT_GEMINI_MODEL,
    defaultOllamaModel: env.DEFAULT_OLLAMA_MODEL
  });
  const sessionService = new SessionService(db, audit);
  const meetingService = new MeetingService(
    db,
    audit,
    settingsService,
    providerFactory,
    workspaceMail,
    workspaceCalendar
  );
  registry.register(...createMeetingTools(meetingService));
  const engine = new AgentExecutionEngine({
    db,
    registry,
    providerFactory,
    permissionEngine: new PermissionEngine(),
    approvalCoordinator: approvalService,
    eventSink: streamService
  });

  const runtime = new AgentRuntimeService(
    db,
    sessionService,
    settingsService,
    engine,
    audit,
    logger,
    browser,
    workspaceMail,
    workspaceCalendar,
    workspaceDrive,
    process.cwd()
  );

  app.use(cors({ origin: env.APP_ORIGIN }));
  app.use(express.json({ limit: "3mb" }));

  registerHealthRoutes(app, settingsService, providerFactory);
  const requireAuth = authMiddleware(authService);
  registerAuthRoutes(app, authService, requireAuth);
  app.use("/api", requireAuth);

  registerChatRoutes(app, runtime, streamService, db);
  registerSessionRoutes(app, sessionService);
  registerApprovalRoutes(app, db, approvalService);
  registerSettingsRoutes(app, settingsService, registry);
  registerConnectorRoutes(app, connectorService, audit);
  registerMeetingRoutes(app, meetingService);
  registerHistoryRoutes(app, db);

  app.use(
    (
      error: unknown,
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction
    ) => {
      logger.error("Unhandled server error.", {
        error: error instanceof Error ? error.message : String(error)
      });
      response.status(inferStatusCode(error)).json({
        error: error instanceof Error ? error.message : "Unknown server error."
      });
    }
  );

  return {
    app,
    close: async () => {
      await browser.close();
      await db.close();
    }
  };
};

import type { AgentDatabase } from "@personal-ai/db";
import type { SettingsRecord, SettingsUpdate } from "@personal-ai/shared";

import type { AuditLogService } from "./audit-log-service.js";

export class SettingsService {
  constructor(
    private readonly db: AgentDatabase,
    private readonly audit: AuditLogService,
    private readonly options: {
      openAiConfigured: boolean;
      geminiConfigured: boolean;
      defaultOpenAiModel: string;
      defaultGeminiModel: string;
      defaultOllamaModel: string;
    }
  ) {}

  async getSettings(): Promise<SettingsRecord> {
    const settings = await this.db.getSettings();
    if (!settings) {
      throw new Error("Settings have not been initialized.");
    }

    return this.syncBootstrapProvider(settings);
  }

  async updateSettings(update: SettingsUpdate) {
    if (update.provider === "openai" && !this.options.openAiConfigured) {
      throw new Error("OpenAI is selected, but OPENAI_API_KEY is not configured.");
    }

    if (update.provider === "gemini" && !this.options.geminiConfigured) {
      throw new Error("Gemini is selected, but GEMINI_API_KEY is not configured.");
    }

    const payload: SettingsUpdate = {
      ...update,
      providerSelectionMode:
        update.provider !== undefined
          ? "manual"
          : update.providerSelectionMode
    };

    if (update.provider === "openai" && !payload.activeModel) {
      payload.activeModel = update.openAiModel ?? this.options.defaultOpenAiModel;
    }

    if (update.provider === "gemini" && !payload.activeModel) {
      payload.activeModel = update.geminiModel ?? this.options.defaultGeminiModel;
    }

    if (update.provider === "ollama" && !payload.activeModel) {
      payload.activeModel = update.ollamaModel ?? this.options.defaultOllamaModel;
    }

    if (update.provider === "mock" && !payload.activeModel) {
      payload.activeModel = "mock-local";
    }

    const settings = await this.db.updateSettings(payload);
    await this.audit.log({
      action: "settings_updated",
      message: "Settings updated.",
      entityType: "settings",
      entityId: settings.id,
      payload: {
        provider: settings.provider,
        activeModel: settings.activeModel,
        routingPolicy: settings.routingPolicy
      }
    });

    return settings;
  }

  private async syncBootstrapProvider(settings: SettingsRecord): Promise<SettingsRecord> {
    const providerSelectionMode = settings.providerSelectionMode ?? "auto";
    const looksUntouchedMock =
      settings.provider === "mock" &&
      settings.activeModel === "mock-local" &&
      providerSelectionMode === "auto";

    if (!looksUntouchedMock) {
      return settings;
    }

    const provider = this.options.openAiConfigured
      ? "openai"
      : this.options.geminiConfigured
        ? "gemini"
        : null;

    if (!provider) {
      return settings;
    }

    const updated = await this.db.updateSettings({
      provider,
      providerSelectionMode: "auto",
      activeModel:
        provider === "openai"
          ? settings.openAiModel || this.options.defaultOpenAiModel
          : settings.geminiModel || this.options.defaultGeminiModel
    });

    await this.audit.log({
      action: "settings_updated",
      message: `Auto-switched provider from mock to ${provider} because API credentials are available.`,
      entityType: "settings",
      entityId: updated.id,
      payload: {
        provider: updated.provider,
        activeModel: updated.activeModel,
        automatic: true
      }
    });

    return updated;
  }
}

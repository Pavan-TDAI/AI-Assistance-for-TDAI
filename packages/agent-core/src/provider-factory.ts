import type { SettingsRecord } from "@personal-ai/shared";

import type { ModelProvider } from "./types.js";
import { GeminiProvider } from "./providers/gemini.js";
import { MockProvider } from "./providers/mock.js";
import { OllamaProvider } from "./providers/ollama.js";
import { OpenAiProvider } from "./providers/openai.js";

const createMissingProvider = (
  provider: "openai" | "gemini" | "ollama",
  message: string
): ModelProvider => ({
  name: provider,
  async generate() {
    return {
      text: message,
      toolCalls: [],
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        promptChars: 0,
        completionChars: message.length,
        estimatedCostUsd: 0
      }
    };
  }
});

export class ProviderFactory {
  constructor(
    private readonly options: {
      openAiApiKey?: string;
      geminiApiKey?: string;
      ollamaBaseUrl: string;
    }
  ) {}

  create(settings: SettingsRecord) {
    return this.createByName(settings.provider);
  }

  createByName(providerName: SettingsRecord["provider"]) {
    if (providerName === "openai") {
      return this.options.openAiApiKey
        ? new OpenAiProvider(this.options.openAiApiKey)
        : createMissingProvider(
            "openai",
            "OpenAI is selected, but OPENAI_API_KEY is missing. Add it in apps/server/.env, restart the server, then retry your request."
          );
    }

    if (providerName === "gemini") {
      return this.options.geminiApiKey
        ? new GeminiProvider(this.options.geminiApiKey)
        : createMissingProvider(
            "gemini",
            "Gemini is selected, but GEMINI_API_KEY is missing. Add it in apps/server/.env, restart the server, then retry your request."
          );
    }

    if (providerName === "ollama") {
      return new OllamaProvider(this.options.ollamaBaseUrl);
    }

    return new MockProvider();
  }

  availableProviders(settings?: SettingsRecord["provider"]): SettingsRecord["provider"][] {
    const providers: SettingsRecord["provider"][] = ["mock"];

    if (this.options.openAiApiKey) {
      providers.push("openai");
    }

    if (this.options.geminiApiKey) {
      providers.push("gemini");
    }

    providers.push("ollama");

    return settings && !providers.includes(settings) ? [...providers, settings] : providers;
  }

  createPlanningProvider(settings: SettingsRecord) {
    if (settings.routingPolicy === "local") {
      return {
        provider: this.createByName("ollama"),
        model: settings.ollamaModel,
        providerName: "ollama" as const
      };
    }

    if (settings.provider === "mock") {
      if (this.options.openAiApiKey) {
        return {
          provider: this.createByName("openai"),
          model: settings.openAiModel,
          providerName: "openai" as const
        };
      }

      if (this.options.geminiApiKey) {
        return {
          provider: this.createByName("gemini"),
          model: settings.geminiModel,
          providerName: "gemini" as const
        };
      }

      return {
        provider: this.createByName("ollama"),
        model: settings.ollamaModel,
        providerName: "ollama" as const
      };
    }

    return {
      provider: this.create(settings),
      model:
        settings.provider === "openai"
          ? settings.openAiModel
          : settings.provider === "gemini"
            ? settings.geminiModel
            : settings.provider === "ollama"
              ? settings.ollamaModel
              : settings.activeModel,
      providerName: settings.provider
    };
  }

  createDraftingProvider(settings: SettingsRecord) {
    if (settings.routingPolicy === "local") {
      return {
        provider: this.createByName("ollama"),
        model: settings.ollamaModel,
        providerName: "ollama" as const
      };
    }

    if (settings.provider === "openai") {
      return {
        provider: this.createByName("openai"),
        model: settings.openAiModel,
        providerName: "openai" as const
      };
    }

    if (settings.provider === "gemini") {
      return {
        provider: this.createByName("gemini"),
        model: settings.geminiModel,
        providerName: "gemini" as const
      };
    }

    if (settings.provider === "ollama") {
      return {
        provider: this.createByName("ollama"),
        model: settings.ollamaModel,
        providerName: "ollama" as const
      };
    }

    if (this.options.openAiApiKey) {
      return {
        provider: this.createByName("openai"),
        model: settings.openAiModel,
        providerName: "openai" as const
      };
    }

    if (this.options.geminiApiKey) {
      return {
        provider: this.createByName("gemini"),
        model: settings.geminiModel,
        providerName: "gemini" as const
      };
    }

    return {
      provider: this.createByName("ollama"),
      model: settings.ollamaModel,
      providerName: "ollama" as const
    };
  }

  createFallback(providerName: SettingsRecord["provider"], settings: SettingsRecord) {
    const chain: SettingsRecord["provider"][] =
      providerName === "openai"
        ? ["gemini", "ollama", "mock"]
        : providerName === "gemini"
          ? ["openai", "ollama", "mock"]
          : providerName === "ollama"
            ? ["openai", "gemini", "mock"]
            : ["ollama", "openai", "gemini"];

    for (const nextProvider of chain) {
      if (nextProvider === "openai" && !this.options.openAiApiKey) {
        continue;
      }

      if (nextProvider === "gemini" && !this.options.geminiApiKey) {
        continue;
      }

      return {
        provider: this.createByName(nextProvider),
        model:
          nextProvider === "openai"
            ? settings.openAiModel
            : nextProvider === "gemini"
              ? settings.geminiModel
              : nextProvider === "ollama"
                ? settings.ollamaModel
                : "mock-local",
        providerName: nextProvider
      } as const;
    }

    return null;
  }
}

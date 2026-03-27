import { z } from "zod";

import {
  SettingsApprovalDefaultsSchema,
  ToolPreferencesSchema,
  UsageControlsSchema,
  providerValues,
  type SettingsApprovalDefaults,
  type ToolPreferences,
  type UsageControls
} from "./contracts.js";
import { nowIso } from "./utils.js";

const splitCsv = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

export const ServerEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().default(4000),
  APP_ORIGIN: z.string().default("http://localhost:3000"),
  MONGODB_URI: z.string().default("mongodb://localhost:27017"),
  MONGODB_DB_NAME: z.string().default("personal_ai_agent"),
  DEFAULT_PROVIDER: z.enum(providerValues).default("mock"),
  DEFAULT_OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  DEFAULT_GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  DEFAULT_OLLAMA_MODEL: z.string().default("llama3.1:8b"),
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  OLLAMA_BASE_URL: z.string().default("http://127.0.0.1:11434"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),
  GOOGLE_REFRESH_TOKEN: z.string().optional(),
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_TENANT_ID: z.string().optional(),
  MICROSOFT_REDIRECT_URI: z.string().optional(),
  MICROSOFT_REFRESH_TOKEN: z.string().optional(),
  SAFE_ROOTS: z.string().optional(),
  SAFE_SHELL_COMMANDS: z.string().optional(),
  BLOCKED_SHELL_PATTERNS: z.string().optional(),
  HEADLESS_BROWSER: z
    .string()
    .optional()
    .transform((value) => value === "true")
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

export const WebEnvSchema = z.object({
  NEXT_PUBLIC_API_BASE_URL: z.string().default("http://localhost:4000")
});

export type WebEnv = z.infer<typeof WebEnvSchema>;

export const createDefaultApprovalDefaults = (): SettingsApprovalDefaults =>
  SettingsApprovalDefaultsSchema.parse({});

export const createDefaultToolPreferences = (
  env?: Partial<ServerEnv>
): ToolPreferences =>
  ToolPreferencesSchema.parse({
    safeRoots: splitCsv(env?.SAFE_ROOTS),
    safeShellCommands: splitCsv(env?.SAFE_SHELL_COMMANDS),
    blockedShellPatterns: splitCsv(env?.BLOCKED_SHELL_PATTERNS).length
      ? splitCsv(env?.BLOCKED_SHELL_PATTERNS)
      : [
          "rm\\s+-rf",
          "Remove-Item\\s+-Recurse\\s+-Force",
          "format\\s+",
          "shutdown",
          "Restart-Computer",
          "Stop-Computer",
          "del\\s+/f",
          "cipher\\s+/w"
        ],
    headlessBrowser: env?.HEADLESS_BROWSER ?? false
  });

export const createDefaultUsageControls = (): UsageControls =>
  UsageControlsSchema.parse({});

export const createDefaultSettings = (env: Partial<ServerEnv>) => {
  const timestamp = nowIso();
  const provider = env.DEFAULT_PROVIDER ?? "mock";
  const openAiModel = env.DEFAULT_OPENAI_MODEL ?? "gpt-4o-mini";
  const geminiModel = env.DEFAULT_GEMINI_MODEL ?? "gemini-2.5-flash";
  const ollamaModel = env.DEFAULT_OLLAMA_MODEL ?? "llama3.1:8b";

  return {
    id: "settings_default",
    createdAt: timestamp,
    updatedAt: timestamp,
    profileName: "Local User",
    mongoUri: env.MONGODB_URI ?? "mongodb://localhost:27017",
    provider,
    providerSelectionMode: "auto",
    routingPolicy: "fallback",
    activeModel:
      provider === "gemini"
        ? geminiModel
        : provider === "openai"
          ? openAiModel
          : provider === "ollama"
            ? ollamaModel
            : "mock-local",
    openAiModel,
    geminiModel,
    ollamaModel,
    maxToolSteps: 6,
    approvalDefaults: createDefaultApprovalDefaults(),
    toolPreferences: createDefaultToolPreferences(env),
    usageControls: createDefaultUsageControls()
  };
};

export const parseServerEnv = (env: NodeJS.ProcessEnv) => ServerEnvSchema.parse(env);
export const parseWebEnv = (env: NodeJS.ProcessEnv) => WebEnvSchema.parse(env);

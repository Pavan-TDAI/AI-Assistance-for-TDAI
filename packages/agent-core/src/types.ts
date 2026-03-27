import type { ApprovalRecord, RunEvent, SettingsRecord } from "@personal-ai/shared";
import type { ModelToolDefinition, ToolRuntimeServices } from "@personal-ai/tool-registry";

export interface ProviderToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ProviderConversationItem {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolName?: string;
  toolCallId?: string;
  toolCalls?: ProviderToolCall[];
}

export interface GenerateTurnInput {
  model: string;
  systemPrompt: string;
  messages: ProviderConversationItem[];
  tools: ModelToolDefinition[];
}

export interface ProviderUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  promptChars: number;
  completionChars: number;
  estimatedCostUsd?: number;
}

export interface GenerateTurnOutput {
  text: string;
  toolCalls: ProviderToolCall[];
  usage?: ProviderUsage;
}

export interface ModelProvider {
  readonly name: string;
  generate(input: GenerateTurnInput): Promise<GenerateTurnOutput>;
}

export interface ModelProviderFactoryOptions {
  openAiApiKey?: string;
  geminiApiKey?: string;
  ollamaBaseUrl?: string;
}

export interface ApprovalResolution {
  approved: boolean;
  approval: ApprovalRecord;
}

export interface ApprovalCoordinator {
  requestApproval(input: {
    approval: ApprovalRecord;
  }): Promise<ApprovalResolution>;
}

export interface RunEventSink {
  publish(event: RunEvent): Promise<void> | void;
}

export interface EngineRunInput {
  runId: string;
  sessionId: string;
  conversationId: string;
  profileId: string;
  userPrompt: string;
  selectedMeetingId?: string;
  settings: SettingsRecord;
  services: ToolRuntimeServices;
}

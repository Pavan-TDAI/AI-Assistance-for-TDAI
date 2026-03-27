import OpenAI from "openai";

import type {
  GenerateTurnInput,
  GenerateTurnOutput,
  ProviderConversationItem
} from "../types.js";
import { estimateModelCostUsd } from "./cost.js";

const mapMessages = (systemPrompt: string, messages: ProviderConversationItem[]) => [
  { role: "system" as const, content: systemPrompt },
  ...messages.map((message) => {
    if (message.role === "tool") {
      return {
        role: "tool" as const,
        tool_call_id: message.toolCallId ?? message.toolName ?? "tool_result",
        content: message.content
      };
    }

    if (message.role === "assistant" && message.toolCalls?.length) {
      return {
        role: "assistant" as const,
        content: message.content || "",
        tool_calls: message.toolCalls.map((toolCall) => ({
          id: toolCall.id,
          type: "function" as const,
          function: {
            name: toolCall.name,
            arguments: JSON.stringify(toolCall.input)
          }
        }))
      };
    }

    return {
      role: message.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: message.content
    };
  })
];

export class OpenAiProvider {
  readonly name = "openai";
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async generate(input: GenerateTurnInput): Promise<GenerateTurnOutput> {
    const response = await this.client.chat.completions.create({
      model: input.model,
      temperature: 0.2,
      messages: mapMessages(input.systemPrompt, input.messages),
      tools: input.tools.map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema
        }
      })),
      tool_choice: "auto"
    });

    const choice = response.choices[0]?.message;
    const toolCalls =
      choice?.tool_calls?.map((toolCall) => ({
        id: toolCall.id,
        name: toolCall.function.name,
        input: JSON.parse(toolCall.function.arguments || "{}") as Record<string, unknown>
      })) ?? [];

    return {
      text: typeof choice?.content === "string" ? choice.content : "",
      toolCalls,
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens ?? 0,
            completionTokens: response.usage.completion_tokens ?? 0,
            totalTokens: response.usage.total_tokens ?? 0,
            promptChars: JSON.stringify(input.messages).length + input.systemPrompt.length,
            completionChars: typeof choice?.content === "string" ? choice.content.length : 0,
            estimatedCostUsd: estimateModelCostUsd(
              input.model,
              response.usage.prompt_tokens ?? 0,
              response.usage.completion_tokens ?? 0
            )
          }
        : undefined
    };
  }
}

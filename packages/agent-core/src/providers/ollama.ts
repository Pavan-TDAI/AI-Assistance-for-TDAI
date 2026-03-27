import type {
  GenerateTurnInput,
  GenerateTurnOutput,
  ProviderConversationItem
} from "../types.js";

const mapMessages = (systemPrompt: string, messages: ProviderConversationItem[]) => [
  { role: "system", content: systemPrompt },
  ...messages.map((message) => {
    if (message.role === "tool") {
      return {
        role: "tool",
        content: message.content,
        tool_name: message.toolName,
        tool_call_id: message.toolCallId
      };
    }

    if (message.role === "assistant" && message.toolCalls?.length) {
      return {
        role: "assistant",
        content: message.content || "",
        tool_calls: message.toolCalls.map((toolCall) => ({
          function: {
            name: toolCall.name,
            arguments: toolCall.input
          }
        }))
      };
    }

    return {
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content
    };
  })
];

export class OllamaProvider {
  readonly name = "ollama";

  constructor(private readonly baseUrl: string) {}

  async generate(input: GenerateTurnInput): Promise<GenerateTurnOutput> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: input.model,
        stream: false,
        messages: mapMessages(input.systemPrompt, input.messages),
        tools: input.tools.map((tool) => ({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema
          }
        }))
      })
    });

    if (!response.ok) {
      const payload = await response.text().catch(() => "");
      throw new Error(
        payload || `Ollama request failed with status ${response.status}.`
      );
    }

    const payload = (await response.json()) as {
      message?: {
        content?: string;
        tool_calls?: Array<{
          function?: {
            name?: string;
            arguments?: Record<string, unknown> | string;
          };
        }>;
      };
      prompt_eval_count?: number;
      eval_count?: number;
    };

    const toolCalls =
      payload.message?.tool_calls
        ?.map((toolCall, index) => {
          const name = toolCall.function?.name;
          if (!name) {
            return null;
          }

          const rawArguments = toolCall.function?.arguments ?? {};
          return {
            id: `${name}_${Date.now()}_${index}`,
            name,
            input:
              typeof rawArguments === "string"
                ? (JSON.parse(rawArguments || "{}") as Record<string, unknown>)
                : rawArguments
          };
        })
        .filter((toolCall): toolCall is NonNullable<typeof toolCall> => Boolean(toolCall)) ??
      [];

    const text = payload.message?.content ?? "";
    const promptTokens = payload.prompt_eval_count ?? 0;
    const completionTokens = payload.eval_count ?? 0;

    return {
      text,
      toolCalls,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        promptChars: JSON.stringify(input.messages).length + input.systemPrompt.length,
        completionChars: text.length,
        estimatedCostUsd: 0
      }
    };
  }
}

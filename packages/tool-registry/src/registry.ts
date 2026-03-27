import { zodToJsonSchema } from "zod-to-json-schema";

import { toErrorMessage } from "@personal-ai/shared";

import type {
  ModelToolDefinition,
  PendingToolCall,
  ToolCatalogEntry,
  ToolDefinition,
  ToolExecutionContext,
  ToolExecutionOutcome
} from "./types.js";

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, name: string) => {
  let timeoutId: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Tool "${name}" timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  register(...definitions: ToolDefinition[]) {
    for (const definition of definitions) {
      this.tools.set(definition.name, definition);
    }
  }

  get(name: string) {
    return this.tools.get(name);
  }

  mustGet(name: string) {
    const tool = this.get(name);
    if (!tool) {
      throw new Error(`Tool "${name}" is not registered.`);
    }

    return tool;
  }

  list(): ToolCatalogEntry[] {
    return [...this.tools.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
      permissionCategory: tool.permissionCategory,
      safeByDefault: tool.safeByDefault ?? false,
      timeoutMs: tool.timeoutMs ?? 30_000
    }));
  }

  toModelDefinitions(): ModelToolDefinition[] {
    return [...this.tools.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: zodToJsonSchema(tool.schema, {
        name: tool.name,
        $refStrategy: "none"
      })
    }));
  }

  buildPendingToolCall(name: string, rawInput: Record<string, unknown>): PendingToolCall {
    const tool = this.mustGet(name);
    const input = tool.schema.parse(rawInput);

    return {
      toolCall: {
        id: "",
        createdAt: "",
        updatedAt: "",
        sessionId: "",
        conversationId: "",
        runId: "",
        toolName: tool.name,
        permissionCategory: tool.permissionCategory,
        status: "pending_approval",
        input,
        summary: tool.summariseInput?.(input) ?? JSON.stringify(input)
      },
      inputSummary:
        tool.summariseInput?.(input) ?? JSON.stringify(input, null, 2).slice(0, 500)
    };
  }

  async execute(
    name: string,
    rawInput: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionOutcome> {
    const tool = this.mustGet(name);
    const input = tool.schema.parse(rawInput);

    try {
      const result = await withTimeout(
        tool.handler(input, context),
        tool.timeoutMs ?? 30_000,
        tool.name
      );

      return {
        tool,
        input,
        result
      };
    } catch (error) {
      throw new Error(
        `Tool "${tool.name}" failed: ${toErrorMessage(error)}`
      );
    }
  }
}

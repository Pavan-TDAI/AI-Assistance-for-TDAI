import {
  GoogleGenerativeAI,
  SchemaType,
  type FunctionDeclaration,
  type FunctionDeclarationSchema,
  type FunctionDeclarationSchemaProperty
} from "@google/generative-ai";

import type {
  GenerateTurnInput,
  GenerateTurnOutput,
  ProviderConversationItem
} from "../types.js";
import { estimateModelCostUsd } from "./cost.js";

const toGeminiSchema = (schema: Record<string, unknown>): FunctionDeclarationSchema => {
  const root =
    typeof schema.$ref === "string" && typeof schema.definitions === "object"
      ? (schema.definitions as Record<string, unknown>)[
          schema.$ref.split("/").at(-1) ?? ""
        ] ?? schema
      : schema;

  const cleanedRoot = cleanGeminiSchemaProperty(root);

  return {
    type: cleanedRoot.type === SchemaType.OBJECT ? SchemaType.OBJECT : SchemaType.OBJECT,
    properties: cleanedRoot.properties ?? {},
    description: cleanedRoot.description,
    required: cleanedRoot.required
  };
};

const toSchemaType = (value: unknown): SchemaType | undefined => {
  switch (String(value).toLowerCase()) {
    case "string":
      return SchemaType.STRING;
    case "number":
      return SchemaType.NUMBER;
    case "integer":
      return SchemaType.INTEGER;
    case "boolean":
      return SchemaType.BOOLEAN;
    case "array":
      return SchemaType.ARRAY;
    case "object":
      return SchemaType.OBJECT;
    default:
      return undefined;
  }
};

const cleanGeminiSchemaProperty = (value: unknown): FunctionDeclarationSchemaProperty => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const source = value as Record<string, unknown>;
  const cleaned: FunctionDeclarationSchemaProperty = {};
  const explicitType = toSchemaType(source.type);

  for (const [key, entry] of Object.entries(source)) {
    if (
      key === "$schema" ||
      key === "$ref" ||
      key === "definitions" ||
      key === "additionalProperties"
    ) {
      continue;
    }

    if (key === "type") {
      continue;
    }

    if (key === "properties" && entry && typeof entry === "object" && !Array.isArray(entry)) {
      cleaned.properties = Object.fromEntries(
        Object.entries(entry as Record<string, unknown>).map(([propertyName, propertyValue]) => [
          propertyName,
          cleanGeminiSchemaProperty(propertyValue)
        ])
      );
      continue;
    }

    if (key === "items" && entry && typeof entry === "object") {
      cleaned.items = cleanGeminiSchemaProperty(entry);
      continue;
    }

    if (key === "required" && Array.isArray(entry)) {
      cleaned.required = entry.filter((item): item is string => typeof item === "string");
      continue;
    }

    if (key === "enum" && Array.isArray(entry)) {
      cleaned.enum = entry.filter((item): item is string => typeof item === "string");
      continue;
    }

    if (
      key === "description" ||
      key === "format" ||
      key === "nullable" ||
      key === "example"
    ) {
      cleaned[key] = entry as never;
    }
  }

  cleaned.type =
    explicitType ??
    (cleaned.properties ? SchemaType.OBJECT : undefined) ??
    (cleaned.items ? SchemaType.ARRAY : undefined);

  return cleaned;
};

const mapGeminiMessages = (messages: ProviderConversationItem[]) =>
  messages.map((message) => {
    if (message.role === "assistant" && message.toolCalls?.length) {
      return {
        role: "model",
        parts: message.toolCalls.map((toolCall) => ({
          functionCall: {
            name: toolCall.name,
            args: toolCall.input
          }
        }))
      };
    }

    if (message.role === "tool") {
      return {
        role: "user",
        parts: [
          {
            functionResponse: {
              name: message.toolName ?? "tool_result",
              response: {
                name: message.toolName ?? "tool_result",
                content: message.content
              }
            }
          }
        ]
      };
    }

    return {
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }]
    };
  });

export class GeminiProvider {
  readonly name = "gemini";
  private readonly client: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async generate(input: GenerateTurnInput): Promise<GenerateTurnOutput> {
    const functionDeclarations: FunctionDeclaration[] = input.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: toGeminiSchema(tool.inputSchema)
    }));

    const model = this.client.getGenerativeModel({
      model: input.model,
      systemInstruction: input.systemPrompt,
      tools: [
        {
          functionDeclarations
        }
      ]
    });

    const result = await model.generateContent({
      contents: mapGeminiMessages(input.messages)
    });

    const parts = result.response.candidates?.[0]?.content?.parts ?? [];
    const toolCalls = parts
      .filter((part) => "functionCall" in part && part.functionCall)
      .map((part) => ({
        id: `${part.functionCall!.name}_${Date.now()}`,
        name: part.functionCall!.name,
        input: (part.functionCall!.args as Record<string, unknown>) ?? {}
      }));

    const text = parts
      .filter((part) => "text" in part && typeof part.text === "string")
      .map((part) => part.text)
      .join("\n");

    return {
      text,
      toolCalls,
      usage: result.response.usageMetadata
        ? {
            promptTokens:
              Number(result.response.usageMetadata.promptTokenCount ?? 0) || 0,
            completionTokens:
              Number(result.response.usageMetadata.candidatesTokenCount ?? 0) || 0,
            totalTokens:
              Number(result.response.usageMetadata.totalTokenCount ?? 0) || 0,
            promptChars: JSON.stringify(input.messages).length + input.systemPrompt.length,
            completionChars: text.length,
            estimatedCostUsd: estimateModelCostUsd(
              input.model,
              Number(result.response.usageMetadata.promptTokenCount ?? 0) || 0,
              Number(result.response.usageMetadata.candidatesTokenCount ?? 0) || 0
            )
          }
        : undefined
    };
  }
}

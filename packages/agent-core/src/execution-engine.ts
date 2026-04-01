import {
  nowIso,
  toErrorMessage,
  type MessageAttachment,
  type MessageRecord,
  type RunStatus,
  type RunUsage,
  type ToolCallRecord
} from "@personal-ai/shared";
import type { AgentDatabase } from "@personal-ai/db";
import type { ToolRegistry } from "@personal-ai/tool-registry";

import { buildSystemPrompt } from "./prompt.js";
import { ProviderFactory } from "./provider-factory.js";
import { PermissionEngine } from "./permission-engine.js";
import type {
  ApprovalCoordinator,
  EngineRunInput,
  ProviderConversationItem,
  ProviderUsage,
  RunEventSink
} from "./types.js";

const renderAttachmentContext = (attachments: MessageAttachment[]) => {
  if (!attachments.length) {
    return "";
  }

  return [
    "[Uploaded attachments]",
    ...attachments.map((attachment, index) =>
      [
        `${index + 1}. ${attachment.fileName}`,
        `Path: ${attachment.storagePath}`,
        `Type: ${attachment.mimeType}`,
        `Size: ${attachment.sizeBytes} bytes`,
        attachment.extractedTextPreview
          ? `Preview: ${attachment.extractedTextPreview}`
          : "Preview: No extracted text preview was available."
      ].join("\n")
    )
  ].join("\n\n");
};

const buildMessageContentForModel = (message: MessageRecord) => {
  if (!message.attachments.length) {
    return message.content;
  }

  const attachmentContext = renderAttachmentContext(message.attachments);
  return message.content.trim()
    ? `${message.content}\n\n${attachmentContext}`
    : attachmentContext;
};

const toConversationItem = (message: MessageRecord): ProviderConversationItem => ({
  role: message.role,
  content: buildMessageContentForModel(message),
  toolName: message.toolName,
  toolCallId: message.toolCallId
});

const shouldTryProviderFallback = (message: string) =>
  /429|quota|billing|rate limit|unauthorized|invalid api key|insufficient|ollama|connection refused|fetch failed|model not found/i.test(
    message
  );

const shouldBuildPlan = (prompt: string) =>
  prompt.trim().length > 120 ||
  /(plan|organize|meeting|schedule|ticket|workflow|coordinate|email|travel|book|agent)/i.test(
    prompt
  );

const accumulateUsage = (current: RunUsage | undefined, next: ProviderUsage | undefined) => {
  if (!next) {
    return current;
  }

  return {
    promptTokens: (current?.promptTokens ?? 0) + next.promptTokens,
    completionTokens: (current?.completionTokens ?? 0) + next.completionTokens,
    totalTokens: (current?.totalTokens ?? 0) + next.totalTokens,
    promptChars: (current?.promptChars ?? 0) + next.promptChars,
    completionChars: (current?.completionChars ?? 0) + next.completionChars,
    estimatedCostUsd:
      (current?.estimatedCostUsd ?? 0) + (next.estimatedCostUsd ?? 0)
  } satisfies RunUsage;
};

const trimMessagesToBudget = (
  messages: MessageRecord[],
  maxPromptChars: number,
  minimumMessages: number
) => {
  const nextMessages = [...messages];

  const currentCharCount = () =>
    nextMessages.reduce((total, message) => total + message.content.length + 120, 0);

  while (nextMessages.length > minimumMessages && currentCharCount() > maxPromptChars) {
    nextMessages.shift();
  }

  return nextMessages;
};

const buildHeuristicSummary = (messages: MessageRecord[]) =>
  messages
    .slice(-12)
    .map((message) =>
      `${message.role}: ${buildMessageContentForModel(message).replace(/\s+/g, " ").trim()}`
    )
    .join("\n")
    .slice(0, 2400);

const buildHeuristicPlan = (prompt: string) => {
  const trimmed = prompt.trim();
  return [
    "Planned approach:",
    `1. Clarify the goal from: "${trimmed.slice(0, 120)}${trimmed.length > 120 ? "..." : ""}"`,
    "2. Start with low-risk inspection or information gathering steps.",
    "3. Pause for approval before sensitive actions like email sending, browser automation, or external changes.",
    "4. Execute the approved steps and finish with a concise summary."
  ].join("\n");
};

const buildSummaryPrompt = (messages: MessageRecord[]) => `
Summarize this earlier conversation for a local AI agent.
Keep it under 180 words.
Preserve goals, decisions, paths, approvals, blocked items, and important file or app references.

Conversation:
${messages
  .map((message) => `${message.role.toUpperCase()}: ${buildMessageContentForModel(message)}`)
  .join("\n\n")}
`;

const buildPlanPrompt = (prompt: string) => `
Create a short execution plan for the user's goal.
Return plain text.
Use 3 to 5 numbered steps.
Mention approval checkpoints for sensitive actions.
Keep it practical and brief.

Goal:
${prompt}
`;

const buildDynamicSystemPrompt = (basePrompt: string, summaryText?: string) =>
  summaryText
    ? `${basePrompt}\n\nEarlier conversation summary:\n${summaryText}`
    : basePrompt;

export interface ExecutionEngineDependencies {
  db: AgentDatabase;
  registry: ToolRegistry;
  providerFactory: ProviderFactory;
  permissionEngine: PermissionEngine;
  approvalCoordinator: ApprovalCoordinator;
  eventSink: RunEventSink;
}

export class AgentExecutionEngine {
  constructor(private readonly deps: ExecutionEngineDependencies) {}

  private async buildConversationContext(input: EngineRunInput, persistedMessages: MessageRecord[]) {
    const { db, providerFactory } = this.deps;
    const { usageControls } = input.settings;
    const shouldSummarise =
      persistedMessages.length > usageControls.summaryTriggerMessages;

    if (!shouldSummarise) {
      return {
        conversationItems: trimMessagesToBudget(
          persistedMessages,
          usageControls.maxPromptChars,
          Math.min(usageControls.contextMessageWindow, persistedMessages.length)
        ).map(toConversationItem),
        summaryText: undefined
      };
    }

    const recentMessages = persistedMessages.slice(-usageControls.contextMessageWindow);
    const olderMessages = persistedMessages.slice(0, -usageControls.contextMessageWindow);
    const drafting = providerFactory.createDraftingProvider(input.settings);
    let summaryText = "";

    try {
      const response = await drafting.provider.generate({
        model: drafting.model,
        systemPrompt:
          "You compress chat history for a local AI agent. Keep facts precise and concise.",
        messages: [
          {
            role: "user",
            content: buildSummaryPrompt(olderMessages)
          }
        ],
        tools: []
      });
      summaryText =
        response.text.trim() && !/mock mode is active/i.test(response.text)
          ? response.text.trim()
          : buildHeuristicSummary(olderMessages);
    } catch {
      summaryText = buildHeuristicSummary(olderMessages);
    }

    await db.createMemory({
      profileId: input.profileId,
      sessionId: input.sessionId,
      kind: "summary",
      content: summaryText,
      confidence: 0.65,
      source: "conversation_rollup"
    });

    return {
      conversationItems: trimMessagesToBudget(
        recentMessages,
        usageControls.maxPromptChars,
        Math.min(usageControls.contextMessageWindow, recentMessages.length)
      ).map(toConversationItem),
      summaryText
    };
  }

  private async maybeCreatePlan(
    input: EngineRunInput,
    conversationItems: ProviderConversationItem[],
    systemPrompt: string
  ) {
    const { db, providerFactory, eventSink } = this.deps;

    if (!shouldBuildPlan(input.userPrompt)) {
      return {
        conversationItems,
        planText: undefined,
        usage: undefined
      };
    }

    const planning = providerFactory.createPlanningProvider(input.settings);
    let planText = "";
    let usage: RunUsage | undefined;

    try {
      const response = await planning.provider.generate({
        model: planning.model,
        systemPrompt:
          `${systemPrompt}\n\nCreate a short plan before executing complex work.`,
        messages: [
          {
            role: "user",
            content: buildPlanPrompt(input.userPrompt)
          }
        ],
        tools: []
      });
      planText =
        response.text.trim() && !/mock mode is active/i.test(response.text)
          ? response.text.trim()
          : buildHeuristicPlan(input.userPrompt);
      usage = response.usage
        ? {
            promptTokens: response.usage.promptTokens,
            completionTokens: response.usage.completionTokens,
            totalTokens: response.usage.totalTokens,
            promptChars: response.usage.promptChars,
            completionChars: response.usage.completionChars,
            estimatedCostUsd: response.usage.estimatedCostUsd ?? 0
          }
        : undefined;
    } catch {
      planText = buildHeuristicPlan(input.userPrompt);
    }

    const planMessage = await db.createMessage({
      sessionId: input.sessionId,
      conversationId: input.conversationId,
      runId: input.runId,
      role: "assistant",
      content: planText,
      attachments: []
    });

    await eventSink.publish({
      type: "assistant_message",
      runId: input.runId,
      sessionId: input.sessionId,
      conversationId: input.conversationId,
      timestamp: nowIso(),
      message: planMessage
    });

    return {
      conversationItems: [...conversationItems, toConversationItem(planMessage)],
      planText,
      usage
    };
  }

  async run(input: EngineRunInput) {
    const { db, registry, providerFactory, permissionEngine, approvalCoordinator, eventSink } =
      this.deps;
    let activeProviderName = input.settings.provider;
    let activeProvider = providerFactory.create(input.settings);
    let activeModel = input.settings.activeModel;
    const baseSystemPrompt = buildSystemPrompt(input.settings, input.selectedMeetingId);
    const persistedMessages = await db.listMessages(input.conversationId);
    const compressed = await this.buildConversationContext(input, persistedMessages);
    const systemPrompt = buildDynamicSystemPrompt(baseSystemPrompt, compressed.summaryText);
    let conversationItems = compressed.conversationItems;
    let cumulativeUsage: RunUsage | undefined;
    let warningRaised = false;

    const task = await db.createTask({
      sessionId: input.sessionId,
      title: input.userPrompt.slice(0, 80),
      description: input.userPrompt,
      status: "in_progress"
    });

    await db.createRun({
      id: input.runId,
      sessionId: input.sessionId,
      conversationId: input.conversationId,
      status: "running",
      provider: activeProviderName,
      model: activeModel,
      userPrompt: input.userPrompt,
      routingPolicy: input.settings.routingPolicy
    });

    const planned = await this.maybeCreatePlan(input, conversationItems, systemPrompt);
    conversationItems = planned.conversationItems;
    cumulativeUsage = accumulateUsage(cumulativeUsage, planned.usage);

    if (planned.planText) {
      await db.updateRun(input.runId, {
        plan: planned.planText,
        usage: cumulativeUsage
      });
    }

    await eventSink.publish({
      type: "run_started",
      runId: input.runId,
      sessionId: input.sessionId,
      conversationId: input.conversationId,
      timestamp: nowIso(),
      status: "running",
      message: `Using ${activeProvider.name} with model ${activeModel}.`
    });

    try {
      for (let step = 0; step < input.settings.maxToolSteps; step += 1) {
        await eventSink.publish({
          type: "status",
          runId: input.runId,
          sessionId: input.sessionId,
          conversationId: input.conversationId,
          timestamp: nowIso(),
          status: "running",
          message: `Reasoning step ${step + 1} of ${input.settings.maxToolSteps}.`
        });

        await input.services.audit.log({
          action: "provider_called",
          message: `Calling provider ${activeProvider.name}.`,
          sessionId: input.sessionId,
          conversationId: input.conversationId,
          runId: input.runId,
          entityType: "provider",
          entityId: activeProvider.name,
          payload: {
            model: activeModel,
            step: step + 1
          }
        });

        let turn;
        try {
          turn = await activeProvider.generate({
            model: activeModel,
            systemPrompt,
            messages: conversationItems,
            tools: registry.toModelDefinitions()
          });
        } catch (error) {
          const message = toErrorMessage(error);
          const fallback = shouldTryProviderFallback(message)
            ? providerFactory.createFallback(activeProviderName, input.settings)
            : null;

          if (!fallback) {
            throw error;
          }

          activeProviderName = fallback.providerName;
          activeProvider = fallback.provider;
          activeModel = fallback.model;

          await db.updateRun(input.runId, {
            provider: activeProviderName,
            model: activeModel,
            fallbackProvider: activeProviderName
          });

          await input.services.audit.log({
            action: "provider_called",
            message: `Primary provider failed, falling back to ${activeProviderName}.`,
            sessionId: input.sessionId,
            conversationId: input.conversationId,
            runId: input.runId,
            entityType: "provider",
            entityId: activeProviderName,
            payload: {
              previousProvider: input.settings.provider,
              error: message,
              model: activeModel,
              fallback: true
            }
          });

          await eventSink.publish({
            type: "status",
            runId: input.runId,
            sessionId: input.sessionId,
            conversationId: input.conversationId,
            timestamp: nowIso(),
            status: "running",
            message: `Primary provider failed, switching to ${activeProviderName}.`
          });

          turn = await activeProvider.generate({
            model: activeModel,
            systemPrompt,
            messages: conversationItems,
            tools: registry.toModelDefinitions()
          });
        }

        cumulativeUsage = accumulateUsage(cumulativeUsage, turn.usage);
        await db.updateRun(input.runId, {
          usage: cumulativeUsage,
          provider: activeProviderName,
          model: activeModel
        });

        if (
          cumulativeUsage &&
          !warningRaised &&
          cumulativeUsage.estimatedCostUsd >= input.settings.usageControls.warningCostUsd
        ) {
          warningRaised = true;
          await eventSink.publish({
            type: "status",
            runId: input.runId,
            sessionId: input.sessionId,
            conversationId: input.conversationId,
            timestamp: nowIso(),
            status: "running",
            message: `Usage warning: this run is at about $${cumulativeUsage.estimatedCostUsd.toFixed(3)}.`
          });
        }

        if (
          cumulativeUsage &&
          cumulativeUsage.estimatedCostUsd >= input.settings.usageControls.hardLimitCostUsd
        ) {
          if (activeProviderName !== "ollama") {
            const fallback = providerFactory.createFallback(activeProviderName, {
              ...input.settings,
              provider: activeProviderName
            });
            if (fallback?.providerName === "ollama") {
              activeProviderName = fallback.providerName;
              activeProvider = fallback.provider;
              activeModel = fallback.model;
              await eventSink.publish({
                type: "status",
                runId: input.runId,
                sessionId: input.sessionId,
                conversationId: input.conversationId,
                timestamp: nowIso(),
                status: "running",
                message: "Run budget reached. Switching to Ollama for lower-cost continuation."
              });
            } else {
              throw new Error(
                `Run budget limit reached at about $${cumulativeUsage.estimatedCostUsd.toFixed(3)}.`
              );
            }
          }
        }

        if (!turn.toolCalls.length) {
          const assistantText =
            turn.text.trim() ||
            "I completed the run, but there was no additional model text to show.";
          const assistantMessage = await db.createMessage({
            sessionId: input.sessionId,
            conversationId: input.conversationId,
            runId: input.runId,
            role: "assistant",
            content: assistantText,
            attachments: []
          });

          await db.createMemory({
            profileId: input.profileId,
            sessionId: input.sessionId,
            kind: "summary",
            content: assistantText,
            confidence: 0.45,
            source: "assistant_final"
          });
          await db.updateTask(task.id, {
            status: "completed",
            outcome: assistantText.slice(0, 500)
          });
          const completedRun = await db.updateRun(input.runId, {
            status: "completed",
            summary: assistantText.slice(0, 1200),
            usage: cumulativeUsage,
            provider: activeProviderName,
            model: activeModel
          });

          await eventSink.publish({
            type: "assistant_message",
            runId: input.runId,
            sessionId: input.sessionId,
            conversationId: input.conversationId,
            timestamp: nowIso(),
            message: assistantMessage
          });
          await eventSink.publish({
            type: "completed",
            runId: input.runId,
            sessionId: input.sessionId,
            conversationId: input.conversationId,
            timestamp: nowIso(),
            status: "completed",
            run: completedRun ?? undefined
          });
          return;
        }

        conversationItems.push({
          role: "assistant",
          content: turn.text,
          toolCalls: turn.toolCalls
        });

        for (const requestedToolCall of turn.toolCalls) {
          const tool = registry.mustGet(requestedToolCall.name);
          const parsedInput = tool.schema.parse(requestedToolCall.input) as Record<string, unknown>;
          const inputSummary =
            tool.summariseInput?.(parsedInput as never) ?? JSON.stringify(parsedInput);

          let toolCall = await db.createToolCall({
            sessionId: input.sessionId,
            conversationId: input.conversationId,
            runId: input.runId,
            toolName: requestedToolCall.name,
            permissionCategory: tool.permissionCategory,
            status: "pending_approval",
            input: parsedInput,
            summary: inputSummary,
            provider: activeProviderName
          });

          await input.services.audit.log({
            action: "tool_requested",
            message: `Tool requested: ${requestedToolCall.name}`,
            sessionId: input.sessionId,
            conversationId: input.conversationId,
            runId: input.runId,
            entityType: "tool_call",
            entityId: toolCall.id,
            payload: {
              toolName: requestedToolCall.name,
              input: parsedInput
            }
          });

          const approvalDecision = permissionEngine.evaluate(
            tool,
            parsedInput,
            input.settings,
            input.services.workingDirectory
          );

          if (approvalDecision.requiresApproval) {
            const approval = await db.createApproval({
              sessionId: input.sessionId,
              conversationId: input.conversationId,
              runId: input.runId,
              toolCallId: toolCall.id,
              toolName: requestedToolCall.name,
              permissionCategory: tool.permissionCategory,
              status: "pending",
              reason: approvalDecision.reason,
              inputSummary
            });

            toolCall = (await db.updateToolCall(toolCall.id, {
              approvalId: approval.id
            })) as ToolCallRecord;

            await db.updateRun(input.runId, {
              status: "waiting_approval"
            });

            await input.services.audit.log({
              action: "approval_requested",
              message: `Approval requested for ${requestedToolCall.name}.`,
              sessionId: input.sessionId,
              conversationId: input.conversationId,
              runId: input.runId,
              entityType: "approval",
              entityId: approval.id,
              payload: {
                toolName: requestedToolCall.name
              }
            });

            await eventSink.publish({
              type: "tool_pending_approval",
              runId: input.runId,
              sessionId: input.sessionId,
              conversationId: input.conversationId,
              timestamp: nowIso(),
              approval,
              toolCall
            });

            const resolution = await approvalCoordinator.requestApproval({ approval });

            await db.updateRun(input.runId, {
              status: "running"
            });

            if (!resolution.approved) {
              const deniedToolCall = (await db.updateToolCall(toolCall.id, {
                status: "denied",
                error: resolution.approval.note ?? "Tool call denied by user."
              })) as ToolCallRecord;

              conversationItems.push({
                role: "tool",
                toolName: deniedToolCall.toolName,
                toolCallId: requestedToolCall.id,
                content: JSON.stringify({
                  denied: true,
                  reason: resolution.approval.note ?? resolution.approval.reason
                })
              });

              await eventSink.publish({
                type: "tool_denied",
                runId: input.runId,
                sessionId: input.sessionId,
                conversationId: input.conversationId,
                timestamp: nowIso(),
                toolCall: deniedToolCall,
                approval: resolution.approval
              });

              continue;
            }

            toolCall = (await db.updateToolCall(toolCall.id, {
              status: "approved"
            })) as ToolCallRecord;

            await eventSink.publish({
              type: "tool_approved",
              runId: input.runId,
              sessionId: input.sessionId,
              conversationId: input.conversationId,
              timestamp: nowIso(),
              toolCall,
              approval: resolution.approval
            });
          } else {
            toolCall = (await db.updateToolCall(toolCall.id, {
              status: "approved"
            })) as ToolCallRecord;
          }

          toolCall = (await db.updateToolCall(toolCall.id, {
            status: "running"
          })) as ToolCallRecord;

          await eventSink.publish({
            type: "tool_started",
            runId: input.runId,
            sessionId: input.sessionId,
            conversationId: input.conversationId,
            timestamp: nowIso(),
            toolCall
          });

          try {
            const outcome = await registry.execute(requestedToolCall.name, parsedInput, {
              services: input.services,
              sessionId: input.sessionId,
              conversationId: input.conversationId,
              runId: input.runId,
              toolCallId: toolCall.id
            });

            const successfulToolCall = (await db.updateToolCall(toolCall.id, {
              status: "success",
              result: outcome.result.output,
              summary: outcome.result.summary
            })) as ToolCallRecord;

            const toolMessage = await db.createMessage({
              sessionId: input.sessionId,
              conversationId: input.conversationId,
              runId: input.runId,
              role: "tool",
              content: JSON.stringify(outcome.result.output),
              attachments: [],
              toolName: requestedToolCall.name,
              toolCallId: requestedToolCall.id
            });

            conversationItems.push({
              role: "tool",
              toolName: requestedToolCall.name,
              toolCallId: requestedToolCall.id,
              content: JSON.stringify(outcome.result.output)
            });

            await input.services.audit.log({
              action: "tool_succeeded",
              message: `Tool succeeded: ${requestedToolCall.name}`,
              sessionId: input.sessionId,
              conversationId: input.conversationId,
              runId: input.runId,
              entityType: "tool_call",
              entityId: successfulToolCall.id,
              payload: {
                result: outcome.result.output
              }
            });

            await eventSink.publish({
              type: "tool_result",
              runId: input.runId,
              sessionId: input.sessionId,
              conversationId: input.conversationId,
              timestamp: nowIso(),
              toolCall: successfulToolCall,
              message: toolMessage
            });
          } catch (error) {
            const message = toErrorMessage(error);
            const failedToolCall = (await db.updateToolCall(toolCall.id, {
              status: "failed",
              error: message
            })) as ToolCallRecord;

            const toolMessage = await db.createMessage({
              sessionId: input.sessionId,
              conversationId: input.conversationId,
              runId: input.runId,
              role: "tool",
              content: JSON.stringify({
                error: message
              }),
              attachments: [],
              toolName: requestedToolCall.name,
              toolCallId: requestedToolCall.id
            });

            conversationItems.push({
              role: "tool",
              toolName: requestedToolCall.name,
              toolCallId: requestedToolCall.id,
              content: JSON.stringify({
                error: message
              })
            });

            await input.services.audit.log({
              action: "tool_failed",
              message: `Tool failed: ${requestedToolCall.name}`,
              sessionId: input.sessionId,
              conversationId: input.conversationId,
              runId: input.runId,
              entityType: "tool_call",
              entityId: failedToolCall.id,
              payload: {
                error: message
              }
            });

            await eventSink.publish({
              type: "tool_result",
              runId: input.runId,
              sessionId: input.sessionId,
              conversationId: input.conversationId,
              timestamp: nowIso(),
              toolCall: failedToolCall,
              message: toolMessage
            });
          }
        }
      }

      throw new Error(
        `Reached the max reasoning limit of ${input.settings.maxToolSteps} step(s) without producing a final answer.`
      );
    } catch (error) {
      const message = toErrorMessage(error);
      await db.updateTask(task.id, {
        status: "blocked",
        outcome: message
      });
      const failedRun = await db.updateRun(input.runId, {
        status: "failed",
        error: message,
        usage: cumulativeUsage,
        provider: activeProviderName,
        model: activeModel
      });
      await input.services.audit.log({
        action: "error",
        message: "Agent execution failed.",
        sessionId: input.sessionId,
        conversationId: input.conversationId,
        runId: input.runId,
        entityType: "run",
        entityId: input.runId,
        payload: {
          error: message
        }
      });

      await eventSink.publish({
        type: "error",
        runId: input.runId,
        sessionId: input.sessionId,
        conversationId: input.conversationId,
        timestamp: nowIso(),
        error: message
      });
      await eventSink.publish({
        type: "completed",
        runId: input.runId,
        sessionId: input.sessionId,
        conversationId: input.conversationId,
        timestamp: nowIso(),
        status: "failed" satisfies RunStatus,
        run: failedRun ?? undefined
      });
    }
  }
}

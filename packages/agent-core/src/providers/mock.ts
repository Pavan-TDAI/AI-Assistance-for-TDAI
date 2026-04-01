import { createId } from "@personal-ai/shared";

import type {
  GenerateTurnInput,
  GenerateTurnOutput,
  ProviderConversationItem,
  ProviderToolCall
} from "../types.js";

const extractQuotedText = (value: string) => {
  const match = value.match(/"([^"]+)"/);
  return match?.[1];
};

const inferToolCall = (message: string): ProviderToolCall | null => {
  const lower = message.toLowerCase();
  const emailMatch = message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);

  if (lower.includes("list") && (lower.includes("files") || lower.includes("folders"))) {
    return {
      id: createId("call"),
      name: "filesystem.list",
      input: {
        path: extractQuotedText(message),
        recursive: lower.includes("recursive"),
        maxDepth: lower.includes("recursive") ? 3 : 1,
        limit: 50
      }
    };
  }

  if (lower.includes("search") && lower.includes("file")) {
    const query =
      extractQuotedText(message) ?? message.split("for").at(-1)?.trim() ?? "document";
    return {
      id: createId("call"),
      name: "filesystem.search",
      input: {
        query,
        limit: 50
      }
    };
  }

  if (lower.includes("read") && lower.includes("file")) {
    const filePath = extractQuotedText(message);
    if (filePath) {
      return {
        id: createId("call"),
        name: "filesystem.read",
        input: {
          path: filePath
        }
      };
    }
  }

  const urlMatch = message.match(/https?:\/\/[^\s]+/i);
  if ((lower.includes("browser") || lower.includes("open url")) && urlMatch?.[0]) {
    return {
      id: createId("call"),
      name: "browser.navigate",
      input: {
        url: urlMatch[0]
      }
    };
  }

  if (lower.includes("open vscode")) {
    return {
      id: createId("call"),
      name: "system.open_app",
      input: {
        target: "code"
      }
    };
  }

  if (lower.includes("meeting") && lower.includes("list")) {
    return {
      id: createId("call"),
      name: "meetings.list",
      input: {
        limit: 5
      }
    };
  }

  if ((lower.includes("mom") || lower.includes("minutes")) && lower.includes("generate")) {
    return {
      id: createId("call"),
      name: "meetings.generate_mom",
      input: {
        includeEmailDraft: true
      }
    };
  }

  if ((lower.includes("mom") || lower.includes("minutes")) && lower.includes("draft")) {
    return {
      id: createId("call"),
      name: "meetings.draft_email",
      input: {
        to: emailMatch?.[0] ? [emailMatch[0]] : undefined
      }
    };
  }

  if ((lower.includes("mom") || lower.includes("minutes")) && lower.includes("send")) {
    return {
      id: createId("call"),
      name: "meetings.send_email",
      input: {
        to: emailMatch?.[0] ? [emailMatch[0]] : undefined
      }
    };
  }

  if (
    lower.includes("wbr") ||
    lower.includes("weekly business report") ||
    lower.includes("pending blockers") ||
    lower.includes("resolved blockers") ||
    lower.includes("completed vs pending") ||
    lower.includes("daily updates") ||
    lower.includes("today's extracted updates") ||
    lower.includes("todays extracted updates")
  ) {
    return {
      id: createId("call"),
      name: "reports.query_table",
      input: {
        query: message
      }
    };
  }

  if (
    lower.includes("campaign") ||
    lower.includes("customer outreach") ||
    lower.includes("email campaign")
  ) {
    return {
      id: createId("call"),
      name: "workflow.generate_campaign",
      input: {
        brief: message,
        goals: ["Generate outreach messaging", "Prepare a reusable campaign draft"]
      }
    };
  }

  if (
    lower.includes("proposal") ||
    lower.includes("benchmark") ||
    lower.includes("market benchmarking")
  ) {
    return {
      id: createId("call"),
      name: "workflow.generate_proposal",
      input: {
        prompt: message
      }
    };
  }

  if (
    lower.includes("digital transformation") ||
    lower.includes("solution") ||
    lower.includes("tdai")
  ) {
    return {
      id: createId("call"),
      name: "workflow.generate_solution",
      input: {
        prompt: message
      }
    };
  }

  if (lower.includes("list artifacts") || lower.includes("show artifacts")) {
    return {
      id: createId("call"),
      name: "workflow.list_artifacts",
      input: {
        limit: 8
      }
    };
  }

  return null;
};

const summariseToolContent = (item: ProviderConversationItem) => {
  try {
    const parsed = JSON.parse(item.content) as Record<string, unknown>;

    if (item.toolName === "filesystem.list") {
      const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
      return `I listed ${entries.length} item(s). Here are a few: ${entries
        .slice(0, 5)
        .map((entry) => String((entry as { path?: string }).path ?? ""))
        .filter(Boolean)
        .join(", ")}.`;
    }

    if (item.toolName === "filesystem.search") {
      const matches = Array.isArray(parsed.matches) ? parsed.matches : [];
      return `I found ${matches.length} matching file(s). ${matches
        .slice(0, 6)
        .map((match) => String(match))
        .join(", ")}`;
    }

    if (item.toolName === "filesystem.read") {
      return `I read the file. Preview:\n\n${String(parsed.content ?? "").slice(0, 1200)}`;
    }

    if (item.toolName === "meetings.list") {
      const meetings = Array.isArray(parsed.meetings) ? parsed.meetings : [];
      return `I found ${meetings.length} recent meeting(s). ${meetings
        .map((meeting) => String((meeting as { title?: string }).title ?? "Untitled meeting"))
        .join(", ")}`;
    }

    if (item.toolName === "meetings.generate_mom") {
      return `I generated the meeting MoM. ${
        String(parsed.summary ?? "").slice(0, 500) || "The structured minutes are ready."
      }`;
    }

    if (item.toolName === "meetings.draft_email") {
      return "I created the MoM draft email for the selected meeting.";
    }

    if (item.toolName === "meetings.send_email") {
      return "I sent the MoM email for the selected meeting.";
    }

    if (item.toolName === "reports.query_table") {
      const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
      return `I generated the "${String(parsed.title ?? "report")}" table with ${rows.length} row(s).`;
    }

    if (item.toolName === "reports.ingest_update_email") {
      const update = parsed.update as { employeeName?: string } | undefined;
      return `I processed the update email for ${String(update?.employeeName ?? "the employee")}.`;
    }

    if (item.toolName === "reports.sync_update_emails") {
      return `I synced ${String(parsed.syncedCount ?? 0)} update email(s) and skipped ${String(
        parsed.skippedCount ?? 0
      )}.`;
    }

    if (
      item.toolName === "workflow.generate_campaign" ||
      item.toolName === "workflow.generate_proposal" ||
      item.toolName === "workflow.generate_solution"
    ) {
      const artifact = parsed.artifact as { title?: string; kind?: string } | undefined;
      return `I generated the ${String(artifact?.kind ?? "workflow")} artifact "${String(
        artifact?.title ?? "Untitled artifact"
      )}".`;
    }

    if (item.toolName === "workflow.list_artifacts") {
      const artifacts = Array.isArray(parsed.artifacts) ? parsed.artifacts : [];
      return `I found ${artifacts.length} stored workflow artifact(s).`;
    }

    if (
      item.toolName === "workflow.draft_artifact_email" ||
      item.toolName === "workflow.send_artifact_email"
    ) {
      const artifact = parsed.artifact as { title?: string } | undefined;
      return item.toolName === "workflow.send_artifact_email"
        ? `I sent the artifact "${String(artifact?.title ?? "artifact")}" by email.`
        : `I created an email draft for "${String(artifact?.title ?? "artifact")}".`;
    }

    if (item.toolName?.startsWith("browser.")) {
      return `The browser action finished successfully. ${JSON.stringify(parsed)}`;
    }

    if (item.toolName === "system.open_app") {
      return "I opened the requested application or file.";
    }
  } catch {
    return `The ${item.toolName ?? "tool"} step finished.`;
  }

  return `The ${item.toolName ?? "tool"} step finished.`;
};

const usageForText = (input: GenerateTurnInput, text: string) => ({
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  promptChars: JSON.stringify(input.messages).length + input.systemPrompt.length,
  completionChars: text.length,
  estimatedCostUsd: 0
});

export class MockProvider {
  readonly name = "mock";

  async generate(input: GenerateTurnInput): Promise<GenerateTurnOutput> {
    const latest = input.messages.at(-1);

    if (!latest) {
      const text =
        "Mock mode is active. Ask me to list files, search for files, read a quoted file path, open VS Code, or open a URL to test the approval flow locally.";
      return {
        text,
        toolCalls: [],
        usage: usageForText(input, text)
      };
    }

    if (latest.role === "tool") {
      const text = summariseToolContent(latest);
      return {
        text,
        toolCalls: [],
        usage: usageForText(input, text)
      };
    }

    if (latest.role === "user") {
      const toolCall = inferToolCall(latest.content);
      if (toolCall) {
        return {
          text: "",
          toolCalls: [toolCall],
          usage: usageForText(input, "")
        };
      }

      const text =
        "Mock mode is active, so deeper reasoning is limited until you add an OpenAI, Gemini, or Ollama model. The local platform is still working, and you can already test sessions, approvals, settings, audit logs, and simple file or browser actions.";
      return {
        text,
        toolCalls: [],
        usage: usageForText(input, text)
      };
    }

    const text = "Mock mode is active.";
    return {
      text,
      toolCalls: [],
      usage: usageForText(input, text)
    };
  }
}

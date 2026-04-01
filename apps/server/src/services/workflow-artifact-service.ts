import fs from "node:fs/promises";
import path from "node:path";

import type { ProviderFactory } from "@personal-ai/agent-core";
import type { AgentDatabase } from "@personal-ai/db";
import {
  DraftArtifactEmailRequestSchema,
  GenerateCampaignArtifactRequestSchema,
  GenerateProposalArtifactRequestSchema,
  GenerateSolutionArtifactRequestSchema,
  ListWorkflowArtifactsRequestSchema,
  createId,
  nowIso,
  type DraftArtifactEmailRequest,
  type GenerateCampaignArtifactRequest,
  type GenerateProposalArtifactRequest,
  type GenerateSolutionArtifactRequest,
  type ListWorkflowArtifactsRequest,
  type WorkflowArtifactKind,
  type WorkflowArtifactRecord,
  type WorkflowArtifactSection
} from "@personal-ai/shared";

import type { AuditLogService } from "./audit-log-service.js";
import type { SettingsService } from "./settings-service.js";

interface MailConnectorLike {
  createDraft(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  sendMessage(input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

interface ArtifactGenerationResult {
  title: string;
  summary: string;
  sections: WorkflowArtifactSection[];
  generatedContent: Record<string, unknown>;
}

interface ArtifactEmailResult {
  artifact: WorkflowArtifactRecord;
  email: {
    to: string[];
    subject: string;
    body: string;
  };
  draftId?: string;
  sent?: boolean;
}

const decodePdfEscapes = (value: string) =>
  value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\([()\\])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

const extractPdfPreviewFromBinary = (buffer: Buffer, maxLength: number) => {
  const raw = buffer.toString("latin1");
  const textChunks = [
    ...Array.from(raw.matchAll(/\(([^()]*)\)\s*Tj/g), (match) => decodePdfEscapes(match[1] ?? "")),
    ...Array.from(raw.matchAll(/\[(.*?)\]\s*TJ/gs), (match) =>
      Array.from((match[1] ?? "").matchAll(/\(([^()]*)\)/g), (group) =>
        decodePdfEscapes(group[1] ?? "")
      ).join(" ")
    )
  ]
    .map((chunk) => chunk.replace(/\s+/g, " ").trim())
    .filter((chunk) => chunk.length > 3);

  return [...new Set(textChunks)].join("\n").slice(0, maxLength).trim();
};

const extractJsonObject = (value: string) => {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  try {
    return JSON.parse(value.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const sectionBody = (value: unknown) =>
  String(value ?? "")
    .replace(/\r/g, "")
    .trim();

const coerceSections = (value: unknown, fallback: WorkflowArtifactSection[]) => {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const sections = value
    .map((entry) => {
      const candidate = entry as Record<string, unknown>;
      const title = String(candidate.title ?? "").trim();
      const body = sectionBody(candidate.body);
      if (!title || !body) {
        return null;
      }
      return {
        title,
        body
      } satisfies WorkflowArtifactSection;
    })
    .filter((entry): entry is WorkflowArtifactSection => Boolean(entry));

  return sections.length ? sections : fallback;
};

const formatSources = (attachmentSummaries: string[], researchNotes: string[]) => {
  const lines: string[] = [];
  if (attachmentSummaries.length) {
    lines.push("Source files:");
    lines.push(...attachmentSummaries.map((entry) => `- ${entry}`));
  }
  if (researchNotes.length) {
    lines.push("Research notes:");
    lines.push(...researchNotes.map((entry) => `- ${entry}`));
  }
  return lines.join("\n");
};

const fallbackCampaignResult = (
  input: GenerateCampaignArtifactRequest,
  sourceDigest: string
): ArtifactGenerationResult => {
  const goals = input.goals.length
    ? input.goals.map((goal) => `- ${goal}`).join("\n")
    : "- Build qualified interest\n- Drive replies or discovery calls";
  const audience = input.audience?.trim() || "TDAI target accounts and stakeholders";
  const sequenceSteps = [
    "1. Prepare segmented recipient list and personalize the opener.",
    "2. Send a concise value-led first email with one clear CTA.",
    "3. Follow up with a proof point or benchmark after 2 to 3 business days.",
    "4. Offer a short discovery meeting and capture objections for refinement."
  ].join("\n");
  const draftBody = [
    "Hello [Name],",
    "",
    "I’m reaching out because your team may benefit from a focused modernization initiative.",
    "TDAI can help streamline manual workflows, improve reporting visibility, and accelerate execution with AI-assisted operations.",
    "",
    "If useful, I can share a short tailored recommendation or set up a quick discussion.",
    "",
    "Regards,",
    "TDAI"
  ].join("\n");

  return {
    title: input.campaignTitle?.trim() || "Customer Outreach Campaign",
    summary: `Prepared a campaign brief for ${audience} with reusable sequencing and draft outreach content.`,
    sections: [
      {
        title: "Campaign Brief",
        body: `Brief:\n${input.brief.trim()}\n\nGoals:\n${goals}`
      },
      {
        title: "Audience Segmentation",
        body: `Primary audience:\n- ${audience}\n\nRecommended segmentation:\n- Decision-makers\n- Process owners\n- Innovation stakeholders`
      },
      {
        title: "Sequence Steps",
        body: sequenceSteps
      },
      {
        title: "Draft Outreach Email",
        body: draftBody
      },
      {
        title: "Supporting Context",
        body: sourceDigest || "No uploaded files or research notes were attached."
      }
    ],
    generatedContent: {
      goals: input.goals,
      audience,
      sequenceLength: 4,
      sendCandidates: input.to
    }
  };
};

const fallbackProposalResult = (
  input: GenerateProposalArtifactRequest,
  sourceDigest: string
): ArtifactGenerationResult => ({
  title: input.title?.trim() || "Project Proposal with Market Benchmarking",
  summary:
    "Prepared a proposal structure with benchmark framing, value proposition, phased delivery, and commercial placeholders.",
  sections: [
    {
      title: "Executive Summary",
      body: `Proposal request:\n${input.prompt.trim()}`
    },
    {
      title: "Market Benchmarking",
      body: [
        "Benchmark approach:",
        "- Compare peer solutions by implementation speed, reporting depth, automation scope, and operational adoption.",
        "- Highlight where TDAI can differentiate through integrated AI workflows and execution visibility.",
        sourceDigest ? `\nSupporting references:\n${sourceDigest}` : ""
      ].join("\n")
    },
    {
      title: "Value Proposition",
      body:
        "- Faster reporting and execution visibility\n- Reduced manual coordination effort\n- Better decision support with AI-assisted workflows"
    },
    {
      title: "Scope and Deliverables",
      body:
        "- Discovery and current-state assessment\n- Target workflow design\n- Implementation roadmap\n- Reporting, automation, and adoption support"
    },
    {
      title: "Timeline and Risks",
      body:
        "Suggested phases:\n1. Discovery\n2. Prototype\n3. Rollout\n4. Stabilization\n\nKey risks:\n- Data readiness\n- Change management\n- Integration dependencies"
    },
    {
      title: "Commercial Assumptions",
      body:
        "- Pricing to be finalized after scope validation\n- Assumes timely stakeholder access and source-system availability"
    }
  ],
  generatedContent: {
    benchmarkCategories: [
      "implementation_speed",
      "reporting_depth",
      "automation_scope",
      "adoption_enablement"
    ]
  }
});

const fallbackSolutionResult = (
  input: GenerateSolutionArtifactRequest,
  sourceDigest: string
): ArtifactGenerationResult => ({
  title: input.title?.trim() || "TDAI Digital Transformation Solution Blueprint",
  summary:
    "Prepared a digital transformation blueprint for TDAI covering current state, pain points, target architecture, rollout phases, and KPI guidance.",
  sections: [
    {
      title: "Current-State Summary",
      body: input.prompt.trim()
    },
    {
      title: "Pain Points",
      body:
        "- Fragmented reporting\n- Manual follow-up effort\n- Limited visibility into blockers and execution status\n- Inconsistent knowledge capture"
    },
    {
      title: "Recommended Solution Architecture",
      body:
        "- Central AI assistant for chat-first task execution\n- Structured reporting and artifact storage layer\n- Connector layer for email, calendar, files, and research\n- Role-aware access for employees, managers, and admins"
    },
    {
      title: "Phased Rollout",
      body:
        "1. Reporting and assistant foundation\n2. Workflow automation and approvals\n3. Proposal/campaign/solution copilots\n4. Governance, analytics, and optimization"
    },
    {
      title: "KPIs and Dependencies",
      body:
        "KPIs:\n- Time saved on reporting\n- Blocker resolution speed\n- Proposal turnaround time\n- Outreach response rate\n\nDependencies:\n- Mailbox access\n- Stakeholder alignment\n- Source-system readiness"
    },
    {
      title: "Risks and Executive Summary",
      body: [
        "Risks:",
        "- Adoption fatigue",
        "- Access and connector limitations",
        "- Incomplete source data",
        "",
        "Executive summary:",
        "TDAI can use a chat-first operating layer to automate repetitive coordination, improve reporting quality, and accelerate transformation planning."
      ].join("\n")
    },
    {
      title: "Supporting Context",
      body: sourceDigest || "No uploaded files or research notes were attached."
    }
  ],
  generatedContent: {
    targetOrganization: "TDAI",
    rolloutPhases: 4
  }
});

export class WorkflowArtifactService {
  constructor(
    private readonly db: AgentDatabase,
    private readonly audit: AuditLogService,
    private readonly settingsService: SettingsService,
    private readonly providerFactory: ProviderFactory,
    private readonly gmail: MailConnectorLike
  ) {}

  private async requireSessionProfile(sessionId: string) {
    const session = await this.db.getSession(sessionId);
    if (!session) {
      throw new Error("Session not found.");
    }

    return session;
  }

  private async resolveSourceMessageId(conversationId: string) {
    const messages = await this.db.listMessages(conversationId);
    return [...messages].reverse().find((message) => message.role === "user")?.id;
  }

  private async readSourceFiles(pathsToRead: string[]) {
    const summaries: string[] = [];

    for (const entry of pathsToRead.slice(0, 6)) {
      try {
        const absolutePath = path.resolve(entry);
        const buffer = await fs.readFile(absolutePath);
        const extension = path.extname(absolutePath).toLowerCase();
        const preview =
          extension === ".pdf"
            ? extractPdfPreviewFromBinary(buffer, 2400)
            : extension === ".docx"
              ? "DOCX file attached. Text preview is not directly available yet."
              : buffer.toString("utf8").replace(/\u0000/g, "").slice(0, 2400).trim();

        summaries.push(
          `${path.basename(absolutePath)} (${absolutePath})${preview ? `\n${preview}` : ""}`
        );
      } catch (error) {
        summaries.push(
          `${path.basename(entry)} (${entry})\nCould not read the file: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    return summaries;
  }

  private async generateWithLlm(
    kind: WorkflowArtifactKind,
    prompt: string,
    preferredTitle: string | undefined,
    sourceDigest: string
  ) {
    const settings = await this.settingsService.getSettings();
    const drafting = this.providerFactory.createDraftingProvider(settings);

    try {
      const response = await drafting.provider.generate({
        model: drafting.model,
        systemPrompt: [
          "You generate structured business workflow artifacts for a local-first AI work assistant.",
          `Artifact kind: ${kind}.`,
          "Return strict JSON with keys: title, summary, sections, generatedContent.",
          "sections must be an array of objects with title and body.",
          "Keep section bodies practical, polished, and directly reusable by managers.",
          "Use concise bullet-heavy prose where useful, but keep each body a plain text string."
        ].join("\n"),
        messages: [
          {
            role: "user",
            content: JSON.stringify(
              {
                preferredTitle,
                prompt,
                sourceDigest
              },
              null,
              2
            )
          }
        ],
        tools: []
      });

      return extractJsonObject(response.text);
    } catch {
      return null;
    }
  }

  private async createArtifactRecord(input: {
    sessionId: string;
    conversationId: string;
    kind: WorkflowArtifactKind;
    title: string;
    prompt: string;
    sourceReferences: string[];
    generated: ArtifactGenerationResult;
  }) {
    const session = await this.requireSessionProfile(input.sessionId);
    const sourceMessageId = await this.resolveSourceMessageId(input.conversationId);

    const artifact = await this.db.createWorkflowArtifact({
      profileId: session.profileId,
      sessionId: input.sessionId,
      sourceMessageId,
      kind: input.kind,
      status: "ready",
      title: input.title,
      prompt: input.prompt,
      summary: input.generated.summary,
      sourceReferences: input.sourceReferences,
      sections: input.generated.sections,
      generatedContent: input.generated.generatedContent,
      approvalIds: []
    });

    await this.audit.log({
      action: "artifact_generated",
      sessionId: input.sessionId,
      conversationId: input.conversationId,
      entityType: "workflow_artifact",
      entityId: artifact.id,
      message: `Generated ${input.kind} artifact "${artifact.title}"`,
      payload: {
        kind: input.kind,
        sourceReferenceCount: input.sourceReferences.length
      }
    });

    return artifact;
  }

  async listArtifacts(
    sessionId: string,
    payload: ListWorkflowArtifactsRequest
  ): Promise<WorkflowArtifactRecord[]> {
    const session = await this.requireSessionProfile(sessionId);
    const request = ListWorkflowArtifactsRequestSchema.parse(payload);
    return this.db.listWorkflowArtifacts(
      {
        profileId: session.profileId,
        ...(request.kind ? { kind: request.kind } : {})
      },
      request.limit
    );
  }

  async generateCampaignArtifact(
    sessionId: string,
    conversationId: string,
    payload: GenerateCampaignArtifactRequest
  ) {
    const request = GenerateCampaignArtifactRequestSchema.parse(payload);
    const sourceFiles = await this.readSourceFiles(request.attachmentPaths);
    const sourceDigest = formatSources(sourceFiles, request.researchNotes);
    const fallback = fallbackCampaignResult(request, sourceDigest);
    const generatedPayload = await this.generateWithLlm(
      "campaign",
      request.brief,
      request.campaignTitle,
      sourceDigest
    );

    const generated: ArtifactGenerationResult = generatedPayload
      ? {
          title: String(generatedPayload.title ?? fallback.title),
          summary: String(generatedPayload.summary ?? fallback.summary),
          sections: coerceSections(generatedPayload.sections, fallback.sections),
          generatedContent:
            generatedPayload.generatedContent && typeof generatedPayload.generatedContent === "object"
              ? (generatedPayload.generatedContent as Record<string, unknown>)
              : fallback.generatedContent
        }
      : fallback;

    return this.createArtifactRecord({
      sessionId,
      conversationId,
      kind: "campaign",
      title: generated.title,
      prompt: request.brief,
      sourceReferences: [...request.attachmentPaths, ...request.researchNotes],
      generated
    });
  }

  async generateProposalArtifact(
    sessionId: string,
    conversationId: string,
    payload: GenerateProposalArtifactRequest
  ) {
    const request = GenerateProposalArtifactRequestSchema.parse(payload);
    const sourceFiles = await this.readSourceFiles(request.attachmentPaths);
    const sourceDigest = formatSources(sourceFiles, request.researchNotes);
    const fallback = fallbackProposalResult(request, sourceDigest);
    const generatedPayload = await this.generateWithLlm(
      "proposal",
      request.prompt,
      request.title,
      sourceDigest
    );

    const generated: ArtifactGenerationResult = generatedPayload
      ? {
          title: String(generatedPayload.title ?? fallback.title),
          summary: String(generatedPayload.summary ?? fallback.summary),
          sections: coerceSections(generatedPayload.sections, fallback.sections),
          generatedContent:
            generatedPayload.generatedContent && typeof generatedPayload.generatedContent === "object"
              ? (generatedPayload.generatedContent as Record<string, unknown>)
              : fallback.generatedContent
        }
      : fallback;

    return this.createArtifactRecord({
      sessionId,
      conversationId,
      kind: "proposal",
      title: generated.title,
      prompt: request.prompt,
      sourceReferences: [...request.attachmentPaths, ...request.researchNotes],
      generated
    });
  }

  async generateSolutionArtifact(
    sessionId: string,
    conversationId: string,
    payload: GenerateSolutionArtifactRequest
  ) {
    const request = GenerateSolutionArtifactRequestSchema.parse(payload);
    const sourceFiles = await this.readSourceFiles(request.attachmentPaths);
    const sourceDigest = formatSources(sourceFiles, request.researchNotes);
    const fallback = fallbackSolutionResult(request, sourceDigest);
    const generatedPayload = await this.generateWithLlm(
      "solution",
      request.prompt,
      request.title,
      sourceDigest
    );

    const generated: ArtifactGenerationResult = generatedPayload
      ? {
          title: String(generatedPayload.title ?? fallback.title),
          summary: String(generatedPayload.summary ?? fallback.summary),
          sections: coerceSections(generatedPayload.sections, fallback.sections),
          generatedContent:
            generatedPayload.generatedContent && typeof generatedPayload.generatedContent === "object"
              ? (generatedPayload.generatedContent as Record<string, unknown>)
              : fallback.generatedContent
        }
      : fallback;

    return this.createArtifactRecord({
      sessionId,
      conversationId,
      kind: "solution",
      title: generated.title,
      prompt: request.prompt,
      sourceReferences: [...request.attachmentPaths, ...request.researchNotes],
      generated
    });
  }

  private buildArtifactEmail(artifact: WorkflowArtifactRecord, input: DraftArtifactEmailRequest) {
    const subject =
      input.subject?.trim() ||
      `${artifact.kind.charAt(0).toUpperCase()}${artifact.kind.slice(1)}: ${artifact.title}`;
    const body = [
      artifact.summary ?? `Please review the attached ${artifact.kind} artifact summary below.`,
      "",
      ...artifact.sections.flatMap((section) => [section.title, section.body, ""])
    ]
      .join("\n")
      .trim();

    return {
      to: input.to,
      subject,
      body
    };
  }

  async draftArtifactEmail(
    sessionId: string,
    payload: DraftArtifactEmailRequest
  ): Promise<ArtifactEmailResult> {
    const session = await this.requireSessionProfile(sessionId);
    const request = DraftArtifactEmailRequestSchema.parse(payload);
    const artifact = await this.db.getWorkflowArtifact(request.artifactId);
    if (!artifact || artifact.profileId !== session.profileId) {
      throw new Error("Workflow artifact not found.");
    }
    if (!request.to.length) {
      throw new Error("Add at least one recipient email before drafting the artifact email.");
    }

    const email = this.buildArtifactEmail(artifact, request);
    const draft = await this.gmail.createDraft(email);

    await this.audit.log({
      action: "artifact_emailed",
      sessionId,
      entityType: "workflow_artifact",
      entityId: artifact.id,
      message: `Created email draft for artifact "${artifact.title}"`,
      payload: {
        to: request.to,
        draftId: String(draft.id ?? createId("artifact_draft"))
      }
    });

    return {
      artifact,
      email,
      draftId: String(draft.id ?? createId("artifact_draft"))
    };
  }

  async sendArtifactEmail(
    sessionId: string,
    payload: DraftArtifactEmailRequest
  ): Promise<ArtifactEmailResult> {
    const session = await this.requireSessionProfile(sessionId);
    const request = DraftArtifactEmailRequestSchema.parse(payload);
    const artifact = await this.db.getWorkflowArtifact(request.artifactId);
    if (!artifact || artifact.profileId !== session.profileId) {
      throw new Error("Workflow artifact not found.");
    }
    if (!request.to.length) {
      throw new Error("Add at least one recipient email before sending the artifact.");
    }

    const email = this.buildArtifactEmail(artifact, request);
    await this.gmail.sendMessage(email);

    const updated = await this.db.updateWorkflowArtifact(artifact.id, {
      status: "sent",
      sentAt: nowIso()
    });

    await this.audit.log({
      action: "artifact_emailed",
      sessionId,
      entityType: "workflow_artifact",
      entityId: artifact.id,
      message: `Sent artifact "${artifact.title}" by email`,
      payload: {
        to: request.to
      }
    });

    return {
      artifact: updated ?? artifact,
      email,
      sent: true
    };
  }
}

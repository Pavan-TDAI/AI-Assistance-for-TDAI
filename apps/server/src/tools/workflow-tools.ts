import type { ToolDefinition, ToolExecutionContext } from "@personal-ai/tool-registry";
import {
  DraftArtifactEmailRequestSchema,
  GenerateCampaignArtifactRequestSchema,
  GenerateProposalArtifactRequestSchema,
  GenerateSolutionArtifactRequestSchema,
  ListWorkflowArtifactsRequestSchema
} from "@personal-ai/shared";

import type { WorkflowArtifactService } from "../services/workflow-artifact-service.js";

const requireManagerAccess = async (context: ToolExecutionContext) => {
  const session = await context.services.db.getSession(context.sessionId);
  if (!session) {
    throw new Error("Session not found.");
  }

  const account = await context.services.db.getAccountByProfileId(session.profileId);
  if (!account || (account.role !== "manager" && account.role !== "admin")) {
    throw new Error("This workflow is available for manager and admin roles only.");
  }
};

export const createWorkflowTools = (
  workflowService: WorkflowArtifactService
): ToolDefinition[] => [
  {
    name: "workflow.list_artifacts",
    description:
      "List recently generated campaign, proposal, or solution artifacts for the current user.",
    permissionCategory: "filesystem_list",
    safeByDefault: true,
    schema: ListWorkflowArtifactsRequestSchema,
    summariseInput: (input) =>
      `List ${input.kind ?? "workflow"} artifacts${input.limit ? ` (limit ${input.limit})` : ""}`,
    handler: async (input, context) => {
      await requireManagerAccess(context);
      const artifacts = await workflowService.listArtifacts(context.sessionId, input);
      return {
        summary: `Found ${artifacts.length} workflow artifact(s).`,
        output: {
          artifacts
        }
      };
    }
  },
  {
    name: "workflow.generate_campaign",
    description:
      "Generate a reusable customer outreach campaign artifact with audience notes, sequence steps, and draft emails.",
    permissionCategory: "filesystem_list",
    safeByDefault: true,
    schema: GenerateCampaignArtifactRequestSchema,
    summariseInput: (input) =>
      `Generate campaign artifact${input.campaignTitle ? ` "${input.campaignTitle}"` : ""}`,
    handler: async (input, context) => {
      await requireManagerAccess(context);
      const artifact = await workflowService.generateCampaignArtifact(
        context.sessionId,
        context.conversationId,
        input
      );
      return {
        summary: `Generated campaign artifact "${artifact.title}".`,
        output: {
          artifact
        }
      };
    }
  },
  {
    name: "workflow.generate_proposal",
    description:
      "Generate a project proposal artifact with market benchmarking, value proposition, scope, timeline, and risk framing.",
    permissionCategory: "filesystem_list",
    safeByDefault: true,
    schema: GenerateProposalArtifactRequestSchema,
    summariseInput: (input) =>
      `Generate proposal artifact${input.title ? ` "${input.title}"` : ""}`,
    handler: async (input, context) => {
      await requireManagerAccess(context);
      const artifact = await workflowService.generateProposalArtifact(
        context.sessionId,
        context.conversationId,
        input
      );
      return {
        summary: `Generated proposal artifact "${artifact.title}".`,
        output: {
          artifact
        }
      };
    }
  },
  {
    name: "workflow.generate_solution",
    description:
      "Generate a digital transformation solution artifact for TDAI with current state, architecture, phased rollout, KPIs, and risks.",
    permissionCategory: "filesystem_list",
    safeByDefault: true,
    schema: GenerateSolutionArtifactRequestSchema,
    summariseInput: (input) =>
      `Generate solution artifact${input.title ? ` "${input.title}"` : ""}`,
    handler: async (input, context) => {
      await requireManagerAccess(context);
      const artifact = await workflowService.generateSolutionArtifact(
        context.sessionId,
        context.conversationId,
        input
      );
      return {
        summary: `Generated solution artifact "${artifact.title}".`,
        output: {
          artifact
        }
      };
    }
  },
  {
    name: "workflow.draft_artifact_email",
    description:
      "Create an approval-gated email draft for a stored workflow artifact such as a campaign, proposal, or solution.",
    permissionCategory: "gmail",
    safeByDefault: false,
    schema: DraftArtifactEmailRequestSchema,
    summariseInput: (input) => `Draft an email for artifact ${input.artifactId}`,
    handler: async (input, context) => {
      await requireManagerAccess(context);
      const result = await workflowService.draftArtifactEmail(context.sessionId, input);
      return {
        summary: `Created an email draft for "${result.artifact.title}".`,
        output: {
          artifact: result.artifact,
          email: result.email,
          draftId: result.draftId
        }
      };
    }
  },
  {
    name: "workflow.send_artifact_email",
    description:
      "Send a stored workflow artifact by email after explicit approval.",
    permissionCategory: "gmail",
    safeByDefault: false,
    schema: DraftArtifactEmailRequestSchema,
    summariseInput: (input) => `Send artifact ${input.artifactId} by email`,
    handler: async (input, context) => {
      await requireManagerAccess(context);
      const result = await workflowService.sendArtifactEmail(context.sessionId, input);
      return {
        summary: `Sent "${result.artifact.title}" by email.`,
        output: {
          artifact: result.artifact,
          email: result.email,
          sent: result.sent
        }
      };
    }
  }
];

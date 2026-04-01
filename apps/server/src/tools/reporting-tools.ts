import type { ToolDefinition, ToolExecutionContext } from "@personal-ai/tool-registry";
import {
  IngestUpdateEmailRequestSchema,
  ReportQueryRequestSchema,
  SyncUpdateEmailsRequestSchema
} from "@personal-ai/shared";

import type { ReportingService } from "../services/reporting-service.js";

const requireManagerAccess = async (context: ToolExecutionContext) => {
  const session = await context.services.db.getSession(context.sessionId);
  if (!session) {
    throw new Error("Session not found.");
  }

  const account = await context.services.db.getAccountByProfileId(session.profileId);
  if (!account || (account.role !== "manager" && account.role !== "admin")) {
    throw new Error("Reporting workflows are available for manager and admin roles only.");
  }
};

export const createReportingTools = (
  reportingService: ReportingService
): ToolDefinition[] => [
  {
    name: "reports.query_table",
    description:
      "Generate a manager-facing report table from natural language queries such as WBR, pending blockers, resolved blockers, or completed vs pending tasks.",
    permissionCategory: "filesystem_list",
    safeByDefault: true,
    schema: ReportQueryRequestSchema,
    summariseInput: (input) => `Generate a report table for "${input.query}"`,
    handler: async (input, context) => {
      await requireManagerAccess(context);
      const table = await reportingService.queryReportTable(input.query, input.syncMode);
      return {
        summary: `Generated the "${table.title}" table with ${table.rows.length} row(s).`,
        output: table
      };
    }
  },
  {
    name: "reports.ingest_update_email",
    description:
      "Parse a pasted employee update email, store the structured daily update, and refresh blocker tracking.",
    permissionCategory: "filesystem_list",
    safeByDefault: true,
    schema: IngestUpdateEmailRequestSchema,
    summariseInput: (input) =>
      `Parse and store an update email${input.sourceEmailId ? ` from ${input.sourceEmailId}` : ""}`,
    handler: async (input, context) => {
      await requireManagerAccess(context);
      const result = await reportingService.ingestUpdateEmail(input);
      return {
        summary: `Processed the update email for ${result.update.employeeName}.`,
        output: {
          update: result.update,
          comparison: result.comparison
        }
      };
    }
  },
  {
    name: "reports.sync_update_emails",
    description:
      "Search the configured mailbox for employee update emails, parse them, and store structured reporting records.",
    permissionCategory: "gmail",
    safeByDefault: false,
    schema: SyncUpdateEmailsRequestSchema,
    summariseInput: (input) =>
      `Sync up to ${input.limit} update emails${input.query ? ` for query "${input.query}"` : ""}`,
    handler: async (input, context) => {
      await requireManagerAccess(context);
      const result = await reportingService.syncUpdateEmails(input);
      return {
        summary: `Processed ${result.syncedCount} update email(s) and skipped ${result.skippedCount}.`,
        output: result
      };
    }
  }
];

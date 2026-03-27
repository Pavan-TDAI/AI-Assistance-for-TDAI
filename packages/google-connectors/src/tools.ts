import { z } from "zod";

import type { ToolDefinition } from "@personal-ai/tool-registry";

const gmailSearchSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(20).default(10)
});

const gmailSendSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  body: z.string().min(1)
});

const calendarListSchema = z.object({
  timeMin: z.string().optional(),
  timeMax: z.string().optional(),
  maxResults: z.number().int().min(1).max(25).default(10)
});

const calendarCreateSchema = z.object({
  summary: z.string().min(1),
  description: z.string().optional(),
  start: z.string().min(1),
  end: z.string().min(1),
  attendees: z.array(z.string().email()).default([])
});

const calendarUpdateSchema = z.object({
  eventId: z.string().min(1),
  summary: z.string().optional(),
  description: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional()
});

const driveSearchSchema = z.object({
  query: z.string().optional(),
  pageSize: z.number().int().min(1).max(25).default(10)
});

const driveMetadataSchema = z.object({
  fileId: z.string().min(1)
});

const driveDownloadSchema = z.object({
  fileId: z.string().min(1),
  targetPath: z.string().min(1)
});

export const createGoogleTools = (): ToolDefinition[] => [
  {
    name: "gmail.search_messages",
    description: "Search Gmail messages with a Gmail query string.",
    permissionCategory: "gmail",
    safeByDefault: false,
    schema: gmailSearchSchema,
    summariseInput: (input) => `Search Gmail for "${input.query}"`,
    handler: async (input, context) => ({
      summary: `Searched Gmail for "${input.query}".`,
      output: await context.services.gmail.searchMessages(input.query, input.limit)
    })
  },
  {
    name: "gmail.create_draft",
    description: "Create a Gmail draft message.",
    permissionCategory: "gmail",
    safeByDefault: false,
    schema: gmailSendSchema,
    summariseInput: (input) => `Create Gmail draft to ${input.to}`,
    handler: async (input, context) => ({
      summary: `Created a draft email to ${input.to}.`,
      output: await context.services.gmail.createDraft(input)
    })
  },
  {
    name: "gmail.send_message",
    description: "Send a Gmail message immediately.",
    permissionCategory: "gmail",
    safeByDefault: false,
    schema: gmailSendSchema,
    summariseInput: (input) => `Send Gmail message to ${input.to}`,
    handler: async (input, context) => ({
      summary: `Sent an email to ${input.to}.`,
      output: await context.services.gmail.sendMessage(input)
    })
  },
  {
    name: "calendar.list_events",
    description: "List upcoming Google Calendar events.",
    permissionCategory: "calendar",
    safeByDefault: false,
    schema: calendarListSchema,
    summariseInput: () => "List Google Calendar events",
    handler: async (input, context) => ({
      summary: "Fetched Google Calendar events.",
      output: await context.services.calendar.listEvents(input)
    })
  },
  {
    name: "calendar.create_event",
    description: "Create a new Google Calendar event.",
    permissionCategory: "calendar",
    safeByDefault: false,
    schema: calendarCreateSchema,
    summariseInput: (input) => `Create calendar event "${input.summary}"`,
    handler: async (input, context) => ({
      summary: `Created calendar event "${input.summary}".`,
      output: await context.services.calendar.createEvent(input)
    })
  },
  {
    name: "calendar.update_event",
    description: "Update an existing Google Calendar event.",
    permissionCategory: "calendar",
    safeByDefault: false,
    schema: calendarUpdateSchema,
    summariseInput: (input) => `Update calendar event ${input.eventId}`,
    handler: async (input, context) => ({
      summary: `Updated calendar event ${input.eventId}.`,
      output: await context.services.calendar.updateEvent(input)
    })
  },
  {
    name: "drive.search_files",
    description: "Search files in Google Drive.",
    permissionCategory: "drive",
    safeByDefault: false,
    schema: driveSearchSchema,
    summariseInput: (input) =>
      `Search Google Drive${input.query ? ` for "${input.query}"` : ""}`,
    handler: async (input, context) => ({
      summary: "Searched Google Drive.",
      output: await context.services.drive.searchFiles(input)
    })
  },
  {
    name: "drive.get_file_metadata",
    description: "Fetch metadata for a Google Drive file.",
    permissionCategory: "drive",
    safeByDefault: false,
    schema: driveMetadataSchema,
    summariseInput: (input) => `Get Drive file metadata for ${input.fileId}`,
    handler: async (input, context) => ({
      summary: `Fetched metadata for Drive file ${input.fileId}.`,
      output: await context.services.drive.getFileMetadata(input)
    })
  },
  {
    name: "drive.download_file",
    description: "Download a Google Drive file to a local target path.",
    permissionCategory: "drive",
    safeByDefault: false,
    schema: driveDownloadSchema,
    summariseInput: (input) => `Download Drive file ${input.fileId} to ${input.targetPath}`,
    handler: async (input, context) => ({
      summary: `Downloaded Drive file ${input.fileId}.`,
      output: await context.services.drive.downloadFile(input)
    })
  }
];

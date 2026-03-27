import type { ToolDefinition } from "@personal-ai/tool-registry";
import {
  ListMeetingsToolRequestSchema,
  MeetingToolActionRequestSchema
} from "@personal-ai/shared";

import type { MeetingService } from "../services/meeting-service.js";

const resolveMeetingId = async (meetingService: MeetingService, meetingId?: string) => {
  if (meetingId?.trim()) {
    return meetingId.trim();
  }

  const meetings = await meetingService.listMeetings();
  const latestMeeting = meetings[0];
  if (!latestMeeting) {
    throw new Error("No meeting is available yet. Create or generate one in Meeting Studio first.");
  }

  return latestMeeting.id;
};

export const createMeetingTools = (meetingService: MeetingService): ToolDefinition[] => [
  {
    name: "meetings.list",
    description:
      "List recent meetings and their status so the assistant can choose the correct meeting before generating or sending a MoM.",
    permissionCategory: "filesystem_list",
    safeByDefault: true,
    schema: ListMeetingsToolRequestSchema,
    summariseInput: (input) => `List the latest ${input.limit} meeting(s)`,
    handler: async (input) => {
      const meetings = await meetingService.listMeetings();
      const items = meetings.slice(0, input.limit).map((meeting) => ({
        id: meeting.id,
        title: meeting.title,
        status: meeting.status,
        attendees: meeting.attendees,
        updatedAt: meeting.updatedAt
      }));

      return {
        summary: `Listed ${items.length} recent meeting(s).`,
        output: {
          meetings: items
        }
      };
    }
  },
  {
    name: "meetings.generate_mom",
    description:
      "Generate a structured MoM for a meeting. If meetingId is omitted, use the latest meeting.",
    permissionCategory: "filesystem_list",
    safeByDefault: true,
    schema: MeetingToolActionRequestSchema,
    summariseInput: (input) =>
      `Generate structured MoM${input.meetingId ? ` for meeting ${input.meetingId}` : " for the latest meeting"}`,
    handler: async (input) => {
      const meetingId = await resolveMeetingId(meetingService, input.meetingId);
      const meeting = await meetingService.generateMom(meetingId, input.includeEmailDraft);

      return {
        summary: `Generated the MoM for "${meeting.title}".`,
        output: {
          meetingId: meeting.id,
          title: meeting.title,
          status: meeting.status,
          structuredMom: meeting.structuredMom,
          summary: meeting.summary,
          decisions: meeting.decisions,
          actionItems: meeting.actionItems
        }
      };
    }
  },
  {
    name: "meetings.draft_email",
    description:
      "Create a Gmail draft using the generated MoM for a meeting. If meetingId is omitted, use the latest meeting.",
    permissionCategory: "gmail",
    safeByDefault: false,
    schema: MeetingToolActionRequestSchema,
    summariseInput: (input) =>
      `Create a MoM draft email${input.meetingId ? ` for meeting ${input.meetingId}` : " for the latest meeting"}`,
    handler: async (input) => {
      const meetingId = await resolveMeetingId(meetingService, input.meetingId);
      const meeting = await meetingService.draftEmail(meetingId, input.to);

      return {
        summary: `Created the MoM draft for "${meeting.title}".`,
        output: {
          meetingId: meeting.id,
          title: meeting.title,
          recipients: meeting.followUpEmail?.to ?? meeting.attendees,
          subject: meeting.followUpEmail?.subject
        }
      };
    }
  },
  {
    name: "meetings.send_email",
    description:
      "Send the generated MoM email for a meeting. If meetingId is omitted, use the latest meeting.",
    permissionCategory: "gmail",
    safeByDefault: false,
    schema: MeetingToolActionRequestSchema,
    summariseInput: (input) =>
      `Send the MoM email${input.meetingId ? ` for meeting ${input.meetingId}` : " for the latest meeting"}`,
    handler: async (input) => {
      const meetingId = await resolveMeetingId(meetingService, input.meetingId);
      const meeting = await meetingService.sendEmail(meetingId, input.to);

      return {
        summary: `Sent the MoM email for "${meeting.title}".`,
        output: {
          meetingId: meeting.id,
          title: meeting.title,
          recipients: meeting.followUpEmail?.to ?? meeting.attendees,
          sentAt: meeting.followUpEmail?.sentAt
        }
      };
    }
  }
];

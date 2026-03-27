import {
  createId,
  nowIso,
  type CreateMeetingRequest,
  type MeetingActionItem,
  type MeetingStructuredMom,
  type MeetingRecord
} from "@personal-ai/shared";
import type { ProviderFactory } from "@personal-ai/agent-core";
import type { AgentDatabase } from "@personal-ai/db";

import type { AuditLogService } from "./audit-log-service.js";
import type { SettingsService } from "./settings-service.js";
import type { CalendarConnectorWithDetailsLike } from "./workspace-connectors.js";

interface MailConnectorLike {
  createDraft(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  sendMessage(input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

const pickSentences = (value: string, limit = 3) =>
  value
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean)
    .slice(0, limit)
    .join(" ");

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

interface CalendarMeetingEvent {
  id?: string | null;
  summary?: string | null;
  start?: CalendarMeetingDateTime | null;
  end?: CalendarMeetingDateTime | null;
  status?: string | null;
  attendees: string[];
}

interface CalendarMeetingEventList {
  events: CalendarMeetingEvent[];
}

interface CalendarMeetingEventDetails {
  id?: string | null;
  summary?: string | null;
  description?: string | null;
  start?: CalendarMeetingDateTime | null;
  end?: CalendarMeetingDateTime | null;
  attendees: string[];
}

interface CalendarMeetingDateTime {
  date?: string | null;
  dateTime?: string | null;
  timeZone?: string | null;
}

const toDisplayName = (value: string) =>
  value
    .split(/[@._\-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
    .trim();

const formatMeetingDateLabel = (meeting: MeetingRecord) =>
  new Date(meeting.generatedAt ?? meeting.updatedAt ?? meeting.createdAt).toLocaleDateString(
    "en-US",
    {
      dateStyle: "medium"
    }
  );

const cleanTaskLine = (value: string) =>
  value
    .replace(/^[\-\*\d\.\)\s]+/, "")
    .replace(/\b(action item|todo|next step|follow up)\b[:\-]?\s*/gi, "")
    .trim();

const deriveOwnerFromActionLine = (value: string, attendees: string[]) => {
  const lower = value.toLowerCase();
  const genericLabels = new Set(["action", "todo", "next step", "follow up", "task"]);
  const attendeeMatch = attendees.find((attendee) => {
    const email = attendee.toLowerCase();
    const localPart = email.split("@")[0] ?? email;
    return lower.includes(email) || lower.includes(localPart);
  });

  if (attendeeMatch) {
    return toDisplayName(attendeeMatch.split("@")[0] ?? attendeeMatch);
  }

  const ownerMatch = value.match(/\bowner\s*[:\-]?\s*([A-Za-z][A-Za-z\s]{1,40})/i);
  if (ownerMatch?.[1]) {
    return ownerMatch[1].trim();
  }

  const leadingMatch = value.match(/^([A-Za-z][A-Za-z\s]{1,40})\s*[:\-]\s*(.+)$/);
  if (leadingMatch?.[1] && leadingMatch?.[2]) {
    const candidate = leadingMatch[1].trim();
    if (!genericLabels.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  return undefined;
};

const stripOwnerPrefix = (value: string, owner?: string) => {
  if (!owner) {
    return cleanTaskLine(value);
  }

  return cleanTaskLine(
    value
      .replace(new RegExp(`^${owner}\\s*[:\\-]\\s*`, "i"), "")
      .replace(/\bowner\s*[:\-]?\s*[A-Za-z][A-Za-z\s]{1,40}\b/i, "")
  );
};

const buildStructuredMom = (
  meeting: MeetingRecord,
  actionItems: MeetingActionItem[]
): MeetingStructuredMom => {
  const grouped = new Map<string, string[]>();

  for (const item of actionItems) {
    const owner = item.owner?.trim() || "Open owner";
    const current = grouped.get(owner) ?? [];
    current.push(item.title);
    grouped.set(owner, current);
  }

  if (!grouped.size) {
    grouped.set("Open owner", ["No explicit task was captured yet."]);
  }

  return {
    dateLabel: formatMeetingDateLabel(meeting),
    headline: "Today's tasks for the day",
    assignments: [...grouped.entries()].map(([owner, tasks]) => ({
      owner,
      tasks
    }))
  };
};

const buildFollowUpBody = (
  meeting: MeetingRecord,
  summary: string,
  decisions: string[],
  actionItems: MeetingActionItem[],
  structuredMom: MeetingStructuredMom
) =>
  [
    "Hello,",
    "",
    `Please find the minutes of meeting for "${meeting.title}" below.`,
    "",
    `Date: ${structuredMom.dateLabel}`,
    "",
    "Summary:",
    summary,
    "",
    `${structuredMom.headline}:`,
    ...structuredMom.assignments.flatMap((assignment) => [
      `${assignment.owner}:`,
      ...assignment.tasks.map((task) => `- ${task}`)
    ]),
    "",
    "Decisions:",
    ...(decisions.length
      ? decisions.map((decision) => `- ${decision}`)
      : ["- No explicit decisions were captured."]),
    "",
    "Action items:",
    ...(actionItems.length
      ? actionItems.map(
          (item) =>
            `- ${item.title}${item.owner ? ` | Owner: ${item.owner}` : ""}${
              item.dueDate ? ` | Due: ${item.dueDate}` : ""
            }`
        )
      : ["- No explicit action items were captured."]),
    "",
    "Regards"
  ].join("\n");

const buildHeuristicMeetingDraft = (meeting: MeetingRecord) => {
  const base = meeting.notes?.trim() || meeting.transcript.trim();
  const summary = pickSentences(base, 4) || "Meeting summary is not available yet.";
  const decisions = base
    .split(/\r?\n/)
    .filter((line) => /decision|decided|approved|agreed/i.test(line))
    .slice(0, 6);
  const actionCandidates = base
    .split(/\r?\n/)
    .filter((line) => /action|todo|follow up|next step|owner/i.test(line))
    .slice(0, 6);
  const actionItems: MeetingActionItem[] = actionCandidates.map((line) => {
    const owner = deriveOwnerFromActionLine(line, meeting.attendees);
    return {
      title: stripOwnerPrefix(line, owner),
      owner,
      status: "open"
    };
  });
  const structuredMom = buildStructuredMom(meeting, actionItems);

  return {
    summary,
    decisions: decisions.length ? decisions : ["No explicit decisions were extracted."],
    actionItems,
    structuredMom,
    followUpEmail: {
      to: meeting.attendees,
      subject: `MoM: ${meeting.title}`,
      body: buildFollowUpBody(
        meeting,
        summary,
        decisions.length ? decisions : ["No explicit decisions were extracted."],
        actionItems,
        structuredMom
      )
    }
  };
};

export class MeetingService {
  constructor(
    private readonly db: AgentDatabase,
    private readonly audit: AuditLogService,
    private readonly settingsService: SettingsService,
    private readonly providerFactory: ProviderFactory,
    private readonly gmail: MailConnectorLike,
    private readonly calendar: CalendarConnectorWithDetailsLike
  ) {}

  async createMeeting(payload: CreateMeetingRequest): Promise<MeetingRecord> {
    const transcript = payload.transcript?.trim() || payload.notes?.trim() || "";
    const meeting = await this.db.createMeeting({
      sessionId: payload.sessionId,
      title: payload.title,
      source: payload.source,
      status: "draft",
      transcript,
      notes: payload.notes?.trim(),
      attendees: payload.attendees,
      calendarEventId: payload.calendarEventId,
      decisions: [],
      actionItems: []
    });

    await this.audit.log({
      action: "meeting_created",
      message: `Meeting captured: ${meeting.title}`,
      sessionId: meeting.sessionId,
      entityType: "meeting",
      entityId: meeting.id,
      payload: {
        attendees: meeting.attendees.length
      }
    });

    return meeting;
  }

  async listMeetings(): Promise<MeetingRecord[]> {
    return this.db.listMeetings(40);
  }

  async getMeeting(meetingId: string): Promise<MeetingRecord> {
    const meeting = await this.db.getMeeting(meetingId);
    if (!meeting) {
      throw new Error("Meeting not found.");
    }

    return meeting;
  }

  async listCalendarEvents(): Promise<CalendarMeetingEventList> {
    try {
      const response = await this.calendar.listEvents({
        maxResults: 15
      });
      return {
        events: Array.isArray(response.events)
          ? (response.events as CalendarMeetingEvent[])
          : []
      };
    } catch {
      return {
        events: []
      };
    }
  }

  async getCalendarEventDetails(eventId: string): Promise<CalendarMeetingEventDetails> {
    const response = await this.calendar.getEventDetails(eventId);
    return {
      id: typeof response.id === "string" ? response.id : undefined,
      summary: typeof response.summary === "string" ? response.summary : undefined,
      description:
        typeof response.description === "string" ? response.description : undefined,
      start:
        response.start && typeof response.start === "object"
          ? (response.start as CalendarMeetingDateTime)
          : undefined,
      end:
        response.end && typeof response.end === "object"
          ? (response.end as CalendarMeetingDateTime)
          : undefined,
      attendees: Array.isArray(response.attendees)
        ? response.attendees.map((entry) => String(entry)).filter(Boolean)
        : []
    };
  }

  async generateMom(meetingId: string, includeEmailDraft = true): Promise<MeetingRecord> {
    const meeting = await this.getMeeting(meetingId);
    const settings = await this.settingsService.getSettings();
    const drafting = this.providerFactory.createDraftingProvider(settings);
    const heuristic = buildHeuristicMeetingDraft(meeting);
    let generated: {
      summary: string;
      decisions: string[];
      actionItems: MeetingActionItem[];
      structuredMom: MeetingStructuredMom;
      followUpEmail: {
        to: string[];
        subject: string;
        body: string;
      };
    } = heuristic;

    try {
      const response = await drafting.provider.generate({
        model: drafting.model,
        systemPrompt: `
You generate meeting minutes for a local-first AI assistant.
Return strict JSON with keys:
- summary: string
- decisions: string[]
- actionItems: { title: string, owner?: string, dueDate?: string, status?: string }[]
- structuredMom: { dateLabel: string, headline: string, assignments: { owner: string, tasks: string[] }[] }
- followUpEmail: { subject: string, body: string }
Keep the tone professional and concise.
        `.trim(),
        messages: [
          {
            role: "user",
            content: JSON.stringify(
              {
                title: meeting.title,
                attendees: meeting.attendees,
                transcript: meeting.transcript,
                notes: meeting.notes
              },
              null,
              2
            )
          }
        ],
        tools: []
      });

      const parsed = extractJsonObject(response.text);
      if (parsed) {
        generated = {
          summary: String(parsed.summary ?? heuristic.summary),
          decisions: Array.isArray(parsed.decisions)
            ? parsed.decisions.map((entry) => String(entry))
            : heuristic.decisions,
          actionItems: Array.isArray(parsed.actionItems)
            ? parsed.actionItems.map((entry) => {
                const item = entry as Record<string, unknown>;
                return {
                  title: String(item.title ?? ""),
                  owner:
                    typeof item.owner === "string" ? item.owner : undefined,
                  dueDate:
                    typeof item.dueDate === "string" ? item.dueDate : undefined,
                  status:
                    item.status === "completed" ||
                    item.status === "cancelled" ||
                    item.status === "in_progress" ||
                    item.status === "blocked" ||
                    item.status === "open"
                      ? item.status
                      : "open"
                };
              })
            : heuristic.actionItems,
          structuredMom:
            parsed.structuredMom && typeof parsed.structuredMom === "object"
              ? {
                  dateLabel: String(
                    (parsed.structuredMom as Record<string, unknown>).dateLabel ??
                      heuristic.structuredMom.dateLabel
                  ),
                  headline: String(
                    (parsed.structuredMom as Record<string, unknown>).headline ??
                      heuristic.structuredMom.headline
                  ),
                  assignments: Array.isArray(
                    (parsed.structuredMom as Record<string, unknown>).assignments
                  )
                    ? (
                        (parsed.structuredMom as Record<string, unknown>)
                          .assignments as Array<Record<string, unknown>>
                      ).map((assignment) => ({
                        owner: String(assignment.owner ?? "Open owner"),
                        tasks: Array.isArray(assignment.tasks)
                          ? assignment.tasks.map((task) => String(task)).filter(Boolean)
                          : []
                      }))
                    : heuristic.structuredMom.assignments
                }
              : heuristic.structuredMom,
          followUpEmail: parsed.followUpEmail && typeof parsed.followUpEmail === "object"
            ? {
                to: meeting.attendees,
                subject: String(
                  (parsed.followUpEmail as Record<string, unknown>).subject ??
                    heuristic.followUpEmail.subject
                ),
                body: String(
                  (parsed.followUpEmail as Record<string, unknown>).body ??
                    heuristic.followUpEmail.body
                )
              }
            : heuristic.followUpEmail
        };
      }
    } catch {
      generated = heuristic;
    }

    const updated = await this.db.updateMeeting(meetingId, {
      status: "generated",
      summary: generated.summary,
      decisions: generated.decisions,
      actionItems: generated.actionItems,
      structuredMom:
        generated.structuredMom.assignments.length
          ? generated.structuredMom
          : buildStructuredMom(meeting, generated.actionItems),
      followUpEmail: includeEmailDraft
        ? {
            ...generated.followUpEmail,
            body: buildFollowUpBody(
              meeting,
              generated.summary,
              generated.decisions,
              generated.actionItems,
              generated.structuredMom.assignments.length
                ? generated.structuredMom
                : buildStructuredMom(meeting, generated.actionItems)
            )
          }
        : undefined,
      generatedAt: nowIso()
    });

    if (!updated) {
      throw new Error("Meeting not found.");
    }

    await this.audit.log({
      action: "meeting_generated",
      message: `Generated MoM for ${updated.title}`,
      sessionId: updated.sessionId,
      entityType: "meeting",
      entityId: updated.id,
      payload: {
        decisions: updated.decisions.length,
        actionItems: updated.actionItems.length
      }
    });

    return updated;
  }

  async draftEmail(meetingId: string, to?: string[]): Promise<MeetingRecord> {
    let meeting = await this.getMeeting(meetingId);

    if (!meeting.followUpEmail) {
      meeting = await this.generateMom(meetingId, true);
    }

    const recipients = to?.length ? to : meeting.followUpEmail?.to ?? meeting.attendees;
    if (!recipients.length) {
      throw new Error("Add at least one attendee email before creating a draft.");
    }

    const draft = await this.gmail.createDraft({
      to: recipients.join(", "),
      subject: meeting.followUpEmail?.subject ?? `MoM: ${meeting.title}`,
      body: meeting.followUpEmail?.body ?? ""
    });

    const updated = await this.db.updateMeeting(meetingId, {
      followUpEmail: {
        ...(meeting.followUpEmail ?? {
          subject: `MoM: ${meeting.title}`,
          body: ""
        }),
        to: recipients,
        gmailDraftId: String(draft.id ?? createId("gmail_draft"))
      }
    });

    return updated ?? meeting;
  }

  async sendEmail(meetingId: string, to?: string[]): Promise<MeetingRecord> {
    let meeting = await this.getMeeting(meetingId);

    if (!meeting.followUpEmail) {
      meeting = await this.generateMom(meetingId, true);
    }

    const recipients = to?.length ? to : meeting.followUpEmail?.to ?? meeting.attendees;
    if (!recipients.length) {
      throw new Error("Add at least one attendee email before sending the MoM.");
    }

    await this.gmail.sendMessage({
      to: recipients.join(", "),
      subject: meeting.followUpEmail?.subject ?? `MoM: ${meeting.title}`,
      body: meeting.followUpEmail?.body ?? ""
    });

    const updated = await this.db.updateMeeting(meetingId, {
      status: "emailed",
      followUpEmail: {
        ...(meeting.followUpEmail ?? {
          subject: `MoM: ${meeting.title}`,
          body: ""
        }),
        to: recipients,
        sentAt: nowIso()
      }
    });

    if (!updated) {
      throw new Error("Meeting not found.");
    }

    await this.audit.log({
      action: "meeting_emailed",
      message: `Sent meeting MoM for ${updated.title}`,
      sessionId: updated.sessionId,
      entityType: "meeting",
      entityId: updated.id,
      payload: {
        attendees: recipients
      }
    });

    return updated;
  }
}

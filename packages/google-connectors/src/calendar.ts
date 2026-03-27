import { google } from "googleapis";

import type { GoogleOAuthManager } from "./oauth.js";

export class GoogleCalendarConnector {
  constructor(private readonly oauth: GoogleOAuthManager) {}

  async listEvents(input: Record<string, unknown>) {
    const auth = await this.oauth.getClientOrThrow();
    const calendar = google.calendar({ version: "v3", auth });

    const timeMin =
      typeof input.timeMin === "string"
        ? input.timeMin
        : new Date().toISOString();
    const timeMax =
      typeof input.timeMax === "string" ? input.timeMax : undefined;
    const maxResults =
      typeof input.maxResults === "number" ? input.maxResults : 10;

    const response = await calendar.events.list({
      calendarId: "primary",
      timeMin,
      timeMax,
      maxResults,
      singleEvents: true,
      orderBy: "startTime"
    });

    return {
      events:
        response.data.items?.map((event) => ({
          id: event.id,
          summary: event.summary,
          start: event.start,
          end: event.end,
          status: event.status,
          attendees:
            event.attendees
              ?.map((attendee) => attendee.email)
              .filter((email): email is string => Boolean(email)) ?? []
        })) ?? []
    };
  }

  async createEvent(input: Record<string, unknown>) {
    const auth = await this.oauth.getClientOrThrow();
    const calendar = google.calendar({ version: "v3", auth });

    const response = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: String(input.summary ?? ""),
        description: typeof input.description === "string" ? input.description : undefined,
        start: { dateTime: String(input.start) },
        end: { dateTime: String(input.end) },
        attendees: Array.isArray(input.attendees)
          ? input.attendees.map((email) => ({ email: String(email) }))
          : undefined
      }
    });

    return {
      id: response.data.id,
      htmlLink: response.data.htmlLink
    };
  }

  async updateEvent(input: Record<string, unknown>) {
    const auth = await this.oauth.getClientOrThrow();
    const calendar = google.calendar({ version: "v3", auth });

    const response = await calendar.events.patch({
      calendarId: "primary",
      eventId: String(input.eventId),
      requestBody: {
        summary: typeof input.summary === "string" ? input.summary : undefined,
        description: typeof input.description === "string" ? input.description : undefined,
        start:
          typeof input.start === "string" ? { dateTime: input.start } : undefined,
        end: typeof input.end === "string" ? { dateTime: input.end } : undefined
      }
    });

    return {
      id: response.data.id,
      htmlLink: response.data.htmlLink
    };
  }

  async getEventDetails(eventId: string) {
    const auth = await this.oauth.getClientOrThrow();
    const calendar = google.calendar({ version: "v3", auth });

    const response = await calendar.events.get({
      calendarId: "primary",
      eventId
    });

    return {
      id: response.data.id,
      summary: response.data.summary,
      description: response.data.description,
      start: response.data.start,
      end: response.data.end,
      attendees:
        response.data.attendees
          ?.map((attendee) => attendee.email)
          .filter((email): email is string => Boolean(email)) ?? []
    };
  }
}

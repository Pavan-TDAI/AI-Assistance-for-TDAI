import type { GmailConnectorLike } from "@personal-ai/tool-registry";
import type { Microsoft365ConnectorSecret } from "@personal-ai/shared";

export interface Microsoft365ConfigLoaderResult {
  config: Microsoft365ConnectorSecret;
  source?: "env" | "vault" | "none";
}

type Microsoft365ConfigLoader =
  | (() => Microsoft365ConfigLoaderResult | Promise<Microsoft365ConfigLoaderResult>);

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
}

const graphScopes = [
  "https://graph.microsoft.com/User.Read",
  "https://graph.microsoft.com/Mail.Read",
  "https://graph.microsoft.com/Mail.Send",
  "https://graph.microsoft.com/Calendars.Read",
  "https://graph.microsoft.com/Calendars.ReadWrite",
  "offline_access"
].join(" ");

export interface CalendarConnectorWithDetails {
  listEvents(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  createEvent(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  updateEvent(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  getEventDetails(eventId: string): Promise<Record<string, unknown>>;
}

export class Microsoft365OAuthManager {
  constructor(
    private readonly configLoader: Microsoft365ConfigLoader,
    private readonly onRefreshToken?: (refreshToken: string) => Promise<void>
  ) {}

  private async loadConfig() {
    return this.configLoader();
  }

  async getResolvedConfig() {
    return this.loadConfig();
  }

  async isConfigured() {
    const { config } = await this.loadConfig();
    return Boolean(
      config.clientId &&
        config.clientSecret &&
        config.redirectUri &&
        config.refreshToken
    );
  }

  async getAccessTokenOrThrow() {
    const { config } = await this.loadConfig();

    if (
      !config.clientId ||
      !config.clientSecret ||
      !config.redirectUri ||
      !config.refreshToken
    ) {
      throw new Error(
        "Microsoft 365 connectors are not configured yet. Add Microsoft credentials in Settings before using Outlook Mail or Calendar."
      );
    }

    const tenantId = config.tenantId?.trim() || "organizations";
    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      redirect_uri: config.redirectUri,
      refresh_token: config.refreshToken,
      scope: graphScopes
    });

    const response = await fetch(
      `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body
      }
    );

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error_description?: string; error?: string }
        | null;
      throw new Error(
        payload?.error_description ??
          payload?.error ??
          `Microsoft token request failed with status ${response.status}.`
      );
    }

    const token = (await response.json()) as TokenResponse;
    if (token.refresh_token && token.refresh_token !== config.refreshToken) {
      await this.onRefreshToken?.(token.refresh_token);
    }

    return token.access_token;
  }
}

const fetchGraphJson = async (
  accessToken: string,
  path: string,
  init?: RequestInit
) => {
  const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    throw new Error(
      payload?.error?.message ?? `Microsoft Graph request failed with status ${response.status}.`
    );
  }

  if (response.status === 204) {
    return null;
  }

  return (await response.json()) as Record<string, unknown>;
};

export class MicrosoftMailConnector implements GmailConnectorLike {
  constructor(private readonly oauth: Microsoft365OAuthManager) {}

  async searchMessages(query: string, limit = 10) {
    const accessToken = await this.oauth.getAccessTokenOrThrow();
    const search = query.trim()
      ? `?$top=${limit}&$search="${encodeURIComponent(query.trim())}"`
      : `?$top=${limit}`;
    const payload = await fetchGraphJson(accessToken, `/me/messages${search}`, {
      headers: {
        ConsistencyLevel: "eventual"
      }
    });

    return {
      query,
      messages: Array.isArray(payload?.value)
        ? payload.value.map((message) => {
            const item = message as Record<string, unknown>;
            return {
              id: item.id,
              threadId: item.conversationId,
              snippet: item.bodyPreview,
              subject: item.subject
            };
          })
        : []
    };
  }

  async createDraft(input: Record<string, unknown>) {
    const accessToken = await this.oauth.getAccessTokenOrThrow();
    const to = String(input.to ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((address) => ({
        emailAddress: {
          address
        }
      }));

    const payload = await fetchGraphJson(accessToken, "/me/messages", {
      method: "POST",
      body: JSON.stringify({
        subject: String(input.subject ?? ""),
        body: {
          contentType: "Text",
          content: String(input.body ?? "")
        },
        toRecipients: to
      })
    });

    return {
      id: payload?.id,
      messageId: payload?.id
    };
  }

  async sendMessage(input: Record<string, unknown>) {
    const accessToken = await this.oauth.getAccessTokenOrThrow();
    const to = String(input.to ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((address) => ({
        emailAddress: {
          address
        }
      }));

    await fetchGraphJson(accessToken, "/me/sendMail", {
      method: "POST",
      body: JSON.stringify({
        message: {
          subject: String(input.subject ?? ""),
          body: {
            contentType: "Text",
            content: String(input.body ?? "")
          },
          toRecipients: to
        },
        saveToSentItems: true
      })
    });

    return {
      id: `sent-${Date.now()}`,
      threadId: `sent-${Date.now()}`
    };
  }
}

export class MicrosoftCalendarConnector implements CalendarConnectorWithDetails {
  constructor(private readonly oauth: Microsoft365OAuthManager) {}

  async listEvents(input: Record<string, unknown>) {
    const accessToken = await this.oauth.getAccessTokenOrThrow();
    const timeMin =
      typeof input.timeMin === "string" ? input.timeMin : new Date().toISOString();
    const timeMax =
      typeof input.timeMax === "string"
        ? input.timeMax
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const maxResults =
      typeof input.maxResults === "number" ? input.maxResults : 10;
    const path = `/me/calendarView?startDateTime=${encodeURIComponent(
      timeMin
    )}&endDateTime=${encodeURIComponent(timeMax)}&$top=${maxResults}`;
    const payload = await fetchGraphJson(accessToken, path);

    return {
      events: Array.isArray(payload?.value)
        ? payload.value.map((event) => {
            const item = event as Record<string, unknown>;
            return {
              id: item.id,
              summary: item.subject,
              start: item.start,
              end: item.end,
              status: item.showAs,
              attendees: Array.isArray(item.attendees)
                ? item.attendees
                    .map((attendee) =>
                      String(
                        (attendee as { emailAddress?: { address?: string } }).emailAddress
                          ?.address ?? ""
                      )
                    )
                    .filter(Boolean)
                : []
            };
          })
        : []
    };
  }

  async createEvent(input: Record<string, unknown>) {
    const accessToken = await this.oauth.getAccessTokenOrThrow();
    const payload = await fetchGraphJson(accessToken, "/me/events", {
      method: "POST",
      body: JSON.stringify({
        subject: String(input.summary ?? ""),
        body:
          typeof input.description === "string"
            ? {
                contentType: "Text",
                content: input.description
              }
            : undefined,
        start: {
          dateTime: String(input.start ?? ""),
          timeZone: "UTC"
        },
        end: {
          dateTime: String(input.end ?? ""),
          timeZone: "UTC"
        },
        attendees: Array.isArray(input.attendees)
          ? input.attendees.map((email) => ({
              emailAddress: {
                address: String(email)
              },
              type: "required"
            }))
          : undefined
      })
    });

    return {
      id: payload?.id,
      htmlLink: payload?.webLink
    };
  }

  async updateEvent(input: Record<string, unknown>) {
    const accessToken = await this.oauth.getAccessTokenOrThrow();
    const payload = await fetchGraphJson(accessToken, `/me/events/${String(input.eventId ?? "")}`, {
      method: "PATCH",
      body: JSON.stringify({
        subject: typeof input.summary === "string" ? input.summary : undefined,
        body:
          typeof input.description === "string"
            ? {
                contentType: "Text",
                content: input.description
              }
            : undefined,
        start:
          typeof input.start === "string"
            ? {
                dateTime: input.start,
                timeZone: "UTC"
              }
            : undefined,
        end:
          typeof input.end === "string"
            ? {
                dateTime: input.end,
                timeZone: "UTC"
              }
            : undefined
      })
    });

    return {
      id: payload?.id ?? input.eventId,
      htmlLink: payload?.webLink
    };
  }

  async getEventDetails(eventId: string) {
    const accessToken = await this.oauth.getAccessTokenOrThrow();
    const payload = await fetchGraphJson(accessToken, `/me/events/${encodeURIComponent(eventId)}`);

    return {
      id: payload?.id,
      summary: payload?.subject,
      description:
        typeof (payload?.body as { content?: unknown } | undefined)?.content === "string"
          ? (payload?.body as { content?: string }).content
          : undefined,
      start: payload?.start,
      end: payload?.end,
      attendees: Array.isArray(payload?.attendees)
        ? payload.attendees
            .map((attendee) =>
              String(
                (attendee as { emailAddress?: { address?: string } }).emailAddress?.address ?? ""
              )
            )
            .filter(Boolean)
        : []
    };
  }
}

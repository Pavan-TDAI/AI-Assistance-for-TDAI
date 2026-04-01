import { google } from "googleapis";

import type { GoogleOAuthManager } from "./oauth.js";

const encodeEmail = (raw: string) => Buffer.from(raw).toString("base64url");

const decodeBase64Url = (value: string) => Buffer.from(value, "base64url").toString("utf8");

const findHeader = (
  headers: Array<{ name?: string | null; value?: string | null }> | null | undefined,
  name: string
) =>
  headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value ??
  undefined;

const stripHtml = (value: string) =>
  value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/(p|div|li|br|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

interface GmailPayloadPart {
  mimeType?: string | null;
  body?: { data?: string | null } | null;
  parts?: GmailPayloadPart[] | null;
}

const extractBodyText = (payload?: {
  mimeType?: string | null;
  body?: { data?: string | null } | null;
  parts?: GmailPayloadPart[] | null;
}): string => {
  if (!payload) {
    return "";
  }

  const mimeType = payload.mimeType ?? "";
  const bodyData = payload.body?.data;

  if (bodyData && mimeType === "text/plain") {
    return decodeBase64Url(bodyData);
  }

  if (bodyData && mimeType === "text/html") {
    return stripHtml(decodeBase64Url(bodyData));
  }

  const parts = payload.parts ?? [];
  for (const part of parts) {
    const text: string = extractBodyText({
      mimeType: part.mimeType,
      body: part.body,
      parts: Array.isArray(part.parts) ? part.parts : undefined
    });
    if (text.trim()) {
      return text;
    }
  }

  if (bodyData) {
    return stripHtml(decodeBase64Url(bodyData));
  }

  return "";
};

export class GmailConnector {
  constructor(private readonly oauth: GoogleOAuthManager) {}

  async searchMessages(query: string, limit = 10) {
    const auth = await this.oauth.getClientOrThrow();
    const gmail = google.gmail({ version: "v1", auth });

    const list = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: limit
    });

    const messageIds = list.data.messages ?? [];
    const messages = await Promise.all(
      messageIds.map(async (message) => {
        const detail = await gmail.users.messages.get({
          userId: "me",
          id: message.id!
        });

        const headers = detail.data.payload?.headers;
        return {
          id: detail.data.id,
          threadId: detail.data.threadId,
          snippet: detail.data.snippet,
          labelIds: detail.data.labelIds,
          subject: findHeader(headers, "Subject"),
          from: findHeader(headers, "From"),
          receivedAt:
            typeof detail.data.internalDate === "string"
              ? new Date(Number(detail.data.internalDate)).toISOString()
              : undefined
        };
      })
    );

    return {
      query,
      messages
    };
  }

  async getMessage(messageId: string) {
    const auth = await this.oauth.getClientOrThrow();
    const gmail = google.gmail({ version: "v1", auth });
    const detail = await gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "full"
    });
    const headers = detail.data.payload?.headers;
    const bodyText = extractBodyText(detail.data.payload);

    return {
      id: detail.data.id,
      threadId: detail.data.threadId,
      subject: findHeader(headers, "Subject"),
      from: findHeader(headers, "From"),
      to: findHeader(headers, "To"),
      receivedAt:
        typeof detail.data.internalDate === "string"
          ? new Date(Number(detail.data.internalDate)).toISOString()
          : undefined,
      snippet: detail.data.snippet,
      labelIds: detail.data.labelIds,
      bodyText: bodyText || detail.data.snippet || ""
    };
  }

  async createDraft(input: Record<string, unknown>) {
    const auth = await this.oauth.getClientOrThrow();
    const gmail = google.gmail({ version: "v1", auth });
    const to = String(input.to ?? "");
    const subject = String(input.subject ?? "");
    const body = String(input.body ?? "");

    const raw = encodeEmail(`To: ${to}\r\nSubject: ${subject}\r\n\r\n${body}`);
    const draft = await gmail.users.drafts.create({
      userId: "me",
      requestBody: {
        message: {
          raw
        }
      }
    });

    return {
      id: draft.data.id,
      messageId: draft.data.message?.id
    };
  }

  async sendMessage(input: Record<string, unknown>) {
    const auth = await this.oauth.getClientOrThrow();
    const gmail = google.gmail({ version: "v1", auth });
    const to = String(input.to ?? "");
    const subject = String(input.subject ?? "");
    const body = String(input.body ?? "");

    const raw = encodeEmail(`To: ${to}\r\nSubject: ${subject}\r\n\r\n${body}`);
    const sent = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw }
    });

    return {
      id: sent.data.id,
      threadId: sent.data.threadId
    };
  }
}

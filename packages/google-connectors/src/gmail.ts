import { google } from "googleapis";

import type { GoogleOAuthManager } from "./oauth.js";

const encodeEmail = (raw: string) => Buffer.from(raw).toString("base64url");

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

        return {
          id: detail.data.id,
          threadId: detail.data.threadId,
          snippet: detail.data.snippet,
          labelIds: detail.data.labelIds
        };
      })
    );

    return {
      query,
      messages
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

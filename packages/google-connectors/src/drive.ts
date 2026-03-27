import fs from "node:fs/promises";
import path from "node:path";

import { google } from "googleapis";

import type { GoogleOAuthManager } from "./oauth.js";

export class GoogleDriveConnector {
  constructor(private readonly oauth: GoogleOAuthManager) {}

  async searchFiles(input: Record<string, unknown>) {
    const auth = await this.oauth.getClientOrThrow();
    const drive = google.drive({ version: "v3", auth });

    const response = await drive.files.list({
      q: typeof input.query === "string" ? input.query : undefined,
      pageSize: typeof input.pageSize === "number" ? input.pageSize : 10,
      fields: "files(id,name,mimeType,webViewLink,modifiedTime,size)"
    });

    return {
      files: response.data.files ?? []
    };
  }

  async getFileMetadata(input: Record<string, unknown>) {
    const auth = await this.oauth.getClientOrThrow();
    const drive = google.drive({ version: "v3", auth });

    const response = await drive.files.get({
      fileId: String(input.fileId),
      fields: "id,name,mimeType,webViewLink,modifiedTime,size,owners"
    });

    return response.data as Record<string, unknown>;
  }

  async downloadFile(input: Record<string, unknown>) {
    const auth = await this.oauth.getClientOrThrow();
    const drive = google.drive({ version: "v3", auth });
    const fileId = String(input.fileId);
    const targetPath = String(input.targetPath ?? "");

    if (!targetPath) {
      throw new Error("drive.download_file requires a targetPath.");
    }

    const response = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" }
    );

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, Buffer.from(response.data as ArrayBuffer));

    return {
      fileId,
      targetPath
    };
  }
}

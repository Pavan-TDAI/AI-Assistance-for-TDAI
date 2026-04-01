import fs from "node:fs/promises";
import path from "node:path";

import { createId, nowIso, type MessageAttachment } from "@personal-ai/shared";
import type { Request } from "express";

import type { AuditLogService } from "./audit-log-service.js";

interface ParsedMultipartFile {
  fieldName: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}

interface ParsedMultipartRequest {
  fields: Record<string, string>;
  files: ParsedMultipartFile[];
}

const allowedExtensions = new Set([".txt", ".md", ".pdf", ".docx", ".csv", ".json"]);
const maxAttachmentBytes = 8 * 1024 * 1024;
const maxRequestBytes = 20 * 1024 * 1024;

const safeFileName = (value: string) =>
  value
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim()
    .slice(0, 80) || "upload";

const decodePdfEscapes = (value: string) =>
  value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\([()\\])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

const extractPdfPreviewFromBinary = (buffer: Buffer, maxLength: number) => {
  const raw = buffer.toString("latin1");
  const textChunks = [
    ...Array.from(raw.matchAll(/\(([^()]*)\)\s*Tj/g), (match) => decodePdfEscapes(match[1] ?? "")),
    ...Array.from(raw.matchAll(/\[(.*?)\]\s*TJ/gs), (match) =>
      Array.from((match[1] ?? "").matchAll(/\(([^()]*)\)/g), (group) =>
        decodePdfEscapes(group[1] ?? "")
      ).join(" ")
    )
  ]
    .map((chunk) => chunk.replace(/\s+/g, " ").trim())
    .filter((chunk) => chunk.length > 3);

  return [...new Set(textChunks)].join("\n").slice(0, maxLength).trim();
};

const extractPreview = (buffer: Buffer, extension: string) => {
  if (extension === ".pdf") {
    return extractPdfPreviewFromBinary(buffer, 1200) || undefined;
  }

  if (extension === ".docx") {
    return undefined;
  }

  return buffer.toString("utf8").replace(/\u0000/g, "").trim().slice(0, 1200) || undefined;
};

const readRawRequestBuffer = async (request: Request) =>
  new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    request.on("data", (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > maxRequestBytes) {
        reject(new Error("The upload is too large."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });

const parseMultipartHeaders = (rawHeaders: string) => {
  const headers = new Map<string, string>();
  for (const line of rawHeaders.split("\r\n")) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }
    headers.set(
      line.slice(0, separatorIndex).trim().toLowerCase(),
      line.slice(separatorIndex + 1).trim()
    );
  }
  return headers;
};

const parseMultipartFormData = async (request: Request): Promise<ParsedMultipartRequest> => {
  const contentType = request.header("content-type") ?? "";
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2];
  if (!boundary) {
    throw new Error("Missing multipart boundary.");
  }

  const buffer = await readRawRequestBuffer(request);
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const fields: Record<string, string> = {};
  const files: ParsedMultipartFile[] = [];

  let cursor = buffer.indexOf(boundaryBuffer);
  while (cursor !== -1) {
    const nextBoundaryIndex = buffer.indexOf(boundaryBuffer, cursor + boundaryBuffer.length);
    if (nextBoundaryIndex === -1) {
      break;
    }

    let part = buffer.subarray(cursor + boundaryBuffer.length, nextBoundaryIndex);
    if (part.subarray(0, 2).toString("latin1") === "\r\n") {
      part = part.subarray(2);
    }
    if (!part.length || part.subarray(0, 2).toString("latin1") === "--") {
      cursor = nextBoundaryIndex;
      continue;
    }
    if (part.subarray(part.length - 2).toString("latin1") === "\r\n") {
      part = part.subarray(0, part.length - 2);
    }

    const headerSeparator = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerSeparator === -1) {
      cursor = nextBoundaryIndex;
      continue;
    }

    const headers = parseMultipartHeaders(part.subarray(0, headerSeparator).toString("utf8"));
    const contentDisposition = headers.get("content-disposition") ?? "";
    const nameMatch = contentDisposition.match(/name="([^"]+)"/i);
    const fileNameMatch = contentDisposition.match(/filename="([^"]*)"/i);
    const fieldName = nameMatch?.[1];
    if (!fieldName) {
      cursor = nextBoundaryIndex;
      continue;
    }

    const body = part.subarray(headerSeparator + 4);
    if (fileNameMatch && fileNameMatch[1]) {
      files.push({
        fieldName,
        fileName: fileNameMatch[1],
        mimeType: headers.get("content-type") ?? "application/octet-stream",
        buffer: body
      });
    } else {
      fields[fieldName] = body.toString("utf8");
    }

    cursor = nextBoundaryIndex;
  }

  return {
    fields,
    files
  };
};

export class ChatAttachmentService {
  constructor(
    private readonly workingDirectory: string,
    private readonly audit: AuditLogService
  ) {}

  async parsePromptRequest(request: Request, profileId: string) {
    const parsed = await parseMultipartFormData(request);
    const storedAttachments = await this.storeAttachments(profileId, parsed.files);

    return {
      sessionId: parsed.fields.sessionId?.trim() || undefined,
      conversationId: parsed.fields.conversationId?.trim() || undefined,
      content: parsed.fields.content ?? "",
      selectedMeetingId: parsed.fields.selectedMeetingId?.trim() || undefined,
      attachments: storedAttachments
    };
  }

  private async storeAttachments(profileId: string, files: ParsedMultipartFile[]) {
    const uploadDirectory = path.join(this.workingDirectory, ".tdai-uploads", profileId);
    await fs.mkdir(uploadDirectory, { recursive: true });

    const attachments: MessageAttachment[] = [];
    for (const file of files) {
      const extension = path.extname(file.fileName).toLowerCase();
      if (!allowedExtensions.has(extension)) {
        throw new Error(`Unsupported attachment type: ${extension || file.fileName}`);
      }
      if (file.buffer.byteLength > maxAttachmentBytes) {
        throw new Error(`${file.fileName} exceeds the 8 MB attachment limit.`);
      }

      const timestamp = nowIso();
      const attachmentId = createId("attachment");
      const fileName = safeFileName(file.fileName);
      const storagePath = path.join(uploadDirectory, `${attachmentId}-${fileName}`);
      await fs.writeFile(storagePath, file.buffer);

      const attachment: MessageAttachment = {
        id: attachmentId,
        fileName: file.fileName,
        mimeType: file.mimeType,
        extension,
        sizeBytes: file.buffer.byteLength,
        storagePath,
        extractedTextPreview: extractPreview(file.buffer, extension),
        uploadedAt: timestamp
      };

      attachments.push(attachment);
      await this.audit.log({
        action: "attachment_uploaded",
        entityType: "message_attachment",
        entityId: attachmentId,
        message: `Uploaded attachment ${file.fileName}`,
        payload: {
          profileId,
          storagePath,
          sizeBytes: file.buffer.byteLength
        }
      });
    }

    return attachments;
  }
}

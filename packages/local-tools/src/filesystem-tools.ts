import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { z } from "zod";

import type { ToolDefinition } from "@personal-ai/tool-registry";

import { detectTextPreview, resolveInputPath } from "./path-utils.js";

const listFilesInputSchema = z.object({
  path: z.string().optional(),
  recursive: z.boolean().default(false),
  maxDepth: z.number().int().min(0).max(6).default(2),
  includeHidden: z.boolean().default(false),
  limit: z.number().int().min(1).max(200).default(50)
});

const searchFilesInputSchema = z.object({
  path: z.string().optional(),
  query: z.string().min(1),
  extensions: z.array(z.string()).default([]),
  limit: z.number().int().min(1).max(200).default(50)
});

const readFileInputSchema = z.object({
  path: z.string().min(1),
  maxBytes: z.number().int().min(256).max(1_000_000).default(50_000)
});

const writeFileInputSchema = z.object({
  path: z.string().min(1),
  content: z.string().default(""),
  mode: z.enum(["overwrite", "append"]).default("overwrite"),
  createDirectories: z.boolean().default(true)
});

const deleteFileInputSchema = z.object({
  path: z.string().min(1),
  recursive: z.boolean().default(false)
});

interface ListedEntry {
  path: string;
  type: "file" | "directory";
  size: number;
}

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

  const combined = [...new Set(textChunks)].join("\n").slice(0, maxLength);
  return combined.trim();
};

const extractPdfPreview = async (
  targetPath: string,
  fileBuffer: Buffer,
  maxLength: number,
  browser: {
    navigate: (url: string) => Promise<{ title: string; url: string }>;
    extractText: (selector?: string) => Promise<{ selector: string; text: string }>;
  }
) => {
  const binaryPreview = extractPdfPreviewFromBinary(fileBuffer, maxLength);
  if (binaryPreview.length >= 180) {
    return binaryPreview;
  }

  try {
    await browser.navigate(pathToFileURL(targetPath).href);
    const extracted = await browser.extractText("body");
    const pdfPreview = extracted.text.replace(/\s+/g, " ").trim().slice(0, maxLength);
    if (pdfPreview.length >= 80) {
      return pdfPreview;
    }
  } catch {
    return binaryPreview || "Could not extract readable text from this PDF.";
  }

  return binaryPreview || "Could not extract readable text from this PDF.";
};

const walkDirectory = async (
  currentPath: string,
  options: z.infer<typeof listFilesInputSchema>,
  depth: number,
  results: ListedEntry[]
) => {
  const entries = await fs.readdir(currentPath, { withFileTypes: true });

  for (const entry of entries) {
    if (!options.includeHidden && entry.name.startsWith(".")) {
      continue;
    }

    const absolutePath = path.join(currentPath, entry.name);
    const stat = await fs.stat(absolutePath);
    results.push({
      path: absolutePath,
      type: entry.isDirectory() ? "directory" : "file",
      size: stat.size
    });

    if (results.length >= options.limit) {
      return;
    }

    if (
      options.recursive &&
      entry.isDirectory() &&
      depth < options.maxDepth &&
      results.length < options.limit
    ) {
      await walkDirectory(absolutePath, options, depth + 1, results);
    }
  }
};

const searchByName = async (
  currentPath: string,
  query: string,
  extensions: string[],
  limit: number,
  results: string[]
) => {
  const entries = await fs.readdir(currentPath, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      await searchByName(absolutePath, query, extensions, limit, results);
    } else {
      const matchesName = entry.name.toLowerCase().includes(query.toLowerCase());
      const matchesExtension =
        !extensions.length ||
        extensions.some((ext) =>
          entry.name.toLowerCase().endsWith(ext.toLowerCase().startsWith(".") ? ext.toLowerCase() : `.${ext.toLowerCase()}`)
        );

      if (matchesName && matchesExtension) {
        results.push(absolutePath);
      }
    }

    if (results.length >= limit) {
      return;
    }
  }
};

export const createFilesystemTools = (): ToolDefinition[] => [
  {
    name: "filesystem.list",
    description: "List files and folders on the local machine.",
    permissionCategory: "filesystem_list",
    safeByDefault: true,
    schema: listFilesInputSchema,
    summariseInput: (input) =>
      `List files in ${input.path ?? "."}${input.recursive ? " recursively" : ""}`,
    handler: async (input, context) => {
      const targetPath = resolveInputPath(context.services.workingDirectory, input.path);
      const results: ListedEntry[] = [];
      await walkDirectory(targetPath, input, 0, results);

      return {
        summary: `Listed ${results.length} item(s) from ${targetPath}.`,
        output: {
          targetPath,
          entries: results
        }
      };
    }
  },
  {
    name: "filesystem.search",
    description: "Search for files by filename and optional extension filters.",
    permissionCategory: "filesystem_list",
    safeByDefault: true,
    schema: searchFilesInputSchema,
    summariseInput: (input) =>
      `Search files in ${input.path ?? "."} for "${input.query}"`,
    handler: async (input, context) => {
      const targetPath = resolveInputPath(context.services.workingDirectory, input.path);
      const matches: string[] = [];
      await searchByName(targetPath, input.query, input.extensions, input.limit, matches);

      return {
        summary: `Found ${matches.length} matching file(s).`,
        output: {
          targetPath,
          matches
        }
      };
    }
  },
  {
    name: "filesystem.read",
    description: "Read the contents of a local text file or extract readable text from a PDF.",
    permissionCategory: "filesystem_read",
    safeByDefault: false,
    schema: readFileInputSchema,
    summariseInput: (input) => `Read file ${input.path}`,
    handler: async (input, context) => {
      const targetPath = resolveInputPath(context.services.workingDirectory, input.path);
      const fileBuffer = await fs.readFile(targetPath);
      const extension = path.extname(targetPath).toLowerCase();
      const preview =
        extension === ".pdf"
          ? await extractPdfPreview(
              targetPath,
              fileBuffer,
              input.maxBytes,
              context.services.browser
            )
          : detectTextPreview(fileBuffer, input.maxBytes);

      return {
        summary:
          extension === ".pdf"
            ? `Extracted readable text from ${targetPath}.`
            : `Read ${Math.min(fileBuffer.byteLength, input.maxBytes)} byte(s) from ${targetPath}.`,
        output: {
          path: targetPath,
          bytes: fileBuffer.byteLength,
          content: preview
        }
      };
    }
  },
  {
    name: "filesystem.write",
    description:
      "Write or append text content to a local file. Use empty content to create a blank file.",
    permissionCategory: "filesystem_write",
    safeByDefault: false,
    schema: writeFileInputSchema,
    summariseInput: (input) => `${input.mode} text file ${input.path}`,
    handler: async (input, context) => {
      const targetPath = resolveInputPath(context.services.workingDirectory, input.path);

      if (input.createDirectories) {
        const parent = path.dirname(targetPath);
        if (parent) {
          await fs.mkdir(parent, { recursive: true });
        }
      }

      if (input.mode === "append") {
        await fs.appendFile(targetPath, input.content, "utf8");
      } else {
        await fs.writeFile(targetPath, input.content, "utf8");
      }

      return {
        summary: `Wrote content to ${targetPath}.`,
        output: {
          path: targetPath,
          bytesWritten: Buffer.byteLength(input.content, "utf8"),
          mode: input.mode
        }
      };
    }
  },
  {
    name: "filesystem.delete",
    description:
      "Delete a local file or directory. Requires explicit approval and recursive=true for directories.",
    permissionCategory: "filesystem_delete",
    safeByDefault: false,
    schema: deleteFileInputSchema,
    summariseInput: (input) => `Delete ${input.path}${input.recursive ? " recursively" : ""}`,
    handler: async (input, context) => {
      const targetPath = resolveInputPath(context.services.workingDirectory, input.path);
      const stat = await fs.stat(targetPath);

      if (stat.isDirectory()) {
        await fs.rm(targetPath, {
          recursive: input.recursive,
          force: false
        });
      } else {
        await fs.unlink(targetPath);
      }

      return {
        summary: `Deleted ${targetPath}.`,
        output: {
          path: targetPath,
          deleted: true,
          recursive: input.recursive
        }
      };
    }
  }
];

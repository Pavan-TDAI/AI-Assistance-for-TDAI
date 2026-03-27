import os from "node:os";
import path from "node:path";

export const resolveInputPath = (workingDirectory: string, rawPath?: string) => {
  const candidate = rawPath?.trim() ? rawPath.trim() : workingDirectory;
  const unquoted = candidate.replace(/^["']|["']$/g, "");
  const resolvedAlias = resolveKnownFolderAlias(unquoted, workingDirectory);

  if (resolvedAlias) {
    return resolvedAlias;
  }

  if (path.isAbsolute(unquoted)) {
    return path.normalize(unquoted);
  }

  if (unquoted.startsWith("~")) {
    return path.join(os.homedir(), unquoted.slice(1));
  }

  return path.resolve(workingDirectory, unquoted);
};

export const normaliseForWindows = (inputPath: string) =>
  path.normalize(inputPath).replace(/\\/g, "/").toLowerCase();

export const isPathWithinAnyRoot = (inputPath: string, roots: string[]) => {
  if (!roots.length) {
    return false;
  }

  const normalisedPath = normaliseForWindows(path.resolve(inputPath));

  return roots.some((root) => {
    const normalisedRoot = normaliseForWindows(path.resolve(root));
    return (
      normalisedPath === normalisedRoot ||
      normalisedPath.startsWith(`${normalisedRoot}/`)
    );
  });
};

export const detectTextPreview = (buffer: Buffer, maxLength = 5000) =>
  buffer.toString("utf8", 0, Math.min(buffer.length, maxLength));

const resolveKnownFolderAlias = (inputPath: string, workingDirectory: string) => {
  const normalized = inputPath
    .toLowerCase()
    .replace(/\b(my|the)\b/g, "")
    .replace(/\b(folder|directory)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const home = os.homedir();
  const aliases: Record<string, string> = {
    downloads: path.join(home, "Downloads"),
    download: path.join(home, "Downloads"),
    desktop: path.join(home, "Desktop"),
    documents: path.join(home, "Documents"),
    document: path.join(home, "Documents"),
    home: home,
    "home folder": home,
    workspace: workingDirectory,
    project: workingDirectory,
    "project root": workingDirectory,
    cwd: workingDirectory
  };

  if (aliases[normalized]) {
    return aliases[normalized];
  }

  const slashNormalized = normalized.replace(/\\/g, "/");
  const slashInput = inputPath.replace(/\\/g, "/");
  for (const [alias, basePath] of Object.entries(aliases)) {
    if (slashNormalized.startsWith(`${alias}/`)) {
      const remainder = slashInput.slice(alias.length + 1);
      return path.join(basePath, remainder);
    }
  }

  return undefined;
};

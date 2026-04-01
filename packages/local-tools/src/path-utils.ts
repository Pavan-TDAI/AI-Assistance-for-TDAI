import os from "node:os";
import path from "node:path";

const windowsDrivePathPattern = /^[A-Za-z]:[\\/]/;
const uncPathPattern = /^\\\\/;

const isWindowsLikePath = (inputPath: string) =>
  windowsDrivePathPattern.test(inputPath) || uncPathPattern.test(inputPath);

const normaliseResolvedPath = (inputPath: string) => {
  if (isWindowsLikePath(inputPath)) {
    return path.win32.normalize(inputPath).replace(/\\/g, "/").toLowerCase();
  }

  return path.posix.normalize(inputPath.replace(/\\/g, "/"));
};

const resolvePortablePath = (inputPath: string, basePath?: string) => {
  const candidate = inputPath.trim();
  const base = basePath?.trim();

  if (isWindowsLikePath(candidate)) {
    return path.win32.normalize(
      base && isWindowsLikePath(base)
        ? path.win32.resolve(base, candidate)
        : path.win32.resolve(candidate)
    );
  }

  if (candidate.startsWith("/")) {
    return path.posix.normalize(
      base && !isWindowsLikePath(base)
        ? path.posix.resolve(base, candidate)
        : path.posix.resolve(candidate)
    );
  }

  if (base) {
    return isWindowsLikePath(base) ? path.win32.resolve(base, candidate) : path.resolve(base, candidate);
  }

  return path.resolve(candidate);
};

export const resolveInputPath = (workingDirectory: string, rawPath?: string) => {
  const candidate = rawPath?.trim() ? rawPath.trim() : workingDirectory;
  const unquoted = candidate.replace(/^["']|["']$/g, "");
  const resolvedAlias = resolveKnownFolderAlias(unquoted, workingDirectory);

  if (resolvedAlias) {
    return resolvedAlias;
  }

  if (path.isAbsolute(unquoted) || isWindowsLikePath(unquoted)) {
    return resolvePortablePath(unquoted);
  }

  if (unquoted.startsWith("~")) {
    return path.join(os.homedir(), unquoted.slice(1));
  }

  return resolvePortablePath(unquoted, workingDirectory);
};

export const normaliseForWindows = (inputPath: string) => normaliseResolvedPath(inputPath);

export const isPathWithinAnyRoot = (inputPath: string, roots: string[]) => {
  if (!roots.length) {
    return false;
  }

  const normalisedPath = normaliseResolvedPath(resolvePortablePath(inputPath));

  return roots.some((root) => {
    const normalisedRoot = normaliseResolvedPath(resolvePortablePath(root));
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

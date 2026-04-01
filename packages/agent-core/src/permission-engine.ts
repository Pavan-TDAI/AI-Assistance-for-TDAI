import path from "node:path";
import { URL } from "node:url";

import type { SettingsRecord } from "@personal-ai/shared";
import type { ToolDefinition } from "@personal-ai/tool-registry";

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
    return normaliseResolvedPath(
      base && isWindowsLikePath(base)
        ? path.win32.resolve(base, candidate)
        : path.win32.resolve(candidate)
    );
  }

  if (candidate.startsWith("/")) {
    return normaliseResolvedPath(
      base && !isWindowsLikePath(base)
        ? path.posix.resolve(base, candidate)
        : path.posix.resolve(candidate)
    );
  }

  if (base) {
    return normaliseResolvedPath(
      isWindowsLikePath(base) ? path.win32.resolve(base, candidate) : path.resolve(base, candidate)
    );
  }

  return normaliseResolvedPath(path.resolve(candidate));
};

const isPathWithinAnyRoot = (inputPath: string, roots: string[]) => {
  if (!roots.length) {
    return false;
  }

  const resolvedPath = resolvePortablePath(inputPath);

  return roots.some((root) => {
    const resolvedRoot = resolvePortablePath(root);
    return resolvedPath === resolvedRoot || resolvedPath.startsWith(`${resolvedRoot}/`);
  });
};

const approvalMatrix = {
  filesystem_list: "filesystemList",
  filesystem_read: "filesystemRead",
  filesystem_write: "filesystemWrite",
  filesystem_delete: "filesystemDelete",
  shell_execute: "shellExecute",
  browser_automation: "browserAutomation",
  system_app: "systemApp",
  gmail: "gmail",
  calendar: "calendar",
  drive: "drive",
  external_api: "externalApi"
} as const;

export interface PermissionDecision {
  requiresApproval: boolean;
  reason: string;
}

export class PermissionEngine {
  evaluate(
    tool: ToolDefinition,
    input: Record<string, unknown>,
    settings: SettingsRecord,
    workingDirectory: string
  ): PermissionDecision {
    const approvalKey = approvalMatrix[tool.permissionCategory];
    const approvalDefault = settings.approvalDefaults[approvalKey];

    if (tool.permissionCategory === "filesystem_list" && tool.safeByDefault && approvalDefault) {
      return {
        requiresApproval: false,
        reason: "Low-risk file listing/search is auto-approved by current settings."
      };
    }

    if (tool.permissionCategory === "filesystem_read") {
      const filePath =
        typeof input.path === "string"
          ? resolvePortablePath(input.path, workingDirectory)
          : resolvePortablePath(workingDirectory);

      if (approvalDefault && isPathWithinAnyRoot(filePath, settings.toolPreferences.safeRoots)) {
        return {
          requiresApproval: false,
          reason: "File read falls under the configured safe roots."
        };
      }
    }

    if (tool.permissionCategory === "shell_execute") {
      const command = String(input.command ?? "");
      const matchesSafeCommand = settings.toolPreferences.safeShellCommands.some((safePrefix) =>
        command.toLowerCase().startsWith(safePrefix.toLowerCase())
      );

      if (approvalDefault && matchesSafeCommand) {
        return {
          requiresApproval: false,
          reason: "Shell command matches the configured safe allowlist."
        };
      }
    }

    if (tool.permissionCategory === "browser_automation") {
      const url = typeof input.url === "string" ? input.url : undefined;
      if (approvalDefault && url) {
        const domain = new URL(url).hostname;
        if (settings.toolPreferences.alwaysAllowDomains.includes(domain)) {
          return {
            requiresApproval: false,
            reason: "Browser action targets an always-allowed domain."
          };
        }
      }
    }

    if (approvalDefault && tool.safeByDefault) {
      return {
        requiresApproval: false,
        reason: "Tool is configured as safe by default."
      };
    }

    return {
      requiresApproval: true,
      reason: `Tool category "${tool.permissionCategory}" requires explicit approval under current settings.`
    };
  }
}

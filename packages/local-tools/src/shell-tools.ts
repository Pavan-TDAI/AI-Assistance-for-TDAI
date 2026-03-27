import { spawn } from "node:child_process";

import { z } from "zod";

import type { ToolDefinition } from "@personal-ai/tool-registry";

import { resolveInputPath } from "./path-utils.js";

const shellInputSchema = z.object({
  command: z.string().min(1),
  cwd: z.string().optional()
});

const collectProcessOutput = async (
  command: string,
  cwd: string,
  maxChars: number
) =>
  new Promise<{ stdout: string; stderr: string; exitCode: number | null }>((resolve, reject) => {
    const child = spawn(
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
      ["-NoProfile", "-Command", command],
      { cwd, windowsHide: true }
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout = `${stdout}${chunk.toString()}`.slice(-maxChars);
    });

    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-maxChars);
    });

    child.on("error", reject);
    child.on("close", (exitCode) => resolve({ stdout, stderr, exitCode }));
  });

export const createShellTools = (): ToolDefinition[] => [
  {
    name: "shell.execute",
    description: "Run a local PowerShell command with audit logging and safety checks.",
    permissionCategory: "shell_execute",
    safeByDefault: false,
    timeoutMs: 20_000,
    schema: shellInputSchema,
    summariseInput: (input) => `Execute shell command: ${input.command}`,
    handler: async (input, context) => {
      const blockedPatterns = context.services.settings.toolPreferences.blockedShellPatterns;
      const matchedPattern = blockedPatterns.find((pattern) =>
        new RegExp(pattern, "i").test(input.command)
      );

      if (matchedPattern) {
        throw new Error(
          `Blocked shell pattern matched: ${matchedPattern}. Update settings only if you explicitly want to allow it.`
        );
      }

      const cwd = resolveInputPath(context.services.workingDirectory, input.cwd);
      const result = await collectProcessOutput(
        input.command,
        cwd,
        context.services.settings.toolPreferences.maxShellOutputChars
      );

      return {
        summary: `Command finished with exit code ${result.exitCode ?? "unknown"}.`,
        output: {
          cwd,
          ...result
        }
      };
    }
  }
];

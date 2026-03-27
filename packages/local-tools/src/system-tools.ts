import { spawn } from "node:child_process";

import { z } from "zod";

import type { ToolDefinition } from "@personal-ai/tool-registry";

const openAppSchema = z.object({
  target: z.string().min(1),
  args: z.array(z.string()).default([]),
  workingDirectory: z.string().optional()
});

const startProcess = async (
  target: string,
  args: string[],
  cwd?: string
) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn("cmd.exe", ["/c", "start", "\"\"", target, ...args], {
      cwd,
      windowsHide: true
    });

    child.on("error", reject);
    child.on("close", () => resolve());
  });

export const createSystemTools = (): ToolDefinition[] => [
  {
    name: "system.open_app",
    description: "Open a local application, process, or file with the operating system.",
    permissionCategory: "system_app",
    safeByDefault: false,
    schema: openAppSchema,
    summariseInput: (input) => `Open app or file: ${input.target}`,
    handler: async (input) => {
      await startProcess(input.target, input.args, input.workingDirectory);

      return {
        summary: `Opened ${input.target}.`,
        output: {
          target: input.target,
          args: input.args
        }
      };
    }
  }
];

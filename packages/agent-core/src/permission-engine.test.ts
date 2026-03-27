import { describe, expect, it } from "vitest";

import { SettingsSchema, createDefaultSettings } from "@personal-ai/shared";

import { PermissionEngine } from "./permission-engine.js";
import type { ToolDefinition } from "@personal-ai/tool-registry";

const buildTool = (
  overrides: Partial<ToolDefinition> & Pick<ToolDefinition, "name" | "permissionCategory">
): ToolDefinition => ({
  name: overrides.name,
  description: "test tool",
  permissionCategory: overrides.permissionCategory,
  safeByDefault: overrides.safeByDefault ?? false,
  schema: {
    parse(value: unknown) {
      return value;
    }
  } as ToolDefinition["schema"],
  handler: async () => ({
    summary: "ok",
    output: {}
  })
});

const buildSettings = () =>
  SettingsSchema.parse(
    createDefaultSettings({
      DEFAULT_PROVIDER: "mock",
      MONGODB_URI: "mongodb://localhost:27017"
    })
  );

describe("PermissionEngine", () => {
  it("auto-approves safe file listing when enabled", () => {
    const settings = buildSettings();
    const engine = new PermissionEngine();
    const tool = buildTool({
      name: "filesystem.list",
      permissionCategory: "filesystem_list",
      safeByDefault: true
    });

    const result = engine.evaluate(tool, {}, settings, "C:/workspace");
    expect(result.requiresApproval).toBe(false);
  });

  it("allows safe-root reads only when approval defaults enable it", () => {
    const settings = buildSettings();
    settings.approvalDefaults.filesystemRead = true;
    settings.toolPreferences.safeRoots = ["C:/workspace/docs"];

    const engine = new PermissionEngine();
    const tool = buildTool({
      name: "filesystem.read",
      permissionCategory: "filesystem_read"
    });

    const result = engine.evaluate(
      tool,
      { path: "C:/workspace/docs/notes.txt" },
      settings,
      "C:/workspace"
    );

    expect(result.requiresApproval).toBe(false);
  });

  it("requires approval for browser navigation unless domain is explicitly allowed", () => {
    const settings = buildSettings();
    const engine = new PermissionEngine();
    const tool = buildTool({
      name: "browser.navigate",
      permissionCategory: "browser_automation"
    });

    expect(
      engine.evaluate(tool, { url: "https://example.com" }, settings, "C:/workspace")
        .requiresApproval
    ).toBe(true);

    settings.approvalDefaults.browserAutomation = true;
    settings.toolPreferences.alwaysAllowDomains = ["example.com"];

    expect(
      engine.evaluate(tool, { url: "https://example.com" }, settings, "C:/workspace")
        .requiresApproval
    ).toBe(false);
  });
});

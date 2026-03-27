import { z } from "zod";

import type { ToolDefinition } from "@personal-ai/tool-registry";

const navigateSchema = z.object({
  url: z.string().url()
});

const extractSchema = z.object({
  selector: z.string().default("body")
});

const clickSchema = z.object({
  selector: z.string().min(1)
});

const typeSchema = z.object({
  selector: z.string().min(1),
  text: z.string(),
  submit: z.boolean().default(false)
});

export const createBrowserTools = (): ToolDefinition[] => [
  {
    name: "browser.navigate",
    description: "Open a page in a Playwright-controlled browser session.",
    permissionCategory: "browser_automation",
    safeByDefault: false,
    schema: navigateSchema,
    summariseInput: (input) => `Navigate browser to ${input.url}`,
    handler: async (input, context) => {
      const output = await context.services.browser.navigate(input.url);
      return {
        summary: `Opened ${output.url}.`,
        output
      };
    }
  },
  {
    name: "browser.extract_text",
    description: "Extract visible text from the current browser page or selector.",
    permissionCategory: "browser_automation",
    safeByDefault: false,
    schema: extractSchema,
    summariseInput: (input) => `Extract browser text from ${input.selector}`,
    handler: async (input, context) => {
      const output = await context.services.browser.extractText(input.selector);
      return {
        summary: `Extracted text from ${output.selector}.`,
        output
      };
    }
  },
  {
    name: "browser.click",
    description: "Click an element in the current browser session.",
    permissionCategory: "browser_automation",
    safeByDefault: false,
    schema: clickSchema,
    summariseInput: (input) => `Click ${input.selector} in browser`,
    handler: async (input, context) => {
      const output = await context.services.browser.click(input.selector);
      return {
        summary: `Clicked ${output.selector}.`,
        output
      };
    }
  },
  {
    name: "browser.type",
    description: "Type text into an input in the current browser session.",
    permissionCategory: "browser_automation",
    safeByDefault: false,
    schema: typeSchema,
    summariseInput: (input) => `Type into ${input.selector}`,
    handler: async (input, context) => {
      const output = await context.services.browser.type(
        input.selector,
        input.text,
        input.submit
      );
      return {
        summary: `Typed into ${output.selector}.`,
        output
      };
    }
  }
];

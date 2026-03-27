import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ToolRegistry } from "./registry.js";

describe("ToolRegistry", () => {
  it("validates and executes tools", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "math.add",
      description: "Add numbers",
      permissionCategory: "external_api",
      schema: z.object({
        a: z.number(),
        b: z.number()
      }),
      handler: async (input) => ({
        summary: "done",
        output: {
          total: input.a + input.b
        }
      })
    });

    const result = await registry.execute("math.add", { a: 2, b: 3 }, {} as never);
    expect(result.result.output.total).toBe(5);
  });

  it("throws when tool input is invalid", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "math.add",
      description: "Add numbers",
      permissionCategory: "external_api",
      schema: z.object({
        a: z.number(),
        b: z.number()
      }),
      handler: async () => ({
        summary: "done",
        output: {}
      })
    });

    await expect(
      registry.execute("math.add", { a: "2", b: 3 }, {} as never)
    ).rejects.toThrow();
  });
});

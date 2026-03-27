import type { Request, Response, Router } from "express";

import { SettingsUpdateSchema } from "@personal-ai/shared";
import type { ToolRegistry } from "@personal-ai/tool-registry";

import type { SettingsService } from "../services/settings-service.js";
import { asyncHandler } from "./async-handler.js";

export const registerSettingsRoutes = (
  router: Router,
  settingsService: SettingsService,
  registry: ToolRegistry
) => {
  router.get(
    "/api/settings",
    asyncHandler(async (_request: Request, response: Response) => {
      response.json(await settingsService.getSettings());
    })
  );

  router.put(
    "/api/settings",
    asyncHandler(async (request: Request, response: Response) => {
      const payload = SettingsUpdateSchema.parse(request.body);
      response.json(await settingsService.updateSettings(payload));
    })
  );

  router.get("/api/tools", (_request: Request, response: Response) => {
    response.json(registry.list());
  });
};

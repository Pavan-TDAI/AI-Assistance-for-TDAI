import type { Request, Response, Router } from "express";

import { env } from "../config.js";
import type { ProviderFactory } from "@personal-ai/agent-core";
import type { SettingsService } from "../services/settings-service.js";
import { asyncHandler } from "./async-handler.js";

export const registerHealthRoutes = (
  router: Router,
  settingsService: SettingsService,
  providerFactory: ProviderFactory
) => {
  router.get(
    "/health",
    asyncHandler(async (_request: Request, response: Response) => {
      const settings = await settingsService.getSettings();
      response.json({
        ok: true,
        provider: settings?.provider ?? env.DEFAULT_PROVIDER,
        model: settings?.activeModel ?? env.DEFAULT_OPENAI_MODEL,
        routingPolicy: settings.routingPolicy,
        availableProviders: providerFactory.availableProviders(settings.provider),
        mongo: {
          uri: env.MONGODB_URI,
          dbName: env.MONGODB_DB_NAME
        }
      });
    })
  );
};

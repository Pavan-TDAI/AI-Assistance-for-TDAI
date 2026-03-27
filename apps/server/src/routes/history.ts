import type { Request, Response, Router } from "express";

import type { AgentDatabase } from "@personal-ai/db";
import { getAuthContext } from "../auth-context.js";
import { asyncHandler } from "./async-handler.js";

export const registerHistoryRoutes = (router: Router, db: AgentDatabase) => {
  router.get(
    "/api/history",
    asyncHandler(async (request: Request, response: Response) => {
      const { user } = getAuthContext(request);
      response.json(await db.buildHistorySnapshot(user.profileId));
    })
  );
};

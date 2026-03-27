import type { Request, Response, Router } from "express";

import type { AgentDatabase } from "@personal-ai/db";
import { PromptRequestSchema } from "@personal-ai/shared";

import { getAuthContext } from "../auth-context.js";
import type { AgentRuntimeService } from "../services/agent-runtime-service.js";
import type { RunStreamService } from "../services/run-stream-service.js";
import { asyncHandler } from "./async-handler.js";

export const registerChatRoutes = (
  router: Router,
  runtime: AgentRuntimeService,
  streamService: RunStreamService,
  db: AgentDatabase
) => {
  router.post(
    "/api/chat/send",
    asyncHandler(async (request: Request, response: Response) => {
      const payload = PromptRequestSchema.parse(request.body);
      const { user } = getAuthContext(request);
      const result = await runtime.sendPrompt({
        ...payload,
        profileId: user.profileId
      });
      response.json(result);
    })
  );

  router.get(
    "/api/runs/:runId/stream",
    asyncHandler(async (request: Request, response: Response) => {
      const { user } = getAuthContext(request);
      const runId = String(request.params.runId ?? "");
      const run = await db.getRun(runId);
      if (!run) {
        throw new Error("Run not found.");
      }

      const session = await db.getSession(run.sessionId, user.profileId);
      if (!session) {
        throw new Error("Run not found.");
      }

      streamService.subscribe(runId, response);
    })
  );
};

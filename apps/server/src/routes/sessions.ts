import type { Request, Response, Router } from "express";

import { getAuthContext } from "../auth-context.js";
import type { SessionService } from "../services/session-service.js";
import { asyncHandler } from "./async-handler.js";

export const registerSessionRoutes = (router: Router, sessionService: SessionService) => {
  router.get(
    "/api/sessions",
    asyncHandler(async (request: Request, response: Response) => {
      const { user } = getAuthContext(request);
      const includeArchived = request.query.includeArchived === "true";
      const archivedOnly = request.query.archivedOnly === "true";
      response.json(
        await sessionService.listSessions({
          includeArchived,
          archivedOnly,
          profileId: user.profileId
        })
      );
    })
  );

  router.get(
    "/api/sessions/:sessionId",
    asyncHandler(async (request: Request, response: Response) => {
      const { user } = getAuthContext(request);
      response.json(
        await sessionService.getSessionBundle(
          String(request.params.sessionId ?? ""),
          user.profileId
        )
      );
    })
  );

  router.post(
    "/api/sessions/:sessionId/archive",
    asyncHandler(async (request: Request, response: Response) => {
      const { user } = getAuthContext(request);
      response.json(
        await sessionService.archiveSession(
          String(request.params.sessionId ?? ""),
          user.profileId
        )
      );
    })
  );

  router.post(
    "/api/sessions/:sessionId/restore",
    asyncHandler(async (request: Request, response: Response) => {
      const { user } = getAuthContext(request);
      response.json(
        await sessionService.restoreSession(
          String(request.params.sessionId ?? ""),
          user.profileId
        )
      );
    })
  );

  router.delete(
    "/api/sessions/:sessionId",
    asyncHandler(async (request: Request, response: Response) => {
      const { user } = getAuthContext(request);
      await sessionService.deleteSession(String(request.params.sessionId ?? ""), user.profileId);
      response.status(204).send();
    })
  );
};

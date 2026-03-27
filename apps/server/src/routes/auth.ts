import type { Request, Response, Router, RequestHandler } from "express";

import {
  LoginRequestSchema,
  RegisterRequestSchema
} from "@personal-ai/shared";

import { getAuthContext } from "../auth-context.js";
import type { AuthService } from "../services/auth-service.js";
import { asyncHandler } from "./async-handler.js";

export const registerAuthRoutes = (
  router: Router,
  authService: AuthService,
  requireAuth: RequestHandler
) => {
  router.post(
    "/api/auth/register",
    asyncHandler(async (request: Request, response: Response) => {
      const payload = RegisterRequestSchema.parse(request.body);
      response.status(201).json(await authService.register(payload));
    })
  );

  router.post(
    "/api/auth/login",
    asyncHandler(async (request: Request, response: Response) => {
      const payload = LoginRequestSchema.parse(request.body);
      response.json(await authService.login(payload));
    })
  );

  router.get(
    "/api/auth/me",
    requireAuth,
    asyncHandler(async (request: Request, response: Response) => {
      response.json({
        user: getAuthContext(request).user
      });
    })
  );

  router.post(
    "/api/auth/logout",
    requireAuth,
    asyncHandler(async (request: Request, response: Response) => {
      const { accessToken } = getAuthContext(request);
      await authService.logout(accessToken);
      response.status(204).send();
    })
  );
};

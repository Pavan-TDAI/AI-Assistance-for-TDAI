import type { NextFunction, Request, Response } from "express";

import type { AuthUser } from "@personal-ai/shared";

import type { AuthService } from "./services/auth-service.js";

export interface RequestAuthContext {
  user: AuthUser;
  accessToken: string;
}

type RequestWithAuth = Request & {
  auth?: RequestAuthContext;
};

const readAccessToken = (request: Request) => {
  const authHeader = request.header("authorization");
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  const queryToken = request.query.accessToken;
  if (typeof queryToken === "string" && queryToken.trim()) {
    return queryToken.trim();
  }

  return null;
};

export const authMiddleware =
  (authService: AuthService) =>
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      if (request.method === "OPTIONS") {
        next();
        return;
      }

      const accessToken = readAccessToken(request);
      if (!accessToken) {
        response.status(401).json({
          error: "Authentication required."
        });
        return;
      }

      const user = await authService.getUserFromToken(accessToken);
      if (!user) {
        response.status(401).json({
          error: "Your session is invalid or expired. Please sign in again."
        });
        return;
      }

      (request as RequestWithAuth).auth = {
        user,
        accessToken
      };
      next();
    } catch (error) {
      next(error);
    }
  };

export const getAuthContext = (request: Request): RequestAuthContext => {
  const auth = (request as RequestWithAuth).auth;
  if (!auth) {
    throw new Error("Authentication required.");
  }

  return auth;
};

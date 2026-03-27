import type { Request, Response, Router } from "express";

import {
  GoogleWorkspaceConnectorSecretSchema,
  Microsoft365ConnectorSecretSchema
} from "@personal-ai/shared";

import type { ConnectorService } from "../services/connector-service.js";
import type { AuditLogService } from "../services/audit-log-service.js";
import { asyncHandler } from "./async-handler.js";

export const registerConnectorRoutes = (
  router: Router,
  connectorService: ConnectorService,
  audit: AuditLogService
) => {
  router.get(
    "/api/connectors",
    asyncHandler(async (_request: Request, response: Response) => {
      response.json(await connectorService.listStatuses());
    })
  );

  router.put(
    "/api/connectors/google-workspace",
    asyncHandler(async (request: Request, response: Response) => {
      const payload = GoogleWorkspaceConnectorSecretSchema.parse(request.body);
      await connectorService.saveGoogleWorkspaceConfig(payload);
      await audit.log({
        action: "connector_updated",
        message: "Google Workspace connector updated.",
        entityType: "connector",
        entityId: "google-workspace",
        payload: {
          source: "vault"
        }
      });
      response.json(await connectorService.listStatuses());
    })
  );

  router.delete(
    "/api/connectors/google-workspace",
    asyncHandler(async (_request: Request, response: Response) => {
      await connectorService.clearGoogleWorkspaceConfig();
      await audit.log({
        action: "connector_updated",
        message: "Google Workspace connector removed from vault.",
        entityType: "connector",
        entityId: "google-workspace",
        payload: {
          source: "vault",
          removed: true
        }
      });
      response.json(await connectorService.listStatuses());
    })
  );

  router.put(
    "/api/connectors/microsoft-365",
    asyncHandler(async (request: Request, response: Response) => {
      const payload = Microsoft365ConnectorSecretSchema.parse(request.body);
      await connectorService.saveMicrosoft365Config(payload);
      await audit.log({
        action: "connector_updated",
        message: "Microsoft 365 connector updated.",
        entityType: "connector",
        entityId: "microsoft-365",
        payload: {
          source: "vault"
        }
      });
      response.json(await connectorService.listStatuses());
    })
  );

  router.delete(
    "/api/connectors/microsoft-365",
    asyncHandler(async (_request: Request, response: Response) => {
      await connectorService.clearMicrosoft365Config();
      await audit.log({
        action: "connector_updated",
        message: "Microsoft 365 connector removed from vault.",
        entityType: "connector",
        entityId: "microsoft-365",
        payload: {
          source: "vault",
          removed: true
        }
      });
      response.json(await connectorService.listStatuses());
    })
  );
};

import type { Request, Response, Router } from "express";

import {
  ReportQueryRequestSchema,
  type BlockerTrackingRecord
} from "@personal-ai/shared";

import type { ReportingService } from "../services/reporting-service.js";
import { asyncHandler } from "./async-handler.js";

const readFilters = (request: Request) => ({
  employeeName:
    typeof request.query.employeeName === "string" ? request.query.employeeName : undefined,
  startDate:
    typeof request.query.startDate === "string" ? request.query.startDate : undefined,
  endDate: typeof request.query.endDate === "string" ? request.query.endDate : undefined,
  weekStartDate:
    typeof request.query.weekStartDate === "string" ? request.query.weekStartDate : undefined,
  blockerStatus:
    request.query.blockerStatus === "open" ||
    request.query.blockerStatus === "resolved" ||
    request.query.blockerStatus === "carried_forward"
      ? (request.query.blockerStatus as BlockerTrackingRecord["status"])
      : undefined,
  search: typeof request.query.search === "string" ? request.query.search : undefined
});

const safeFileName = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "report";

export const registerReportRoutes = (router: Router, reportingService: ReportingService) => {
  router.post(
    "/api/reports/email-updates/ingest",
    asyncHandler(async (request: Request, response: Response) => {
      response.json(await reportingService.ingestUpdateEmail(request.body));
    })
  );

  router.post(
    "/api/reports/email-updates/sync",
    asyncHandler(async (request: Request, response: Response) => {
      response.json(await reportingService.syncUpdateEmails(request.body));
    })
  );

  router.get(
    "/api/reports/daily-updates",
    asyncHandler(async (request: Request, response: Response) => {
      response.json(await reportingService.getDailyUpdatesTable(readFilters(request)));
    })
  );

  router.get(
    "/api/reports/blockers",
    asyncHandler(async (request: Request, response: Response) => {
      response.json(await reportingService.getBlockersTable(readFilters(request)));
    })
  );

  router.get(
    "/api/reports/resolved-blockers",
    asyncHandler(async (request: Request, response: Response) => {
      response.json(await reportingService.getBlockersTable(readFilters(request), true));
    })
  );

  router.get(
    "/api/reports/completed-vs-pending",
    asyncHandler(async (request: Request, response: Response) => {
      response.json(await reportingService.getCompletedVsPendingTable(readFilters(request)));
    })
  );

  router.get(
    "/api/reports/weekly-business-report",
    asyncHandler(async (request: Request, response: Response) => {
      response.json(await reportingService.getWeeklyBusinessReportTable(readFilters(request)));
    })
  );

  router.post(
    "/api/reports/query",
    asyncHandler(async (request: Request, response: Response) => {
      const payload = ReportQueryRequestSchema.parse(request.body);
      response.json(await reportingService.queryReportTable(payload.query, payload.syncMode));
    })
  );

  router.post(
    "/api/reports/export",
    asyncHandler(async (request: Request, response: Response) => {
      const file = reportingService.exportTable(request.body);
      const title =
        typeof request.body?.fileName === "string" && request.body.fileName.trim()
          ? request.body.fileName.trim()
          : typeof request.body?.title === "string"
            ? request.body.title
            : "report";

      response.setHeader("Content-Type", file.contentType);
      response.setHeader(
        "Content-Disposition",
        `attachment; filename="${safeFileName(title)}.${file.extension}"`
      );
      response.send(file.buffer);
    })
  );
};

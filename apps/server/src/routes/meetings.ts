import type { Request, Response, Router } from "express";

import {
  CreateMeetingRequestSchema,
  DraftMeetingEmailRequestSchema,
  GenerateMeetingMomRequestSchema,
  SendMeetingEmailRequestSchema
} from "@personal-ai/shared";

import type { MeetingService } from "../services/meeting-service.js";
import { asyncHandler } from "./async-handler.js";

export const registerMeetingRoutes = (router: Router, meetingService: MeetingService) => {
  router.get(
    "/api/meetings",
    asyncHandler(async (_request: Request, response: Response) => {
      response.json(await meetingService.listMeetings());
    })
  );

  router.post(
    "/api/meetings",
    asyncHandler(async (request: Request, response: Response) => {
      response.json(await meetingService.createMeeting(CreateMeetingRequestSchema.parse(request.body)));
    })
  );

  router.get(
    "/api/meetings/calendar-events",
    asyncHandler(async (_request: Request, response: Response) => {
      response.json(await meetingService.listCalendarEvents());
    })
  );

  router.get(
    "/api/meetings/calendar-events/:eventId",
    asyncHandler(async (request: Request, response: Response) => {
      response.json(await meetingService.getCalendarEventDetails(String(request.params.eventId ?? "")));
    })
  );

  router.get(
    "/api/meetings/:meetingId",
    asyncHandler(async (request: Request, response: Response) => {
      response.json(await meetingService.getMeeting(String(request.params.meetingId ?? "")));
    })
  );

  router.post(
    "/api/meetings/:meetingId/generate",
    asyncHandler(async (request: Request, response: Response) => {
      const payload = GenerateMeetingMomRequestSchema.parse(request.body ?? {});
      response.json(
        await meetingService.generateMom(
          String(request.params.meetingId ?? ""),
          payload.includeEmailDraft
        )
      );
    })
  );

  router.post(
    "/api/meetings/:meetingId/draft-email",
    asyncHandler(async (request: Request, response: Response) => {
      const payload = DraftMeetingEmailRequestSchema.parse(request.body ?? {});
      response.json(
        await meetingService.draftEmail(String(request.params.meetingId ?? ""), payload.to)
      );
    })
  );

  router.post(
    "/api/meetings/:meetingId/send-email",
    asyncHandler(async (request: Request, response: Response) => {
      const payload = SendMeetingEmailRequestSchema.parse(request.body ?? {});
      response.json(
        await meetingService.sendEmail(String(request.params.meetingId ?? ""), payload.to)
      );
    })
  );
};

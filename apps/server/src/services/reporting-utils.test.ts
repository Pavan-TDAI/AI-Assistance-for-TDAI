import { describe, expect, it } from "vitest";

import {
  blockersEquivalent,
  calculatePendingTasks,
  extractUpdateHeuristically,
  parseReportQuery
} from "./reporting-utils.js";

describe("reporting-utils", () => {
  it("extracts structured work updates from a typical evening mail", () => {
    const extraction = extractUpdateHeuristically({
      sourceEmailId: "mail_1",
      subject: "Daily night update",
      fromEmail: "Srishti Bk <srishti@example.com>",
      emailDate: "2026-03-28T21:15:00.000Z",
      rawEmailBody: `
Hi team,

Find my updates below

Highlights
- Continued progress on the Digital Marketing Automation Tool
- Successfully published a LinkedIn article for the day
- Had a detailed discussion with Keerthi and the team on go-to-market ideas

Lowlights / Challenges
- Faced issues while integrating Outlook Calendar sync
- API permissions allowed organization-wide calendars instead of individual access

Next Steps
- Continue refining new feature ideas over the weekend
- Present updated progress and improvements on Monday

Regards,
Srishti Bk
      `.trim()
    });

    expect(extraction.employeeName).toBe("Srishti Bk");
    expect(extraction.completedTasks).toEqual(
      expect.arrayContaining([
        "Continued progress on the Digital Marketing Automation Tool",
        "Successfully published a LinkedIn article for the day"
      ])
    );
    expect(extraction.blockers).toEqual(
      expect.arrayContaining([
        "Faced issues while integrating Outlook Calendar sync",
        "API permissions allowed organization-wide calendars instead of individual access"
      ])
    );
    expect(extraction.nextTasks).toEqual(
      expect.arrayContaining([
        "Continue refining new feature ideas over the weekend",
        "Present updated progress and improvements on Monday"
      ])
    );
    expect(extraction.mailType).toBe("night");
  });

  it("calculates pending tasks by matching semantically similar completions", () => {
    const pending = calculatePendingTasks(
      [
        "Continue progress on the automation tool",
        "Publish LinkedIn article",
        "Prepare Monday progress presentation"
      ],
      [
        "Continued progress on the automation tool",
        "Published LinkedIn article"
      ]
    );

    expect(pending).toEqual(["Prepare Monday progress presentation"]);
  });

  it("maps blocker queries into the pending-blocker report intent", () => {
    const result = parseReportQuery(
      "Which blockers are still open for Srishti this week?",
      new Date("2026-03-30T10:00:00.000Z")
    );

    expect(result.kind).toBe("pending_blockers");
    expect(result.filters.employeeName).toBe("Srishti");
    expect(result.filters.weekStartDate).toBe("2026-03-30");
    expect(result.filters.blockerStatus).toBe("open");
  });

  it("matches blocker phrasing with normalized rule-based comparison", () => {
    expect(
      blockersEquivalent(
        "Outlook Calendar sync blocked due to permissions",
        "Calendar sync permission issue in Outlook"
      )
    ).toBe(true);
  });

  it("parses explicit day-month-year report queries without treating the month as an employee", () => {
    const result = parseReportQuery(
      "Show today's extracted updates in table format for 31 March 2026",
      new Date("2026-04-02T10:00:00.000Z")
    );

    expect(result.kind).toBe("daily_updates");
    expect(result.filters.startDate).toBe("2026-03-31");
    expect(result.filters.endDate).toBe("2026-03-31");
    expect(result.filters.employeeName).toBeUndefined();
  });

  it("uses an explicit date as the anchor for weekly report queries", () => {
    const result = parseReportQuery(
      "Generate WBR for the week of March 31, 2026",
      new Date("2026-04-02T10:00:00.000Z")
    );

    expect(result.kind).toBe("weekly_business_report");
    expect(result.filters.weekStartDate).toBe("2026-03-30");
  });
});

import type { ProviderFactory } from "@personal-ai/agent-core";
import type { AgentDatabase } from "@personal-ai/db";
import {
  ExportTableRequestSchema,
  IngestUpdateEmailRequestSchema,
  ReportFiltersSchema,
  ReportQueryRequestSchema,
  SyncUpdateEmailsRequestSchema,
  UpdateEmailExtractionSchema,
  type BlockerTrackingRecord,
  type DailyUpdateComparison,
  type DailyUpdateRecord,
  type ExportTableRequest,
  type IngestUpdateEmailRequest,
  type ReportFilters,
  type ReportSyncMode,
  type ReportTable,
  type ReportTableKind,
  type SyncUpdateEmailsRequest,
  type UpdateEmailExtraction,
  type WeeklyReportRecord
} from "@personal-ai/shared";

import type { AuditLogService } from "./audit-log-service.js";
import { renderExportFile } from "./report-export.js";
import {
  blockerLooksResolved,
  blockerStillOpenForWeek,
  blockersEquivalent,
  buildComparisonSummary,
  calculatePendingTasks,
  createReportTable,
  dedupeStrings,
  extractUpdateHeuristically,
  formatDateRangeLabel,
  getWeekBounds,
  inferResolutionNote,
  isoDay,
  isoDayEnd,
  isoDayStart,
  mergeExtractions,
  normaliseBlockerKey,
  parseReportQuery,
  reportSubtitle,
  stringifyCellValue,
  tasksEquivalent,
  type MailboxUpdateCandidate
} from "./reporting-utils.js";
import type { SettingsService } from "./settings-service.js";

interface MailConnectorLike {
  searchMessages(query: string, limit?: number): Promise<Record<string, unknown>>;
  getMessage(messageId: string): Promise<Record<string, unknown>>;
}

interface IngestUpdateResult {
  update: DailyUpdateRecord;
  comparison: DailyUpdateComparison;
  blockers: BlockerTrackingRecord[];
}

const updateEmailSignal = /\b(update|eod|status|highlights|lowlights|next steps|blocker|challenge)\b/i;
const column = (key: string, label: string) => ({ key, label, sortable: true });
const defaultMailboxQuery = "daily update OR status update OR EOD OR highlights OR blockers OR next steps";

const extractJsonObject = (value: string) => {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  try {
    return JSON.parse(value.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const toIsoString = (value?: string) => {
  if (!value) {
    return new Date().toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
};

const regexEscape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parseLlmExtraction = (payload: Record<string, unknown> | null): Partial<UpdateEmailExtraction> | null => {
  if (!payload) {
    return null;
  }

  const candidate = {
    employeeName:
      typeof payload.employee_name === "string"
        ? payload.employee_name
        : typeof payload.employeeName === "string"
          ? payload.employeeName
          : undefined,
    plannedTasks: Array.isArray(payload.planned_tasks)
      ? payload.planned_tasks.map((entry) => String(entry))
      : Array.isArray(payload.plannedTasks)
        ? payload.plannedTasks.map((entry) => String(entry))
        : undefined,
    completedTasks: Array.isArray(payload.completed_tasks)
      ? payload.completed_tasks.map((entry) => String(entry))
      : Array.isArray(payload.completedTasks)
        ? payload.completedTasks.map((entry) => String(entry))
        : undefined,
    blockers: Array.isArray(payload.blockers)
      ? payload.blockers.map((entry) => String(entry))
      : undefined,
    nextTasks: Array.isArray(payload.next_tasks)
      ? payload.next_tasks.map((entry) => String(entry))
      : Array.isArray(payload.nextTasks)
        ? payload.nextTasks.map((entry) => String(entry))
        : undefined,
    mailType:
      payload.mail_type === "morning" ||
      payload.mail_type === "evening" ||
      payload.mail_type === "night" ||
      payload.mail_type === "unknown"
        ? payload.mail_type
        : payload.mailType === "morning" ||
            payload.mailType === "evening" ||
            payload.mailType === "night" ||
            payload.mailType === "unknown"
          ? payload.mailType
          : undefined
  };

  const parsed = UpdateEmailExtractionSchema.partial().safeParse(candidate);
  return parsed.success ? parsed.data : null;
};

const rowMatchesSearch = (row: Record<string, unknown>, search?: string) => {
  if (!search?.trim()) {
    return true;
  }

  const haystack = Object.values(row).map((value) => stringifyCellValue(value).toLowerCase());
  return haystack.some((value) => value.includes(search.toLowerCase()));
};

const looksLikeUpdateEmail = (
  source: Pick<MailboxUpdateCandidate, "subject" | "rawEmailBody">,
  extraction: UpdateEmailExtraction
) =>
  updateEmailSignal.test(`${source.subject ?? ""}\n${source.rawEmailBody}`) ||
  extraction.plannedTasks.length +
    extraction.completedTasks.length +
    extraction.blockers.length +
    extraction.nextTasks.length >=
    2;

const relatedTaskReference = (update: DailyUpdateRecord, blockerText: string) => {
  const candidates = [...update.completedTasks, ...update.pendingTasks, ...update.nextTasks];
  return candidates.find((candidate) => tasksEquivalent(candidate, blockerText)) ?? candidates[0];
};

export class ReportingService {
  constructor(
    private readonly db: AgentDatabase,
    private readonly audit: AuditLogService,
    private readonly settingsService: SettingsService,
    private readonly providerFactory: ProviderFactory,
    private readonly mail: MailConnectorLike
  ) {}

  private buildDailyUpdateFilter(filters: ReportFilters) {
    const query: Record<string, unknown> = {};
    if (filters.employeeName?.trim()) {
      query.employeeName = {
        $regex: `^${regexEscape(filters.employeeName.trim())}$`,
        $options: "i"
      };
    }

    if (filters.startDate || filters.endDate) {
      query.emailDate = {};
      if (filters.startDate) {
        (query.emailDate as Record<string, string>).$gte = isoDayStart(filters.startDate);
      }
      if (filters.endDate) {
        (query.emailDate as Record<string, string>).$lte = isoDayEnd(filters.endDate);
      }
    }

    return query;
  }

  private buildBlockerFilter(filters: ReportFilters) {
    const query: Record<string, unknown> = {};
    if (filters.employeeName?.trim()) {
      query.employeeName = {
        $regex: `^${regexEscape(filters.employeeName.trim())}$`,
        $options: "i"
      };
    }

    if (filters.blockerStatus) {
      query.status = filters.blockerStatus;
    }

    if (filters.startDate || filters.endDate) {
      query.firstSeenDate = {};
      if (filters.startDate) {
        (query.firstSeenDate as Record<string, string>).$gte = isoDayStart(filters.startDate);
      }
      if (filters.endDate) {
        (query.firstSeenDate as Record<string, string>).$lte = isoDayEnd(filters.endDate);
      }
    }

    return query;
  }

  private async extractWithLlm(candidate: MailboxUpdateCandidate) {
    const settings = await this.settingsService.getSettings();
    const drafting = this.providerFactory.createDraftingProvider(settings);

    try {
      const response = await drafting.provider.generate({
        model: drafting.model,
        systemPrompt: [
          "Extract structured work updates from an employee email.",
          "Classify by meaning and tense, not just section headings.",
          "Past or completed work belongs in completed_tasks.",
          "Current issues, constraints, inability, dependencies, or delays belong in blockers.",
          "Morning intent and start-of-day commitments belong in planned_tasks.",
          "Future work, follow-ups, tomorrow items, and upcoming actions belong in next_tasks.",
          "Split mixed sentences into separate short points when they mention both progress and blockers.",
          "Return strict JSON with these keys only:",
          'employee_name: string, planned_tasks: string[], completed_tasks: string[], blockers: string[], next_tasks: string[], mail_type: "morning" | "evening" | "night" | "unknown".',
          "Do not add markdown. Keep task items concise, standalone, and deduplicated."
        ].join("\n"),
        messages: [
          {
            role: "user",
            content: JSON.stringify(candidate, null, 2)
          }
        ],
        tools: []
      });

      return parseLlmExtraction(extractJsonObject(response.text));
    } catch {
      return null;
    }
  }

  private async applyDailyComparison(employeeName: string, emailDate: string) {
    const day = isoDay(emailDate);
    const updates = await this.db.listDailyUpdates(
      {
        employeeName: {
          $regex: `^${regexEscape(employeeName)}$`,
          $options: "i"
        },
        emailDate: {
          $gte: isoDayStart(day),
          $lte: isoDayEnd(day)
        }
      },
      20
    );

    const plannedTasks = dedupeStrings(
      updates.flatMap((update) => update.plannedTasks),
      tasksEquivalent
    );
    const completedTasks = dedupeStrings(
      updates.flatMap((update) => update.completedTasks),
      tasksEquivalent
    );
    const blockers = dedupeStrings(
      updates.flatMap((update) => update.blockers),
      blockersEquivalent
    );
    const pendingTasks = calculatePendingTasks(plannedTasks, completedTasks);

    for (const update of updates) {
      const patch =
        update.mailType === "morning"
          ? {
              pendingTasks: calculatePendingTasks(update.plannedTasks, []),
              plannedTasks: update.plannedTasks.length ? update.plannedTasks : plannedTasks
            }
          : {
              plannedTasks: plannedTasks.length ? plannedTasks : update.plannedTasks,
              pendingTasks
            };

      await this.db.updateDailyUpdate(update.id, patch);
    }

    const comparison: DailyUpdateComparison = {
      employeeName,
      emailDate: day,
      plannedTasks,
      completedTasks,
      pendingTasks,
      blockers,
      statusSummary: ""
    };

    comparison.statusSummary = buildComparisonSummary(comparison);
    return comparison;
  }

  private buildMailboxSyncQuery(kind: ReportTableKind, filters: ReportFilters) {
    const fragments = [defaultMailboxQuery];
    if (filters.employeeName?.trim()) {
      fragments.unshift(`"${filters.employeeName.trim()}"`);
    }
    if (kind === "pending_blockers" || kind === "resolved_blockers") {
      fragments.push("blocker OR challenge OR issue");
    }
    if (kind === "weekly_business_report" || kind === "team_weekly_summary") {
      fragments.push("weekly OR weekend OR summary");
    }
    return dedupeStrings(fragments).join(" OR ");
  }

  private async maybeSyncForReportQuery(kind: ReportTableKind, filters: ReportFilters, syncMode: ReportSyncMode) {
    if (syncMode === "stored_only") {
      return null;
    }

    try {
      return await this.syncUpdateEmails({
        query: this.buildMailboxSyncQuery(kind, filters),
        limit: syncMode === "force_sync" ? 25 : 15,
        forceReprocess: syncMode === "force_sync"
      });
    } catch {
      return null;
    }
  }

  private async syncBlockers(update: DailyUpdateRecord) {
    const activeBlockers = await this.db.listBlockers(
      {
        employeeName: {
          $regex: `^${regexEscape(update.employeeName)}$`,
          $options: "i"
        },
        status: {
          $in: ["open", "carried_forward"]
        }
      },
      200
    );

    const matchedBlockerIds = new Set<string>();
    for (const blockerText of update.blockers) {
      const existing = activeBlockers.find((blocker) =>
        blockersEquivalent(blocker.blockerText, blockerText)
      );

      if (existing) {
        matchedBlockerIds.add(existing.id);
        const nextIds = dedupeStrings([...existing.relatedDailyUpdateIds, update.id]);
        await this.db.updateBlocker(existing.id, {
          blockerText,
          normalizedBlockerKey: normaliseBlockerKey(blockerText),
          lastSeenDate: update.emailDate,
          status: isoDay(existing.firstSeenDate) === isoDay(update.emailDate) ? "open" : "carried_forward",
          relatedTaskReference: existing.relatedTaskReference ?? relatedTaskReference(update, blockerText),
          relatedDailyUpdateIds: nextIds
        });
        await this.audit.log({
          action: "blocker_updated",
          entityType: "blocker",
          entityId: existing.id,
          message: `Blocker carried forward for ${update.employeeName}`,
          payload: {
            blockerText
          }
        });
      } else {
        const created = await this.db.createBlocker({
          employeeName: update.employeeName,
          blockerText,
          normalizedBlockerKey: normaliseBlockerKey(blockerText),
          firstSeenDate: update.emailDate,
          lastSeenDate: update.emailDate,
          status: "open",
          relatedTaskReference: relatedTaskReference(update, blockerText),
          relatedDailyUpdateIds: [update.id]
        });
        matchedBlockerIds.add(created.id);
      }
    }

    for (const blocker of activeBlockers.filter((entry) => !matchedBlockerIds.has(entry.id))) {
      if (blocker.relatedDailyUpdateIds.includes(update.id)) {
        continue;
      }

      const resolutionNote = inferResolutionNote(
        blocker.blockerText,
        update.completedTasks,
        update.rawEmailBody
      );

      if (resolutionNote && blockerLooksResolved(blocker.blockerText, update.completedTasks, update.rawEmailBody)) {
        await this.db.updateBlocker(blocker.id, {
          status: "resolved",
          resolvedDate: update.emailDate,
          resolutionNotes: resolutionNote,
          relatedDailyUpdateIds: dedupeStrings([...blocker.relatedDailyUpdateIds, update.id])
        });
        await this.audit.log({
          action: "blocker_updated",
          entityType: "blocker",
          entityId: blocker.id,
          message: `Resolved blocker for ${update.employeeName}`,
          payload: {
            blockerText: blocker.blockerText,
            resolutionNote
          }
        });
      } else if (isoDay(blocker.lastSeenDate) < isoDay(update.emailDate)) {
        await this.db.updateBlocker(blocker.id, {
          status: "carried_forward"
        });
      }
    }

    return this.db.listBlockers(
      {
        employeeName: {
          $regex: `^${regexEscape(update.employeeName)}$`,
          $options: "i"
        }
      },
      200
    );
  }

  async ingestUpdateEmail(payload: IngestUpdateEmailRequest): Promise<IngestUpdateResult> {
    const request = IngestUpdateEmailRequestSchema.parse(payload);
    const emailDate = toIsoString(request.emailDate);
    const sourceEmailId = request.sourceEmailId ?? `manual-${Date.now()}`;
    const existing = await this.db.getDailyUpdateBySourceEmailId(sourceEmailId);
    if (existing && !request.forceReprocess) {
      const comparison = await this.applyDailyComparison(existing.employeeName, existing.emailDate);
      const blockers = await this.db.listBlockers(
        {
          employeeName: {
            $regex: `^${regexEscape(existing.employeeName)}$`,
            $options: "i"
          }
        },
        200
      );
      return {
        update: existing,
        comparison,
        blockers
      };
    }

    const candidate: MailboxUpdateCandidate = {
      sourceEmailId,
      sourceThreadId: request.sourceThreadId,
      subject: request.subject,
      fromEmail: request.fromEmail,
      emailDate,
      rawEmailBody: request.rawEmailBody
    };
    const heuristicExtraction = extractUpdateHeuristically(candidate);
    const llmExtraction = await this.extractWithLlm(candidate);
    const extraction = mergeExtractions(heuristicExtraction, llmExtraction);

    if (!looksLikeUpdateEmail(candidate, extraction)) {
      throw new Error("The selected email does not look like a daily update email.");
    }

    const baseRecord = {
      employeeName: extraction.employeeName,
      emailDate,
      completedTasks: extraction.completedTasks,
      blockers: extraction.blockers,
      nextTasks: extraction.nextTasks,
      plannedTasks: extraction.plannedTasks,
      pendingTasks: [],
      sourceEmailId,
      sourceThreadId: request.sourceThreadId,
      emailSubject: request.subject,
      fromEmail: request.fromEmail,
      mailType: extraction.mailType,
      rawEmailBody: request.rawEmailBody
    } satisfies Omit<DailyUpdateRecord, "id" | "createdAt" | "updatedAt">;

    const update = existing
      ? await this.db.updateDailyUpdate(existing.id, baseRecord)
      : await this.db.createDailyUpdate(baseRecord);

    if (!update) {
      throw new Error("Could not store the daily update.");
    }

    const comparison = await this.applyDailyComparison(update.employeeName, update.emailDate);
    const refreshedUpdate = (await this.db.getDailyUpdate(update.id)) ?? update;
    const blockers = await this.syncBlockers(refreshedUpdate);

    await this.audit.log({
      action: "update_email_processed",
      entityType: "daily_update",
      entityId: refreshedUpdate.id,
      message: `Processed update email for ${refreshedUpdate.employeeName}`,
      payload: {
        mailType: refreshedUpdate.mailType,
        blockerCount: refreshedUpdate.blockers.length,
        completedCount: refreshedUpdate.completedTasks.length
      }
    });

    return {
      update: refreshedUpdate,
      comparison,
      blockers
    };
  }

  async syncUpdateEmails(payload: SyncUpdateEmailsRequest) {
    const request = SyncUpdateEmailsRequestSchema.parse(payload);
    const searchResult = await this.mail.searchMessages(request.query, request.limit);
    const messages = Array.isArray(searchResult.messages)
      ? searchResult.messages.map((entry) => entry as Record<string, unknown>)
      : [];
    const processed: Array<{
      updateId: string;
      employeeName: string;
      emailDate: string;
      mailType: string;
    }> = [];
    let skippedCount = 0;

    for (const message of messages) {
      const messageId = typeof message.id === "string" ? message.id : undefined;
      if (!messageId) {
        skippedCount += 1;
        continue;
      }

      const detail = await this.mail.getMessage(messageId);
      const bodyText =
        typeof detail.bodyText === "string" ? detail.bodyText : String(detail.snippet ?? "");
      if (!bodyText.trim()) {
        skippedCount += 1;
        continue;
      }

      try {
        const result = await this.ingestUpdateEmail({
          sourceEmailId: messageId,
          sourceThreadId:
            typeof detail.threadId === "string" ? detail.threadId : undefined,
          subject: typeof detail.subject === "string" ? detail.subject : undefined,
          fromEmail: typeof detail.from === "string" ? detail.from : undefined,
          emailDate: typeof detail.receivedAt === "string" ? detail.receivedAt : undefined,
          rawEmailBody: bodyText,
          forceReprocess: request.forceReprocess
        });

        processed.push({
          updateId: result.update.id,
          employeeName: result.update.employeeName,
          emailDate: result.update.emailDate,
          mailType: result.update.mailType
        });
      } catch {
        skippedCount += 1;
      }
    }

    return {
      query: request.query,
      syncedCount: processed.length,
      skippedCount,
      processed
    };
  }

  async getDailyUpdatesTable(rawFilters: ReportFilters) {
    const filters = ReportFiltersSchema.parse(rawFilters);
    const updates = await this.db.listDailyUpdates(this.buildDailyUpdateFilter(filters), 300);
    const rows = updates
      .map((update) => ({
        employeeName: update.employeeName,
        emailDate: isoDay(update.emailDate),
        mailType: update.mailType,
        plannedTasks: update.plannedTasks,
        completedTasks: update.completedTasks,
        pendingTasks: update.pendingTasks,
        blockers: update.blockers,
        nextTasks: update.nextTasks,
        sourceEmailId: update.sourceEmailId
      }))
      .filter((row) => rowMatchesSearch(row, filters.search));

    return createReportTable({
      kind: "daily_updates",
      title: "Daily Extracted Updates",
      subtitle: reportSubtitle("Daily extracted updates", filters),
      columns: [
        column("employeeName", "Employee Name"),
        column("emailDate", "Email Date"),
        column("mailType", "Mail Type"),
        column("plannedTasks", "Planned Tasks"),
        column("completedTasks", "Completed Tasks"),
        column("pendingTasks", "Pending Tasks"),
        column("blockers", "Blockers"),
        column("nextTasks", "Next Tasks"),
        column("sourceEmailId", "Source Email ID")
      ],
      rows,
      filters,
      emptyMessage: "No extracted updates matched the selected filters."
    });
  }

  async getBlockersTable(rawFilters: ReportFilters, resolvedOnly = false) {
    const filters = ReportFiltersSchema.parse(rawFilters);
    const blockerFilter = this.buildBlockerFilter({
      ...filters,
      blockerStatus: resolvedOnly ? "resolved" : filters.blockerStatus
    });
    const blockers = await this.db.listBlockers(blockerFilter, 300);
    const rows = blockers
      .filter((blocker) =>
        resolvedOnly ? blocker.status === "resolved" : blocker.status !== "resolved"
      )
      .map((blocker) => ({
        employeeName: blocker.employeeName,
        blockerText: blocker.blockerText,
        firstSeenDate: isoDay(blocker.firstSeenDate),
        lastSeenDate: isoDay(blocker.lastSeenDate),
        status: blocker.status,
        resolvedDate: blocker.resolvedDate ? isoDay(blocker.resolvedDate) : "",
        resolutionNotes: blocker.resolutionNotes ?? "",
        relatedTaskReference: blocker.relatedTaskReference ?? ""
      }))
      .filter((row) => rowMatchesSearch(row, filters.search));

    return createReportTable({
      kind: resolvedOnly ? "resolved_blockers" : "pending_blockers",
      title: resolvedOnly ? "Resolved Blockers" : "Pending Blockers",
      subtitle: reportSubtitle(resolvedOnly ? "Resolved blockers" : "Pending blockers", filters),
      columns: [
        column("employeeName", "Employee Name"),
        column("blockerText", "Blocker"),
        column("firstSeenDate", "First Seen"),
        column("lastSeenDate", "Last Seen"),
        column("status", "Blocker Status"),
        column("resolvedDate", "Resolved Date"),
        column("resolutionNotes", "How the Blocker Was Solved"),
        column("relatedTaskReference", "Related Task")
      ],
      rows,
      filters,
      emptyMessage: resolvedOnly
        ? "No resolved blockers matched the selected filters."
        : "No pending blockers matched the selected filters."
    });
  }

  async getCompletedVsPendingTable(rawFilters: ReportFilters) {
    const filters = ReportFiltersSchema.parse(rawFilters);
    const updates = await this.db.listDailyUpdates(this.buildDailyUpdateFilter(filters), 400);
    const grouped = new Map<
      string,
      {
        employeeName: string;
        emailDate: string;
        plannedTasks: string[];
        completedTasks: string[];
        blockers: string[];
      }
    >();

    for (const update of updates) {
      const key = `${update.employeeName}::${isoDay(update.emailDate)}`;
      const current =
        grouped.get(key) ??
        ({
          employeeName: update.employeeName,
          emailDate: isoDay(update.emailDate),
          plannedTasks: [],
          completedTasks: [],
          blockers: []
        } as const);

      grouped.set(key, {
        employeeName: current.employeeName,
        emailDate: current.emailDate,
        plannedTasks: dedupeStrings(
          [...current.plannedTasks, ...update.plannedTasks],
          tasksEquivalent
        ),
        completedTasks: dedupeStrings(
          [...current.completedTasks, ...update.completedTasks],
          tasksEquivalent
        ),
        blockers: dedupeStrings([...current.blockers, ...update.blockers], blockersEquivalent)
      });
    }

    const rows = [...grouped.values()]
      .map((group) => {
        const comparison: DailyUpdateComparison = {
          employeeName: group.employeeName,
          emailDate: group.emailDate,
          plannedTasks: group.plannedTasks,
          completedTasks: group.completedTasks,
          pendingTasks: calculatePendingTasks(group.plannedTasks, group.completedTasks),
          blockers: group.blockers,
          statusSummary: ""
        };
        comparison.statusSummary = buildComparisonSummary(comparison);

        return {
          employeeName: comparison.employeeName,
          emailDate: comparison.emailDate,
          plannedTasks: comparison.plannedTasks,
          completedTasks: comparison.completedTasks,
          pendingTasks: comparison.pendingTasks,
          blockers: comparison.blockers,
          statusSummary: comparison.statusSummary
        };
      })
      .sort((left, right) => right.emailDate.localeCompare(left.emailDate))
      .filter((row) => rowMatchesSearch(row, filters.search));

    return createReportTable({
      kind: "completed_vs_pending",
      title: "Completed vs Pending Tasks",
      subtitle: reportSubtitle("Completed vs pending tasks", filters),
      columns: [
        column("employeeName", "Employee Name"),
        column("emailDate", "Date"),
        column("plannedTasks", "Planned Tasks"),
        column("completedTasks", "Completed Tasks"),
        column("pendingTasks", "Pending Tasks"),
        column("blockers", "Blockers"),
        column("statusSummary", "Status Summary")
      ],
      rows,
      filters,
      emptyMessage: "No completed vs pending comparisons matched the selected filters."
    });
  }

  private async buildWeeklyReports(filters: ReportFilters) {
    const bounds = filters.weekStartDate
      ? getWeekBounds(filters.weekStartDate)
      : filters.startDate || filters.endDate
        ? {
            weekStartDate: filters.startDate ? isoDay(filters.startDate) : isoDay(new Date()),
            weekEndDate: filters.endDate ? isoDay(filters.endDate) : isoDay(new Date())
          }
        : getWeekBounds();
    const weekStartDate = bounds.weekStartDate;
    const weekEndDate = bounds.weekEndDate;
    const updates = await this.db.listDailyUpdates(
      this.buildDailyUpdateFilter({
        ...filters,
        startDate: weekStartDate,
        endDate: weekEndDate
      }),
      600
    );
    const blockers = await this.db.listBlockers(
      this.buildBlockerFilter({
        ...filters,
        startDate: weekStartDate,
        endDate: weekEndDate
      }),
      400
    );

    const employeeNames = new Set<string>(updates.map((update) => update.employeeName));
    for (const blocker of blockers) {
      employeeNames.add(blocker.employeeName);
    }
    if (filters.employeeName) {
      employeeNames.add(filters.employeeName);
    }

    const reports: WeeklyReportRecord[] = [];
    for (const employeeName of employeeNames) {
      const employeeUpdates = updates
        .filter((update) => update.employeeName.toLowerCase() === employeeName.toLowerCase())
        .sort((left, right) => right.emailDate.localeCompare(left.emailDate));
      const latestUpdate = employeeUpdates[0];
      const completedTasks = dedupeStrings(
        employeeUpdates
          .filter((update) => update.mailType !== "morning")
          .flatMap((update) => update.completedTasks),
        tasksEquivalent
      );
      const openBlockers = blockers
        .filter((blocker) => blocker.employeeName.toLowerCase() === employeeName.toLowerCase())
        .filter((blocker) => blockerStillOpenForWeek(blocker, weekEndDate));
      const resolvedBlockers = blockers
        .filter((blocker) => blocker.employeeName.toLowerCase() === employeeName.toLowerCase())
        .filter(
          (blocker) =>
            blocker.status === "resolved" &&
            blocker.resolvedDate !== undefined &&
            blocker.resolvedDate >= isoDayStart(weekStartDate) &&
            blocker.resolvedDate <= isoDayEnd(weekEndDate)
        );
      const nextWeekPlan = dedupeStrings(
        [
          ...(latestUpdate?.nextTasks ?? []),
          ...(latestUpdate?.pendingTasks ?? [])
        ],
        tasksEquivalent
      );
      const blockerResolutionSummary = dedupeStrings(
        resolvedBlockers.map(
          (blocker) =>
            `${blocker.blockerText}: ${blocker.resolutionNotes ?? "Resolved during the week."}`
        )
      );

      const existing = await this.db.getWeeklyReportByEmployeeWeek(
        employeeName,
        weekStartDate,
        weekEndDate
      );
      const recordInput = {
        employeeName,
        weekStartDate,
        weekEndDate,
        lastWeekCompletedTasks: completedTasks,
        openBlockers: openBlockers.map((blocker) => blocker.blockerText),
        resolvedBlockers: resolvedBlockers.map((blocker) => blocker.blockerText),
        nextWeekPlan,
        blockerResolutionSummary,
        generatedAt: new Date().toISOString()
      } satisfies Omit<WeeklyReportRecord, "id" | "createdAt" | "updatedAt">;

      const report = existing
        ? await this.db.updateWeeklyReport(existing.id, recordInput)
        : await this.db.createWeeklyReport(recordInput);
      if (report) {
        reports.push(report);
      }
    }

    await this.audit.log({
      action: "weekly_report_generated",
      entityType: "weekly_report",
      message: `Generated ${reports.length} weekly report row(s)`,
      payload: {
        weekStartDate,
        weekEndDate
      }
    });

    return {
      reports,
      weekStartDate,
      weekEndDate
    };
  }

  async getWeeklyBusinessReportTable(rawFilters: ReportFilters, kind: ReportTableKind = "weekly_business_report") {
    const filters = ReportFiltersSchema.parse(rawFilters);
    const { reports, weekStartDate, weekEndDate } = await this.buildWeeklyReports(filters);
    const rows = reports
      .map((report) => ({
        name: report.employeeName,
        lastWeekWork: report.lastWeekCompletedTasks,
        blockers: report.openBlockers,
        blockerStatus: report.openBlockers.length
          ? `${report.openBlockers.length} open`
          : report.resolvedBlockers.length
            ? `${report.resolvedBlockers.length} resolved this week`
            : "Clear",
        blockerResolutionSummary: report.blockerResolutionSummary,
        nextWeekPlan: report.nextWeekPlan
      }))
      .filter((row) => rowMatchesSearch(row, filters.search));

    return createReportTable({
      kind,
      title: kind === "team_weekly_summary" ? "Team Weekly Summary" : "Weekly Business Report (WBR)",
      subtitle: formatDateRangeLabel(weekStartDate, weekEndDate),
      columns: [
        column("name", "Name"),
        column("lastWeekWork", "Last Week Work / Tasks Done"),
        column("blockers", "Blockers"),
        column("blockerStatus", "Blocker Status"),
        column("blockerResolutionSummary", "How the Blockers Were Solved"),
        column("nextWeekPlan", "Next Week Plan")
      ],
      rows,
      filters: {
        ...filters,
        startDate: weekStartDate,
        endDate: weekEndDate,
        weekStartDate
      },
      emptyMessage: "No weekly business report rows matched the selected filters."
    });
  }

  async queryReportTable(query: string, syncMode: ReportSyncMode = "auto"): Promise<ReportTable> {
    const parsed = ReportQueryRequestSchema.parse({ query, syncMode });
    const plan = parseReportQuery(parsed.query);
    await this.maybeSyncForReportQuery(plan.kind, plan.filters, parsed.syncMode);

    if (plan.kind === "pending_blockers") {
      return this.getBlockersTable(plan.filters, false);
    }
    if (plan.kind === "resolved_blockers") {
      return this.getBlockersTable(plan.filters, true);
    }
    if (plan.kind === "completed_vs_pending") {
      return this.getCompletedVsPendingTable(plan.filters);
    }
    if (plan.kind === "weekly_business_report" || plan.kind === "team_weekly_summary") {
      return this.getWeeklyBusinessReportTable(plan.filters, plan.kind);
    }

    return this.getDailyUpdatesTable(plan.filters);
  }

  exportTable(payload: ExportTableRequest) {
    const request = ExportTableRequestSchema.parse(payload);
    const file = renderExportFile(request);

    void this.audit.log({
      action: "report_exported",
      entityType: "report_export",
      message: `Exported ${request.title} as ${request.format.toUpperCase()}`,
      payload: {
        rowCount: request.rows.length
      }
    });

    return file;
  }
}

import type {
  BlockerTrackingRecord,
  DailyUpdateComparison,
  ReportFilters,
  ReportTable,
  ReportTableColumn,
  ReportTableKind,
  UpdateEmailExtraction,
  UpdateMailType
} from "@personal-ai/shared";
import { ReportTableSchema, UpdateEmailExtractionSchema, nowIso } from "@personal-ai/shared";

const greetingPattern = /^(hi|hello|dear)\b/i;
const fillerPattern =
  /^(find my updates below|daily update|status update|updates below|thanks|regards|best|cheers)\b/i;
const resolutionVerbPattern =
  /\b(fixed|resolved|unblocked|completed|validated|solved|closed|addressed|worked around|mitigated)\b/i;
const completedVerbPattern =
  /\b(completed|continued|finished|published|discussed|progress|worked on|implemented|validated|built|created|prepared|drafted|reviewed|restored|recovered|finalized|delivered)\b/i;
const blockerCuePattern =
  /\b(blocked|issue|issues|challenge|challenges|stuck|permission|limitation|delay|problem|unable|cannot|can't|waiting on|dependency|error|lack of access|access issue)\b/i;
const futureCuePattern =
  /\b(will|next|tomorrow|monday|follow up|present|refine|plan to|going to|need to|continue to|up next)\b/i;
const plannedCuePattern =
  /\b(today'?s plan|plan for today|focus for today|planned|target for today|working on today)\b/i;
const monthNames = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december"
] as const;
const monthNameSet = new Set<string>(monthNames);
const monthNamePattern = monthNames.join("|");

type ExtractionBucket = "planned" | "completed" | "blockers" | "next";
const stopWords = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "into",
  "this",
  "that",
  "were",
  "was",
  "have",
  "been",
  "while",
  "over",
  "about",
  "across",
  "their",
  "there",
  "then",
  "than",
  "today",
  "yesterday",
  "tomorrow",
  "week",
  "next",
  "last",
  "still",
  "issue",
  "issues",
  "blocker",
  "blockers",
  "challenge",
  "challenges",
  "task",
  "tasks"
]);

const sectionMatchers = {
  planned: [
    /today'?s plan/i,
    /plan for today/i,
    /morning update/i,
    /today'?s tasks/i,
    /planned tasks?/i,
    /focus for today/i
  ],
  completed: [
    /highlights/i,
    /completed/i,
    /done/i,
    /progress/i,
    /accomplished/i,
    /worked on/i
  ],
  blockers: [
    /lowlights?/i,
    /challenges?/i,
    /blockers?/i,
    /risks?/i,
    /issues?/i,
    /stuck/i
  ],
  next: [
    /next steps?/i,
    /next tasks?/i,
    /up next/i,
    /tomorrow/i,
    /plan for tomorrow/i
  ]
} as const;

export interface MailboxUpdateCandidate {
  sourceEmailId: string;
  sourceThreadId?: string;
  subject?: string;
  fromEmail?: string;
  emailDate?: string;
  rawEmailBody: string;
}

const normaliseWhitespace = (value: string) => value.replace(/\r/g, "").replace(/\t/g, " ").trim();

const titleCase = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ")
    .trim();

const cleanListItem = (value: string) =>
  normaliseWhitespace(value)
    .replace(/^[\-\*\u2022\d\.\)\(]+\s*/, "")
    .replace(/^(task|tasks|completed|blocker|blockers|next step|next steps|planned)[:\-]\s*/i, "")
    .replace(/^(i|we)\s+(have|had|am|are|was|were|will|plan to|need to|need|want to|should)\s+/i, "")
    .replace(/^(i|we)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();

const normaliseText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const normaliseTaskKey = (value: string) => normaliseText(cleanListItem(value));

export const normaliseBlockerKey = (value: string) =>
  normaliseText(cleanListItem(value))
    .replace(/\b(integration|permission|permissions|access|control|calendar|sync)\b/g, "$1")
    .trim();

const tokenise = (value: string) =>
  normaliseText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !stopWords.has(token));

const overlapScore = (left: string, right: string) => {
  const leftTokens = new Set(tokenise(left));
  const rightTokens = new Set(tokenise(right));
  if (!leftTokens.size || !rightTokens.size) {
    return 0;
  }

  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return overlap / Math.min(leftTokens.size, rightTokens.size);
};

export const tasksEquivalent = (left: string, right: string) => {
  const leftKey = normaliseTaskKey(left);
  const rightKey = normaliseTaskKey(right);
  return (
    leftKey === rightKey ||
    leftKey.includes(rightKey) ||
    rightKey.includes(leftKey) ||
    overlapScore(leftKey, rightKey) >= 0.6
  );
};

export const blockersEquivalent = (left: string, right: string) => {
  const leftKey = normaliseBlockerKey(left);
  const rightKey = normaliseBlockerKey(right);
  return (
    leftKey === rightKey ||
    leftKey.includes(rightKey) ||
    rightKey.includes(leftKey) ||
    overlapScore(leftKey, rightKey) >= 0.55
  );
};

export const dedupeStrings = (
  values: string[],
  equivalence: (left: string, right: string) => boolean = (left, right) => left === right
) => {
  const result: string[] = [];
  for (const value of values.map(cleanListItem).filter(Boolean)) {
    if (!result.some((entry) => equivalence(entry, value))) {
      result.push(value);
    }
  }
  return result;
};

const extractNameFromEmail = (value?: string) => {
  if (!value) {
    return undefined;
  }

  const bracketMatch = value.match(/^([^<]+)</);
  if (bracketMatch?.[1]?.trim()) {
    return titleCase(bracketMatch[1].trim());
  }

  const emailMatch = value.match(/[A-Z0-9._%+-]+@/i)?.[0];
  if (!emailMatch) {
    return undefined;
  }

  return titleCase(emailMatch.replace(/@$/, "").replace(/[._-]+/g, " "));
};

const extractNameFromSignature = (body: string) => {
  const lines = body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = 0; index < lines.length; index += 1) {
    if (/^(regards|thanks|best|cheers)/i.test(lines[index] ?? "")) {
      const candidate = lines[index + 1]?.trim();
      if (candidate && /^[A-Za-z][A-Za-z\s.'-]{1,60}$/.test(candidate)) {
        return titleCase(candidate);
      }
    }
  }

  return undefined;
};

const guessMailTypeByClock = (emailDate?: string): UpdateMailType => {
  if (!emailDate) {
    return "unknown";
  }

  const parsed = new Date(emailDate);
  if (Number.isNaN(parsed.getTime())) {
    return "unknown";
  }

  const hour = parsed.getHours();
  if (hour >= 20) {
    return "night";
  }
  if (hour >= 16) {
    return "evening";
  }
  if (hour <= 12) {
    return "morning";
  }
  return "unknown";
};

export const detectMailType = (subject: string | undefined, body: string, emailDate?: string) => {
  const combined = `${subject ?? ""}\n${body}`.toLowerCase();
  if (/(morning update|start of day|today plan|plan for today)/i.test(combined)) {
    return "morning" satisfies UpdateMailType;
  }

  if (/(night update|late update|eod|end of day)/i.test(combined)) {
    return "night" satisfies UpdateMailType;
  }

  if (/(evening update|status update|highlights|lowlights|next steps)/i.test(combined)) {
    const byClock = guessMailTypeByClock(emailDate);
    return byClock === "night" ? "night" : "evening";
  }

  return guessMailTypeByClock(emailDate);
};

const detectSectionKey = (line: string) => {
  for (const matcher of sectionMatchers.planned) {
    if (matcher.test(line)) {
      return "planned" as const;
    }
  }
  for (const matcher of sectionMatchers.completed) {
    if (matcher.test(line)) {
      return "completed" as const;
    }
  }
  for (const matcher of sectionMatchers.blockers) {
    if (matcher.test(line)) {
      return "blockers" as const;
    }
  }
  for (const matcher of sectionMatchers.next) {
    if (matcher.test(line)) {
      return "next" as const;
    }
  }

  return undefined;
};

const splitSections = (body: string) => {
  const sections: Record<"planned" | "completed" | "blockers" | "next" | "other", string[]> = {
    planned: [],
    completed: [],
    blockers: [],
    next: [],
    other: []
  };

  let currentSection: keyof typeof sections = "other";
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const nextSection = detectSectionKey(line.replace(/[:\-]\s*$/, ""));
    if (nextSection) {
      currentSection = nextSection;
      continue;
    }

    sections[currentSection].push(line);
  }

  return sections;
};

const sentenceItems = (value: string) =>
  value
    .split(/(?<=[.!?;])\s+/)
    .map(cleanListItem)
    .filter((item) => item.split(" ").length >= 3);

const clauseItems = (lines: string[]) =>
  lines
    .flatMap((line) => sentenceItems(line).length ? sentenceItems(line) : [cleanListItem(line)])
    .map(cleanListItem)
    .filter(
      (item) => item.length > 4 && !greetingPattern.test(item) && !fillerPattern.test(item)
    );

const classifyClause = (
  clause: string,
  preferredBucket?: ExtractionBucket
): ExtractionBucket | undefined => {
  const item = cleanListItem(clause);
  if (!item) {
    return undefined;
  }

  if (resolutionVerbPattern.test(item)) {
    return "completed";
  }

  if (blockerCuePattern.test(item) && !completedVerbPattern.test(item) && !futureCuePattern.test(item)) {
    return "blockers";
  }

  if (futureCuePattern.test(item)) {
    return blockerCuePattern.test(item) ? "blockers" : "next";
  }

  if (completedVerbPattern.test(item)) {
    return "completed";
  }

  if (plannedCuePattern.test(item)) {
    return "planned";
  }

  return preferredBucket;
};

const rebalanceExtraction = (extraction: UpdateEmailExtraction): UpdateEmailExtraction => {
  const reclassified = {
    planned: [] as string[],
    completed: [] as string[],
    blockers: [] as string[],
    next: [] as string[]
  };

  const push = (bucket: ExtractionBucket, value: string) => {
    const targetEquivalence = bucket === "blockers" ? blockersEquivalent : tasksEquivalent;
    if (!reclassified[bucket].some((entry) => targetEquivalence(entry, value))) {
      reclassified[bucket].push(value);
    }
  };

  const collect = (values: string[], preferredBucket: ExtractionBucket) => {
    for (const value of values) {
      const cleanValue = cleanListItem(value);
      if (!cleanValue) {
        continue;
      }
      const nextBucket = classifyClause(cleanValue, preferredBucket) ?? preferredBucket;
      push(nextBucket, cleanValue);
    }
  };

  collect(extraction.plannedTasks, "planned");
  collect(extraction.completedTasks, "completed");
  collect(extraction.blockers, "blockers");
  collect(extraction.nextTasks, "next");

  if (extraction.mailType === "morning" && !reclassified.planned.length && reclassified.next.length) {
    reclassified.planned = dedupeStrings([...reclassified.next], tasksEquivalent);
    reclassified.next = [];
  }

  return UpdateEmailExtractionSchema.parse({
    ...extraction,
    plannedTasks: dedupeStrings(reclassified.planned, tasksEquivalent),
    completedTasks: dedupeStrings(reclassified.completed, tasksEquivalent),
    blockers: dedupeStrings(reclassified.blockers, blockersEquivalent),
    nextTasks: dedupeStrings(reclassified.next, tasksEquivalent)
  });
};

const classifySectionClauses = (lines: string[], preferredBucket?: ExtractionBucket) => {
  const buckets = {
    planned: [] as string[],
    completed: [] as string[],
    blockers: [] as string[],
    next: [] as string[]
  };

  for (const clause of clauseItems(lines)) {
    const bucket = classifyClause(clause, preferredBucket);
    if (!bucket) {
      continue;
    }
    buckets[bucket].push(clause);
  }

  return buckets;
};

const extractListItems = (lines: string[]) => {
  const bulletLike = lines.some((line) => /^[\-\*\u2022\d\.\)]\s*/.test(line));
  const baseItems = bulletLike ? lines : lines.flatMap(sentenceItems);

  if (!baseItems.length) {
    return dedupeStrings(
      lines
        .map(cleanListItem)
        .filter(
          (line) => line.length > 10 && !greetingPattern.test(line) && !fillerPattern.test(line)
        ),
      tasksEquivalent
    );
  }

  return dedupeStrings(
    baseItems.filter(
      (line) => line.length > 4 && !greetingPattern.test(line) && !fillerPattern.test(line)
    ),
    tasksEquivalent
  );
};

const fallbackCompletedItems = (body: string) => {
  const candidates = sentenceItems(body);
  return candidates.filter((item) =>
    /\b(completed|continued|finished|published|discussed|progress|worked|implemented|validated)\b/i.test(
      item
    )
  );
};

const fallbackBlockers = (body: string) => {
  const candidates = sentenceItems(body);
  return candidates.filter((item) =>
    /\b(blocked|issue|issues|challenge|stuck|permission|limitation|delay|problem)\b/i.test(item)
  );
};

const fallbackNextTasks = (body: string) => {
  const candidates = sentenceItems(body);
  return candidates.filter((item) =>
    /\b(next|continue|plan|tomorrow|monday|follow up|present|refine)\b/i.test(item)
  );
};

export const extractUpdateHeuristically = (input: MailboxUpdateCandidate): UpdateEmailExtraction => {
  const body = normaliseWhitespace(input.rawEmailBody);
  const sections = splitSections(body);
  const mailType = detectMailType(input.subject, body, input.emailDate);
  const employeeName =
    extractNameFromSignature(body) ??
    extractNameFromEmail(input.fromEmail) ??
    "Unknown Team Member";

  const classifiedPlanned = classifySectionClauses(sections.planned, "planned");
  const classifiedCompleted = classifySectionClauses(sections.completed, "completed");
  const classifiedBlockers = classifySectionClauses(sections.blockers, "blockers");
  const classifiedNext = classifySectionClauses(sections.next, "next");
  const classifiedOther = classifySectionClauses(sections.other);

  const extraction = UpdateEmailExtractionSchema.parse({
    employeeName,
    plannedTasks: dedupeStrings(
      [
        ...extractListItems(sections.planned),
        ...classifiedPlanned.planned,
        ...classifiedOther.planned
      ],
      tasksEquivalent
    ),
    completedTasks: dedupeStrings(
      [
        ...(sections.completed.length ? extractListItems(sections.completed) : fallbackCompletedItems(body)),
        ...classifiedCompleted.completed,
        ...classifiedPlanned.completed,
        ...classifiedOther.completed
      ],
      tasksEquivalent
    ),
    blockers: dedupeStrings(
      [
        ...(sections.blockers.length ? extractListItems(sections.blockers) : fallbackBlockers(body)),
        ...classifiedBlockers.blockers,
        ...classifiedNext.blockers,
        ...classifiedOther.blockers
      ],
      blockersEquivalent
    ),
    nextTasks: dedupeStrings(
      [
        ...(sections.next.length ? extractListItems(sections.next) : fallbackNextTasks(body)),
        ...classifiedNext.next,
        ...classifiedCompleted.next,
        ...classifiedOther.next
      ],
      tasksEquivalent
    ),
    mailType
  });

  return rebalanceExtraction(extraction);
};

export const mergeExtractions = (
  heuristic: UpdateEmailExtraction,
  llm?: Partial<UpdateEmailExtraction> | null
) =>
  rebalanceExtraction(
    UpdateEmailExtractionSchema.parse({
      employeeName:
        llm?.employeeName?.trim() || heuristic.employeeName || "Unknown Team Member",
      plannedTasks: dedupeStrings(
        [...heuristic.plannedTasks, ...(llm?.plannedTasks ?? [])],
        tasksEquivalent
      ),
      completedTasks: dedupeStrings(
        [...heuristic.completedTasks, ...(llm?.completedTasks ?? [])],
        tasksEquivalent
      ),
      blockers: dedupeStrings(
        [...heuristic.blockers, ...(llm?.blockers ?? [])],
        blockersEquivalent
      ),
      nextTasks: dedupeStrings(
        [...heuristic.nextTasks, ...(llm?.nextTasks ?? [])],
        tasksEquivalent
      ),
      mailType: llm?.mailType ?? heuristic.mailType
    })
  );

export const calculatePendingTasks = (plannedTasks: string[], completedTasks: string[]) =>
  dedupeStrings(
    plannedTasks.filter(
      (plannedTask) => !completedTasks.some((completedTask) => tasksEquivalent(plannedTask, completedTask))
    ),
    tasksEquivalent
  );

export const inferResolutionNote = (
  blockerText: string,
  completedTasks: string[],
  rawEmailBody: string
) => {
  const matchingTask = completedTasks.find(
    (task) => resolutionVerbPattern.test(task) && overlapScore(task, blockerText) >= 0.34
  );
  if (matchingTask) {
    return matchingTask;
  }

  const resolutionSentence = sentenceItems(rawEmailBody).find(
    (sentence) => resolutionVerbPattern.test(sentence) && overlapScore(sentence, blockerText) >= 0.34
  );

  return resolutionSentence;
};

export const blockerLooksResolved = (
  blockerText: string,
  completedTasks: string[],
  rawEmailBody: string
) => Boolean(inferResolutionNote(blockerText, completedTasks, rawEmailBody));

export const isoDay = (value?: string | Date) => {
  const date = value instanceof Date ? value : value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
};

export const isoDayStart = (value: string) => `${isoDay(value)}T00:00:00.000Z`;
export const isoDayEnd = (value: string) => `${isoDay(value)}T23:59:59.999Z`;

export const getWeekBounds = (anchor?: string | Date) => {
  const date = anchor instanceof Date ? new Date(anchor) : anchor ? new Date(anchor) : new Date();
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() - day + 1);
  const weekStart = isoDay(utcDate);
  const weekEndDate = new Date(utcDate);
  weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6);

  return {
    weekStartDate: weekStart,
    weekEndDate: isoDay(weekEndDate)
  };
};

const formatDateLabel = (value: string) =>
  new Date(value).toLocaleDateString("en-US", {
    dateStyle: "medium"
  });

export const formatDateRangeLabel = (startDate: string, endDate: string) =>
  `${formatDateLabel(startDate)} to ${formatDateLabel(endDate)}`;

const parseExplicitDate = (value: string) => {
  const yearFirst = value.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (yearFirst) {
    const parsed = new Date(`${yearFirst[1]}-${yearFirst[2]}-${yearFirst[3]}T00:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) ? undefined : isoDay(parsed);
  }

  const dayMonthYear = value.match(
    new RegExp(`\\b(\\d{1,2})\\s+(${monthNamePattern})\\s+(20\\d{2})\\b`, "i")
  );
  if (dayMonthYear) {
    const parsed = new Date(
      `${dayMonthYear[2]} ${dayMonthYear[1]}, ${dayMonthYear[3]} 00:00:00 UTC`
    );
    return Number.isNaN(parsed.getTime()) ? undefined : isoDay(parsed);
  }

  const monthDayYear = value.match(
    new RegExp(`\\b(${monthNamePattern})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,)?\\s+(20\\d{2})\\b`, "i")
  );
  if (monthDayYear) {
    const parsed = new Date(
      `${monthDayYear[1]} ${monthDayYear[2]}, ${monthDayYear[3]} 00:00:00 UTC`
    );
    return Number.isNaN(parsed.getTime()) ? undefined : isoDay(parsed);
  }

  return undefined;
};

export const buildComparisonSummary = (comparison: DailyUpdateComparison) => {
  if (!comparison.plannedTasks.length) {
    return comparison.completedTasks.length
      ? "No explicit morning plan was found, but work updates were captured."
      : "No explicit plan or completion details were captured.";
  }

  if (!comparison.pendingTasks.length) {
    return "All planned work appears completed for the day.";
  }

  if (!comparison.completedTasks.length) {
    return "Planned work was captured, but no completed work has been recorded yet.";
  }

  return `${comparison.completedTasks.length} planned item(s) completed and ${comparison.pendingTasks.length} carried forward.`;
};

const normaliseEmployeeFilter = (value: string) =>
  titleCase(
    value
      .replace(/[?.!,]+$/g, "")
      .replace(/\b(today|this week|last week|week|report|summary|blockers|updates)\b/gi, "")
      .trim()
  );

const extractEmployeeFilter = (query: string) => {
  const matches = [
    query.match(/\bfor\s+([a-z][a-z\s.'-]{1,60})/i),
    query.match(/\bof\s+([a-z][a-z\s.'-]{1,60})/i)
  ].filter(Boolean);

  for (const match of matches) {
    const candidate = normaliseEmployeeFilter(match?.[1] ?? "");
    if (
      candidate &&
      candidate.split(" ").length <= 4 &&
      !candidate.split(" ").some((part) => monthNameSet.has(part.toLowerCase())) &&
      !/\d/.test(candidate)
    ) {
      return candidate;
    }
  }

  return undefined;
};

export const parseReportQuery = (
  query: string,
  currentDate = new Date()
): { kind: ReportTableKind; filters: ReportFilters } => {
  const lower = query.toLowerCase();
  let kind: ReportTableKind = "daily_updates";
  const filters: ReportFilters = {};

  if (
    lower.includes("wbr") ||
    lower.includes("weekly business report") ||
    lower.includes("team weekly report") ||
    lower.includes("weekly summary")
  ) {
    kind = "weekly_business_report";
  } else if (lower.includes("resolved blocker")) {
    kind = "resolved_blockers";
    filters.blockerStatus = "resolved";
  } else if (
    lower.includes("pending blocker") ||
    lower.includes("open blocker") ||
    lower.includes("still open")
  ) {
    kind = "pending_blockers";
    filters.blockerStatus = "open";
  } else if (
    lower.includes("completed vs pending") ||
    (lower.includes("planned") && lower.includes("completed")) ||
    lower.includes("carried forward")
  ) {
    kind = "completed_vs_pending";
  } else if (lower.includes("team member") && lower.includes("completed")) {
    kind = "team_weekly_summary";
  }

  if (lower.includes("today")) {
    const today = isoDay(currentDate);
    filters.startDate = today;
    filters.endDate = today;
  } else if (lower.includes("yesterday")) {
    const date = new Date(currentDate);
    date.setUTCDate(date.getUTCDate() - 1);
    const yesterday = isoDay(date);
    filters.startDate = yesterday;
    filters.endDate = yesterday;
  }

  if (lower.includes("this week")) {
    const bounds = getWeekBounds(currentDate);
    filters.weekStartDate = bounds.weekStartDate;
    filters.startDate = bounds.weekStartDate;
    filters.endDate = bounds.weekEndDate;
  } else if (lower.includes("last week")) {
    const date = new Date(currentDate);
    date.setUTCDate(date.getUTCDate() - 7);
    const bounds = getWeekBounds(date);
    filters.weekStartDate = bounds.weekStartDate;
    filters.startDate = bounds.weekStartDate;
    filters.endDate = bounds.weekEndDate;
  }

  const explicitDate = parseExplicitDate(query);
  if (explicitDate) {
    if (
      kind === "weekly_business_report" ||
      kind === "team_weekly_summary" ||
      /\bweek of\b/i.test(query)
    ) {
      const bounds = getWeekBounds(explicitDate);
      filters.weekStartDate = bounds.weekStartDate;
      filters.startDate = bounds.weekStartDate;
      filters.endDate = bounds.weekEndDate;
    } else {
      filters.startDate = explicitDate;
      filters.endDate = explicitDate;
      delete filters.weekStartDate;
    }
  }

  const employeeName = extractEmployeeFilter(query);
  if (employeeName) {
    filters.employeeName = employeeName;
  }

  return { kind, filters };
};

export const toAppliedFilters = (filters: ReportFilters) => {
  const applied: Record<string, string> = {};
  if (filters.employeeName) {
    applied.Employee = filters.employeeName;
  }
  if (filters.startDate) {
    applied["From Date"] = filters.startDate;
  }
  if (filters.endDate) {
    applied["To Date"] = filters.endDate;
  }
  if (filters.weekStartDate) {
    applied["Week Start"] = filters.weekStartDate;
  }
  if (filters.blockerStatus) {
    applied["Blocker Status"] = filters.blockerStatus;
  }
  if (filters.search) {
    applied.Search = filters.search;
  }
  return applied;
};

export const createReportTable = (input: {
  kind: ReportTableKind;
  title: string;
  subtitle?: string;
  columns: ReportTableColumn[];
  rows: Array<Record<string, unknown>>;
  filters?: ReportFilters;
  emptyMessage?: string;
}) =>
  ReportTableSchema.parse({
    kind: input.kind,
    title: input.title,
    subtitle: input.subtitle,
    columns: input.columns,
    rows: input.rows,
    appliedFilters: toAppliedFilters(input.filters ?? {}),
    generatedAt: nowIso(),
    emptyMessage: input.emptyMessage
  });

export const stringifyCellValue = (value: unknown): string => {
  if (Array.isArray(value)) {
    return value.map((entry) => stringifyCellValue(entry)).join(" | ");
  }
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
};

export const blockerStillOpenForWeek = (blocker: BlockerTrackingRecord, weekEndDate: string) =>
  blocker.status !== "resolved" || !blocker.resolvedDate || blocker.resolvedDate > isoDayEnd(weekEndDate);

export const reportSubtitle = (title: string, filters: ReportFilters) => {
  if (filters.weekStartDate) {
    const bounds = getWeekBounds(filters.weekStartDate);
    return `${title} for ${formatDateRangeLabel(bounds.weekStartDate, bounds.weekEndDate)}`;
  }

  if (filters.startDate && filters.endDate) {
    return `${title} for ${formatDateRangeLabel(filters.startDate, filters.endDate)}`;
  }

  return undefined;
};

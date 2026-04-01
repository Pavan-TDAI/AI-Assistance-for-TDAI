"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  ArrowRightLeft,
  BarChart3,
  Bug,
  LoaderCircle,
  MailSearch,
  Search,
  Sparkles
} from "lucide-react";

import type {
  ExportFormat,
  ReportFilters,
  ReportSyncMode,
  ReportTable
} from "@personal-ai/shared";

import { api } from "../lib/api";
import { ReportTable as ReportTableView } from "./report-table";

type ViewKind =
  | "daily_updates"
  | "pending_blockers"
  | "resolved_blockers"
  | "completed_vs_pending"
  | "weekly_business_report";

const todayIso = new Date().toISOString().slice(0, 10);

const currentWeekStart = () => {
  const date = new Date();
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() - day + 1);
  return utc.toISOString().slice(0, 10);
};

const initialFilters: ReportFilters = {
  startDate: currentWeekStart(),
  endDate: todayIso,
  weekStartDate: currentWeekStart(),
  blockerStatus: undefined,
  employeeName: "",
  search: ""
};

const viewOptions: Array<{
  id: ViewKind;
  label: string;
  note: string;
  icon: typeof BarChart3;
}> = [
  {
    id: "daily_updates",
    label: "Daily Updates",
    note: "Structured extracts from update emails",
    icon: MailSearch
  },
  {
    id: "pending_blockers",
    label: "Pending Blockers",
    note: "Open and carried-forward blockers",
    icon: Bug
  },
  {
    id: "resolved_blockers",
    label: "Resolved Blockers",
    note: "What got solved and how",
    icon: Sparkles
  },
  {
    id: "completed_vs_pending",
    label: "Completed vs Pending",
    note: "Morning plan compared against status updates",
    icon: ArrowRightLeft
  },
  {
    id: "weekly_business_report",
    label: "WBR",
    note: "Manager-friendly weekly report table",
    icon: BarChart3
  }
];

export const ReportingDashboard = () => {
  const [viewKind, setViewKind] = useState<ViewKind>("daily_updates");
  const [filters, setFilters] = useState<ReportFilters>(initialFilters);
  const [table, setTable] = useState<ReportTable | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<"ingest" | "sync" | "query" | null>(null);
  const [exportLoading, setExportLoading] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [query, setQuery] = useState("Generate this week's WBR");
  const [querySyncMode, setQuerySyncMode] = useState<ReportSyncMode>("auto");
  const [mailboxQuery, setMailboxQuery] = useState(
    "daily update OR EOD OR highlights OR next steps"
  );
  const [syncLimit, setSyncLimit] = useState("10");
  const [manualEmail, setManualEmail] = useState({
    sourceEmailId: "",
    fromEmail: "",
    subject: "",
    emailDate: todayIso,
    rawEmailBody: ""
  });

  const loadTable = async (kind: ViewKind, nextFilters: ReportFilters = filters) => {
    setLoading(true);
    setError(null);

    try {
      const nextTable =
        kind === "daily_updates"
          ? await api.getDailyUpdateReport(nextFilters)
          : kind === "pending_blockers"
            ? await api.getPendingBlockersReport(nextFilters)
            : kind === "resolved_blockers"
              ? await api.getResolvedBlockersReport(nextFilters)
              : kind === "completed_vs_pending"
                ? await api.getCompletedVsPendingReport(nextFilters)
                : await api.getWeeklyBusinessReport(nextFilters);

      setTable(nextTable);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTable(viewKind, filters);
  }, []);

  const downloadExport = async (format: ExportFormat) => {
    if (!table) {
      return;
    }

    setExportLoading(format);
    setError(null);
    try {
      const { blob, filename } = await api.exportReportTable({
        title: table.title,
        format,
        columns: table.columns,
        rows: table.rows,
        appliedFilters: table.appliedFilters,
        fileName: table.title
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download =
        filename ??
        `${table.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.${format === "excel" ? "xls" : format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setExportLoading(null);
    }
  };

  const applyFilters = async () => {
    await loadTable(viewKind, filters);
  };

  const resetFilters = async () => {
    const nextFilters = initialFilters;
    setFilters(nextFilters);
    await loadTable(viewKind, nextFilters);
  };

  const runQuery = async () => {
    setActionLoading("query");
    setError(null);
    setStatus(null);

    try {
      const nextTable = await api.queryReports({ query, syncMode: querySyncMode });
      setTable(nextTable);
      setViewKind(
        nextTable.kind === "team_weekly_summary"
          ? "weekly_business_report"
          : (nextTable.kind as ViewKind)
      );
      setStatus(`Loaded "${nextTable.title}" from your natural-language query.`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setActionLoading(null);
    }
  };

  const syncMailbox = async () => {
    setActionLoading("sync");
    setError(null);
    setStatus(null);

    try {
      const result = await api.syncUpdateEmails({
        query: mailboxQuery,
        limit: Number(syncLimit) || 10,
        forceReprocess: false
      });
      setStatus(
        `Synced ${result.syncedCount} update email(s) and skipped ${result.skippedCount}.`
      );
      await loadTable(viewKind, filters);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setActionLoading(null);
    }
  };

  const ingestManualEmail = async () => {
    setActionLoading("ingest");
    setError(null);
    setStatus(null);

    try {
      const result = await api.ingestUpdateEmail({
        sourceEmailId: manualEmail.sourceEmailId || undefined,
        fromEmail: manualEmail.fromEmail || undefined,
        subject: manualEmail.subject || undefined,
        emailDate: manualEmail.emailDate || undefined,
        rawEmailBody: manualEmail.rawEmailBody,
        forceReprocess: false
      });
      setStatus(
        `Processed the update email and refreshed blocker tracking for ${String(
          (result.update as { employeeName?: string }).employeeName ?? "the employee"
        )}.`
      );
      setManualEmail((current) => ({
        ...current,
        rawEmailBody: "",
        subject: "",
        sourceEmailId: ""
      }));
      await loadTable(viewKind, filters);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="scroll-pane h-full space-y-4 p-2 pr-1">
      <section className="surface-panel halo-panel rounded-[2.25rem] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="section-kicker">Work Reporting</p>
            <h1 className="font-display mt-2 text-3xl font-semibold text-ink">
              Personalized AI Work Assistant Reports
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-ink/62">
              Parse employee update emails, compare morning plans with evening progress,
              track blockers across days, and generate exportable WBR tables from one place.
            </p>
          </div>
          <div className="soft-chip rounded-[1.4rem] px-4 py-3 text-sm text-ink/62">
            Table-first views with CSV, Excel, and PDF export
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="surface-muted rounded-[1.8rem] p-4">
            <label className="text-sm font-medium text-ink/72">Ask for a report</label>
            <div className="mt-2 flex flex-col gap-3 md:flex-row">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="field"
                placeholder="Show pending blockers for Srishti this week"
              />
              <select
                value={querySyncMode}
                onChange={(event) => setQuerySyncMode(event.target.value as ReportSyncMode)}
                className="field md:max-w-[11rem]"
              >
                <option value="auto">Auto sync</option>
                <option value="stored_only">Stored only</option>
                <option value="force_sync">Force sync</option>
              </select>
              <button
                type="button"
                onClick={() => void runQuery()}
                className="button-primary shrink-0"
              >
                {actionLoading === "query" ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                Run query
              </button>
            </div>
          </div>

          <div className="surface-muted rounded-[1.8rem] p-4">
            <label className="text-sm font-medium text-ink/72">Sync update emails</label>
            <div className="mt-2 grid gap-3 md:grid-cols-[1fr_7rem_auto]">
              <input
                value={mailboxQuery}
                onChange={(event) => setMailboxQuery(event.target.value)}
                className="field"
                placeholder="daily update OR EOD OR highlights"
              />
              <input
                value={syncLimit}
                onChange={(event) => setSyncLimit(event.target.value)}
                className="field"
                placeholder="Limit"
              />
              <button
                type="button"
                onClick={() => void syncMailbox()}
                className="button-secondary shrink-0"
              >
                {actionLoading === "sync" ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <MailSearch className="h-4 w-4" />
                )}
                Sync mailbox
              </button>
            </div>
          </div>
        </div>

        {status ? <p className="mt-4 text-sm text-signal">{status}</p> : null}
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      </section>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="surface-panel rounded-[2.15rem] p-5">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-signal" />
            <h2 className="font-display text-xl font-semibold text-ink">Views and Filters</h2>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {viewOptions.map((option) => {
              const Icon = option.icon;
              const active = option.id === viewKind;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    setViewKind(option.id);
                    void loadTable(option.id, filters);
                  }}
                  className={`rounded-[1.55rem] p-4 text-left transition ${
                    active
                      ? "surface-panel border-signal/35 bg-[linear-gradient(180deg,rgba(17,121,111,0.12),rgba(255,255,255,0.9))]"
                      : "surface-muted"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-signal" />
                    <p className="font-medium text-ink">{option.label}</p>
                  </div>
                  <p className="mt-2 text-sm text-ink/58">{option.note}</p>
                </button>
              );
            })}
          </div>

          <div className="story-divider my-5" />

          <div className="grid gap-3 md:grid-cols-2">
            <FilterField label="Employee name">
              <input
                value={filters.employeeName ?? ""}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, employeeName: event.target.value }))
                }
                className="field"
                placeholder="Srishti Bk"
              />
            </FilterField>

            <FilterField label="Search rows">
              <input
                value={filters.search ?? ""}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, search: event.target.value }))
                }
                className="field"
                placeholder="calendar sync"
              />
            </FilterField>

            <FilterField label="Start date">
              <input
                type="date"
                value={filters.startDate ?? ""}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, startDate: event.target.value }))
                }
                className="field"
              />
            </FilterField>

            <FilterField label="End date">
              <input
                type="date"
                value={filters.endDate ?? ""}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, endDate: event.target.value }))
                }
                className="field"
              />
            </FilterField>

            <FilterField label="Week start">
              <input
                type="date"
                value={filters.weekStartDate ?? ""}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, weekStartDate: event.target.value }))
                }
                className="field"
              />
            </FilterField>

            <FilterField label="Blocker status">
              <select
                value={filters.blockerStatus ?? ""}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    blockerStatus:
                      event.target.value === "open" ||
                      event.target.value === "resolved" ||
                      event.target.value === "carried_forward"
                        ? event.target.value
                        : undefined
                  }))
                }
                className="field"
              >
                <option value="">Any status</option>
                <option value="open">open</option>
                <option value="carried_forward">carried_forward</option>
                <option value="resolved">resolved</option>
              </select>
            </FilterField>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => void applyFilters()} className="button-primary">
              Apply filters
            </button>
            <button type="button" onClick={() => void resetFilters()} className="button-secondary">
              Reset
            </button>
          </div>
        </section>

        <section className="surface-panel rounded-[2.15rem] p-5">
          <div className="mb-4 flex items-center gap-2">
            <MailSearch className="h-5 w-5 text-ember" />
            <h2 className="font-display text-xl font-semibold text-ink">Paste Update Email</h2>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <FilterField label="Source email ID">
              <input
                value={manualEmail.sourceEmailId}
                onChange={(event) =>
                  setManualEmail((current) => ({
                    ...current,
                    sourceEmailId: event.target.value
                  }))
                }
                className="field"
                placeholder="mail_001"
              />
            </FilterField>

            <FilterField label="From">
              <input
                value={manualEmail.fromEmail}
                onChange={(event) =>
                  setManualEmail((current) => ({
                    ...current,
                    fromEmail: event.target.value
                  }))
                }
                className="field"
                placeholder="Srishti Bk <srishti@example.com>"
              />
            </FilterField>

            <FilterField label="Subject">
              <input
                value={manualEmail.subject}
                onChange={(event) =>
                  setManualEmail((current) => ({
                    ...current,
                    subject: event.target.value
                  }))
                }
                className="field"
                placeholder="Daily update"
              />
            </FilterField>

            <FilterField label="Email date">
              <input
                type="date"
                value={manualEmail.emailDate}
                onChange={(event) =>
                  setManualEmail((current) => ({
                    ...current,
                    emailDate: event.target.value
                  }))
                }
                className="field"
              />
            </FilterField>
          </div>

          <FilterField label="Email body">
            <textarea
              value={manualEmail.rawEmailBody}
              onChange={(event) =>
                setManualEmail((current) => ({
                  ...current,
                  rawEmailBody: event.target.value
                }))
              }
              className="field min-h-72"
              placeholder="Paste the employee update email here..."
            />
          </FilterField>

          <button
            type="button"
            onClick={() => void ingestManualEmail()}
            className="button-primary mt-4"
          >
            {actionLoading === "ingest" ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Parse and store
          </button>
        </section>
      </div>

      <ReportTableView
        table={table}
        loading={loading}
        exportLoading={exportLoading}
        onExport={(format) => void downloadExport(format)}
      />
    </div>
  );
};

const FilterField = ({
  label,
  children
}: {
  label: string;
  children: ReactNode;
}) => (
  <label className="block">
    <span className="mb-2 block text-sm font-medium text-ink/68">{label}</span>
    {children}
  </label>
);

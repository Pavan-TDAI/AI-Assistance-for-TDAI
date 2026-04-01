"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  ArchiveRestore,
  Clock3,
  Database,
  HardDrive,
  MemoryStick,
  Trash2,
  Wrench
} from "lucide-react";

import type { HealthResponse, HistorySnapshot } from "@personal-ai/shared";

import { api, formatTimestamp, formatUsd } from "../lib/api";

export const HistoryDashboard = () => {
  const [history, setHistory] = useState<HistorySnapshot | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const [nextHistory, nextHealth] = await Promise.all([api.getHistory(), api.getHealth()]);
    setHistory(nextHistory);
    setHealth(nextHealth);
  };

  useEffect(() => {
    void load().catch((nextError) => {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    });
  }, []);

  if (error) {
    return <div className="rounded-[2rem] bg-red-50 p-6 text-red-700">{error}</div>;
  }

  return (
    <div className="scroll-pane h-full space-y-4 p-2 pr-1">
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard
          icon={<Clock3 className="h-5 w-5 text-signal" />}
          label="Active sessions"
          value={String(history?.sessions.length ?? 0)}
          note="Current visible chat history"
        />
        <MetricCard
          icon={<ArchiveRestore className="h-5 w-5 text-ember" />}
          label="Archived"
          value={String(history?.archivedSessions.length ?? 0)}
          note="Hidden chats ready to restore"
        />
        <MetricCard
          icon={<Wrench className="h-5 w-5 text-signal" />}
          label="Recent runs"
          value={String(history?.recentRuns.length ?? 0)}
          note="Usage and runtime activity"
        />
        <MetricCard
          icon={<Database className="h-5 w-5 text-ink" />}
          label="MongoDB"
          value={health?.mongo.dbName ?? "loading"}
          note={health?.mongo.uri ?? "Checking connection"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Panel title="Active sessions">
          <div className="space-y-3">
            {history?.sessions.map((entry) => (
              <SessionCard
                key={entry.session.id}
                title={entry.session.title}
                preview={entry.latestMessage?.content ?? "No preview yet"}
                timestamp={entry.session.lastMessageAt}
                actions={
                  <button
                    type="button"
                    onClick={() => {
                      void api.archiveSession(entry.session.id).then(load);
                    }}
                    className="surface-muted inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm text-ink/70"
                  >
                    <ArchiveRestore className="h-4 w-4" />
                    Archive
                  </button>
                }
              />
            ))}
          </div>
        </Panel>

        <Panel title="Archived sessions">
          <div className="space-y-3">
            {history?.archivedSessions.length ? (
              history.archivedSessions.map((entry) => (
                <SessionCard
                  key={entry.session.id}
                  title={entry.session.title}
                  preview={entry.latestMessage?.content ?? "No preview yet"}
                  timestamp={entry.session.lastMessageAt}
                  actions={
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void api.restoreSession(entry.session.id).then(load);
                        }}
                        className="button-success !rounded-2xl !px-3 !py-2 text-sm"
                      >
                        <ArchiveRestore className="h-4 w-4" />
                        Restore
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const confirmed = window.confirm(
                            "Delete this archived session permanently?"
                          );
                          if (!confirmed) {
                            return;
                          }
                          void api.deleteSession(entry.session.id).then(load);
                        }}
                        className="button-danger !rounded-2xl !px-3 !py-2 text-sm"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </button>
                    </div>
                  }
                />
              ))
            ) : (
              <EmptyState text="No archived sessions yet." />
            )}
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Panel title="Recent runs">
          <div className="space-y-3">
            {history?.recentRuns.map((run) => (
              <div key={run.id} className="surface-muted rounded-[1.6rem] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-ink">{run.model}</p>
                  <span className="soft-chip rounded-full px-3 py-1 text-xs text-signal">
                    {run.status}
                  </span>
                </div>
                <p className="mt-2 line-clamp-3 text-sm text-ink/65">
                  {run.summary ?? run.plan ?? run.userPrompt}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-ink/55">
                  <span className="soft-chip rounded-full px-3 py-1">
                    {run.provider}
                  </span>
                  {run.usage ? (
                    <>
                      <span className="soft-chip rounded-full px-3 py-1">
                        {run.usage.totalTokens} tokens
                      </span>
                      <span className="soft-chip rounded-full px-3 py-1">
                        {formatUsd(run.usage.estimatedCostUsd)}
                      </span>
                    </>
                  ) : null}
                </div>
                <p className="mt-3 text-xs text-ink/45">{formatTimestamp(run.updatedAt)}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Meetings and memory">
          <div className="space-y-3">
            {history?.meetings.map((meeting) => (
              <div
                key={meeting.id}
                className="surface-muted rounded-[1.6rem] p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-ink">{meeting.title}</p>
                  <span className="soft-chip rounded-full px-3 py-1 text-xs text-ink/70">
                    {meeting.status}
                  </span>
                </div>
                <p className="mt-2 line-clamp-3 text-sm text-ink/65">
                  {meeting.summary ?? meeting.notes ?? meeting.transcript}
                </p>
                <p className="mt-3 text-xs text-ink/45">{formatTimestamp(meeting.updatedAt)}</p>
              </div>
            ))}
            {history?.meetings.length ? null : <EmptyState text="No meetings captured yet." />}

            <div className="surface-muted rounded-[1.6rem] p-4">
              <div className="mb-3 flex items-center gap-2">
                <MemoryStick className="h-5 w-5 text-signal" />
                <p className="font-medium text-ink">Recent memory</p>
              </div>
              <div className="space-y-3">
                {history?.memories.slice(0, 3).map((memory) => (
                  <div key={memory.id} className="surface-muted rounded-[1.3rem] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-ink">{memory.kind}</p>
                      <p className="text-xs text-ink/45">{formatTimestamp(memory.createdAt)}</p>
                    </div>
                    <p className="mt-2 text-sm text-ink/65">{memory.content}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
};

const MetricCard = ({
  icon,
  label,
  value,
  note
}: {
  icon: ReactNode;
  label: string;
  value: string;
  note: string;
}) => (
  <div className="surface-panel rounded-[2.2rem] p-5">
    <div className="flex items-center justify-between">
      <p className="text-sm uppercase tracking-[0.2em] text-ink/45">{label}</p>
      {icon}
    </div>
    <p className="mt-4 font-display text-3xl font-semibold text-ink">{value}</p>
    <p className="mt-2 text-sm text-ink/60">{note}</p>
  </div>
);

const Panel = ({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) => (
  <section className="surface-panel rounded-[2.2rem] p-5">
    <div className="mb-4 flex items-center gap-2">
      <HardDrive className="h-5 w-5 text-ink/60" />
      <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
    </div>
    {children}
  </section>
);

const SessionCard = ({
  title,
  preview,
  timestamp,
  actions
}: {
  title: string;
  preview: string;
  timestamp: string;
  actions: ReactNode;
}) => (
  <div className="surface-muted rounded-[1.6rem] p-4">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="font-medium text-ink">{title}</p>
        <p className="mt-1 line-clamp-2 text-sm text-ink/60">{preview}</p>
        <p className="mt-3 text-xs text-ink/45">{formatTimestamp(timestamp)}</p>
      </div>
      <div className="shrink-0">{actions}</div>
    </div>
  </div>
);

const EmptyState = ({ text }: { text: string }) => (
  <div className="surface-muted rounded-[1.6rem] border-dashed p-4 text-sm text-ink/55">
    {text}
  </div>
);

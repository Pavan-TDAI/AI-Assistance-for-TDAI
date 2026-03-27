import type { SessionWithPreview } from "@personal-ai/shared";
import { Archive, PanelLeftClose, Plus, Sparkles } from "lucide-react";

import { formatTimestamp } from "../lib/api";

export const SessionSidebar = ({
  sessions,
  selectedSessionId,
  onSelect,
  onNewSession,
  onArchive,
  onClose
}: {
  sessions: SessionWithPreview[];
  selectedSessionId?: string;
  onSelect: (sessionId: string) => void;
  onNewSession: () => void;
  onArchive: (sessionId: string) => void;
  onClose?: () => void;
}) => (
  <aside className="surface-panel flex h-full min-h-0 w-full max-w-[20rem] flex-col rounded-[2.2rem] p-4">
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <p className="font-display text-xl font-semibold text-ink">Sessions</p>
        <p className="text-sm text-ink/55">Active conversations and recent work.</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onNewSession}
          className="surface-elevated flex h-10 w-10 items-center justify-center rounded-[1.1rem] bg-ink text-white transition hover:bg-signal"
          title="New session"
        >
          <Plus className="h-4 w-4" />
        </button>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="surface-muted flex h-10 w-10 items-center justify-center rounded-[1.1rem] text-ink"
            title="Hide sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>

    <div className="scroll-pane min-h-0 flex-1 space-y-3 pr-1">
      {sessions.length ? (
        sessions.map((entry) => {
          const active = entry.session.id === selectedSessionId;
          return (
            <div
              key={entry.session.id}
              className={`rounded-[1.8rem] p-4 transition ${
                active
                  ? "surface-panel border-signal/35 bg-[linear-gradient(180deg,rgba(17,121,111,0.12),rgba(255,255,255,0.84))]"
                  : "surface-muted hover:border-ember/20"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => onSelect(entry.session.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-center gap-2">
                    {active ? <Sparkles className="h-4 w-4 text-signal" /> : null}
                    <p className="line-clamp-2 break-words font-medium text-ink">
                      {entry.session.title}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-ink/45">
                    {formatTimestamp(entry.session.lastMessageAt)}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => onArchive(entry.session.id)}
                  className="surface-muted inline-flex h-9 w-9 items-center justify-center rounded-[1rem] text-ink/65 transition hover:border-signal/30 hover:text-signal"
                  title="Archive session"
                >
                  <Archive className="h-4 w-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => onSelect(entry.session.id)}
                className="mt-3 block w-full text-left"
              >
                <p className="line-clamp-3 break-words text-sm text-ink/65">
                  {entry.latestMessage?.content ?? "No messages yet."}
                </p>
              </button>
            </div>
          );
        })
      ) : (
        <div className="surface-muted rounded-[1.6rem] border-dashed p-5 text-sm text-ink/60">
          No active sessions yet. Start a new chat or restore an archived session from History.
        </div>
      )}
    </div>
  </aside>
);

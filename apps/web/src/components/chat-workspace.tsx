"use client";

import type { ReactNode } from "react";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ChevronLeft,
  LayoutPanelLeft,
  LoaderCircle,
  PanelRight,
  Send,
  ShieldAlert,
  Sparkles,
  XCircle
} from "lucide-react";

import type {
  ApprovalRecord,
  HealthResponse,
  MessageRecord,
  RunEvent,
  RunRecord,
  SessionBundle,
  SessionWithPreview,
  ToolCallRecord
} from "@personal-ai/shared";

import { api, formatTimestamp, formatUsd } from "../lib/api";
import { SessionSidebar } from "./session-sidebar";

const upsertToolCall = (toolCalls: ToolCallRecord[], next: ToolCallRecord) => {
  const existingIndex = toolCalls.findIndex((entry) => entry.id === next.id);
  if (existingIndex === -1) {
    return [next, ...toolCalls];
  }

  const updated = [...toolCalls];
  updated[existingIndex] = next;
  return updated;
};

const upsertApproval = (approvals: ApprovalRecord[], next: ApprovalRecord) => {
  const existingIndex = approvals.findIndex((entry) => entry.id === next.id);
  if (existingIndex === -1) {
    return [next, ...approvals];
  }

  const updated = [...approvals];
  updated[existingIndex] = next;
  return updated;
};

const upsertMessage = (messages: MessageRecord[], next: MessageRecord) => {
  if (messages.some((entry) => entry.id === next.id)) {
    return messages;
  }

  return [...messages, next];
};

const upsertRun = (runs: RunRecord[], next: RunRecord) => {
  const existingIndex = runs.findIndex((entry) => entry.id === next.id);
  if (existingIndex === -1) {
    return [next, ...runs];
  }

  const updated = [...runs];
  updated[existingIndex] = next;
  return updated;
};

const readStoredBoolean = (key: string, fallback: boolean) => {
  if (typeof window === "undefined") {
    return fallback;
  }

  const stored = window.localStorage.getItem(key);
  if (stored === null) {
    return fallback;
  }

  return stored === "true";
};

const readStoredString = (key: string) => {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.localStorage.getItem(key) ?? undefined;
};

export const ChatWorkspace = () => {
  const streamRef = useRef<EventSource | null>(null);
  const messagesViewportRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const isComposingRef = useRef(false);

  const [sessions, setSessions] = useState<SessionWithPreview[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>();
  const [bundle, setBundle] = useState<SessionBundle | null>(null);
  const [input, setInput] = useState("");
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runtimeHealth, setRuntimeHealth] = useState<HealthResponse | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isUtilityDrawerOpen, setIsUtilityDrawerOpen] = useState(true);
  const [selectedMeetingContextId, setSelectedMeetingContextId] = useState<string>();

  const pendingApprovals = useMemo(
    () => bundle?.approvals.filter((approval) => approval.status === "pending") ?? [],
    [bundle]
  );

  const latestRun = bundle?.runs[0];

  const loadSessions = async () => {
    const nextSessions = await api.getSessions();
    setSessions(nextSessions);
    if (!selectedSessionId && nextSessions[0]) {
      setSelectedSessionId(nextSessions[0].session.id);
    }
  };

  const loadHealth = async () => {
    const nextHealth = await api.getHealth();
    setRuntimeHealth(nextHealth);
  };

  const loadBundle = async (sessionId: string) => {
    const nextBundle = await api.getSession(sessionId);
    setBundle(nextBundle);
  };

  const updateScrollStickiness = () => {
    const viewport = messagesViewportRef.current;
    if (!viewport) {
      return;
    }

    const distanceFromBottom =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    shouldStickToBottomRef.current = distanceFromBottom < 120;
  };

  const scrollMessagesToBottom = (behavior: ScrollBehavior = "auto") => {
    const viewport = messagesViewportRef.current;
    if (!viewport) {
      return;
    }

    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior
    });
  };

  useEffect(() => {
    setIsSidebarOpen(readStoredBoolean("chat.ui.sidebar", true));
    setIsUtilityDrawerOpen(readStoredBoolean("chat.ui.drawer", true));
    setSelectedMeetingContextId(readStoredString("meetings.selectedId"));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncSelectedMeeting = () => {
      setSelectedMeetingContextId(readStoredString("meetings.selectedId"));
    };

    window.addEventListener("focus", syncSelectedMeeting);
    return () => {
      window.removeEventListener("focus", syncSelectedMeeting);
    };
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("chat.ui.sidebar", String(isSidebarOpen));
    }
  }, [isSidebarOpen]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("chat.ui.drawer", String(isUtilityDrawerOpen));
    }
  }, [isUtilityDrawerOpen]);

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([loadSessions(), loadHealth()]);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : String(nextError));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedSessionId) {
      setBundle(null);
      return;
    }

    void loadBundle(selectedSessionId).catch((nextError) => {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    });
  }, [selectedSessionId]);

  useEffect(() => () => streamRef.current?.close(), []);

  useEffect(() => {
    shouldStickToBottomRef.current = true;
    requestAnimationFrame(() => {
      scrollMessagesToBottom("auto");
    });
  }, [selectedSessionId]);

  useEffect(() => {
    if (!bundle?.messages.length || !shouldStickToBottomRef.current) {
      return;
    }

    requestAnimationFrame(() => {
      scrollMessagesToBottom("auto");
    });
  }, [bundle?.messages.length]);

  const subscribeToRun = (runId: string, sessionId: string) => {
    streamRef.current?.close();
    const source = api.subscribeToRun(runId, {
      onEvent: (event) => {
        setBundle((current) => {
          if (!current || current.session.id !== sessionId) {
            return current;
          }

          if (event.type === "assistant_message") {
            return {
              ...current,
              messages: upsertMessage(current.messages, event.message)
            };
          }

          if (event.type === "tool_pending_approval") {
            return {
              ...current,
              approvals: upsertApproval(current.approvals, event.approval),
              toolCalls: upsertToolCall(current.toolCalls, event.toolCall)
            };
          }

          if (
            event.type === "tool_approved" ||
            event.type === "tool_denied" ||
            event.type === "tool_started" ||
            event.type === "tool_result"
          ) {
            return {
              ...current,
              approvals: event.approval
                ? upsertApproval(current.approvals, event.approval)
                : current.approvals,
              toolCalls: upsertToolCall(current.toolCalls, event.toolCall)
            };
          }

          if (event.type === "completed" && event.run) {
            return {
              ...current,
              runs: upsertRun(current.runs, event.run)
            };
          }

          return current;
        });

        if (event.type === "error") {
          setError(event.error);
        }

        if (event.type === "completed") {
          source.close();
          streamRef.current = null;
          setActiveRunId(null);
          startTransition(() => {
            void loadSessions();
            void loadBundle(sessionId);
          });
        }
      },
      onError: () => {
        setError("The live stream disconnected. Refresh the session to continue.");
      }
    });

    streamRef.current = source;
  };

  const handleSend = async () => {
    if (!input.trim() || sending) {
      return;
    }

    setSending(true);
    setError(null);

    try {
      const response = await api.sendPrompt({
        sessionId: selectedSessionId,
        content: input.trim(),
        selectedMeetingId: selectedMeetingContextId
      });

      setInput("");
      setSelectedSessionId(response.sessionId);
      setActiveRunId(response.runId);
      await Promise.all([loadSessions(), loadBundle(response.sessionId)]);
      subscribeToRun(response.runId, response.sessionId);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setSending(false);
    }
  };

  const handleApproval = async (
    approvalId: string,
    decision: "approved" | "denied"
  ) => {
    try {
      const updated = await api.decideApproval(approvalId, { decision });
      setBundle((current) =>
        current
          ? {
              ...current,
              approvals: upsertApproval(current.approvals, updated)
            }
          : current
      );
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  };

  const handleArchive = async (sessionId: string) => {
    const confirmed = window.confirm("Archive this session? You can restore it from History.");
    if (!confirmed) {
      return;
    }

    try {
      await api.archiveSession(sessionId);
      const nextSessions = await api.getSessions();
      setSessions(nextSessions);

      if (selectedSessionId === sessionId) {
        const nextSelected = nextSessions[0]?.session.id;
        setSelectedSessionId(nextSelected);
        setActiveRunId(null);
        if (nextSelected) {
          await loadBundle(nextSelected);
        } else {
          setBundle(null);
        }
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  };

  const messages = bundle?.messages ?? [];
  const visibleMessages = messages.filter((message) => message.role !== "tool");
  const focusMode = !isSidebarOpen && !isUtilityDrawerOpen;

  return (
    <div className="relative flex h-full min-h-0 gap-3 overflow-hidden">
      {isSidebarOpen ? (
        <button
          type="button"
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-20 bg-ink/20 xl:hidden"
          aria-label="Close sidebar backdrop"
        />
      ) : null}

      {isUtilityDrawerOpen ? (
        <button
          type="button"
          onClick={() => setIsUtilityDrawerOpen(false)}
          className="fixed inset-0 z-20 bg-ink/20 xl:hidden"
          aria-label="Close drawer backdrop"
        />
      ) : null}

      <div
        className={`fixed inset-y-3 left-3 z-30 w-[20rem] max-w-[calc(100vw-2.5rem)] transition xl:static xl:inset-auto xl:w-[20rem] xl:shrink-0 ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-[110%] xl:hidden"
        }`}
      >
        <SessionSidebar
          sessions={sessions}
          selectedSessionId={selectedSessionId}
          onSelect={(sessionId) => {
            setSelectedSessionId(sessionId);
          }}
          onNewSession={() => {
            setSelectedSessionId(undefined);
            setBundle(null);
            setActiveRunId(null);
          }}
          onArchive={(sessionId) => void handleArchive(sessionId)}
          onClose={() => setIsSidebarOpen(false)}
        />
      </div>

      <section className="surface-panel flex min-h-0 min-w-0 flex-1 flex-col rounded-[2.2rem]">
        <div className="shrink-0 border-b border-ink/10 px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <ToolbarButton
                  label="Toggle sessions"
                  onClick={() => setIsSidebarOpen((current) => !current)}
                  icon={<LayoutPanelLeft className="h-4 w-4" />}
                />
                <ToolbarButton
                  label="Toggle utility drawer"
                  onClick={() => setIsUtilityDrawerOpen((current) => !current)}
                  icon={<PanelRight className="h-4 w-4" />}
                />
                {bundle?.session.title ? (
                    <span className="soft-chip rounded-full px-3 py-1 text-xs font-medium text-signal">
                      Active session
                    </span>
                  ) : null}
                {focusMode ? (
                  <span className="surface-elevated rounded-full bg-ink px-3 py-1 text-xs font-medium text-white">
                    Focus mode
                  </span>
                ) : null}
              </div>

              <p className="mt-4 font-display text-2xl font-semibold text-ink sm:text-[2rem]">
                {bundle?.session.title ?? "New agent conversation"}
              </p>
              <p className="mt-1 max-w-3xl text-sm text-ink/58">
                Plan-first local agent workspace. Hide the panels when you want a full-width,
                ChatGPT-style writing flow, and open them again when you need approvals or run insight.
              </p>
              {runtimeHealth ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <RuntimePill label={`Provider ${runtimeHealth.provider}`} />
                  <RuntimePill label={runtimeHealth.model} />
                  <RuntimePill label={`Routing ${runtimeHealth.routingPolicy}`} />
                  <RuntimePill
                    label={`Available ${runtimeHealth.availableProviders.join(", ")}`}
                  />
                  {selectedMeetingContextId ? (
                    <RuntimePill label={`Meeting context ${selectedMeetingContextId.slice(-8)}`} />
                  ) : null}
                </div>
              ) : null}
            </div>
            <StatusPill activeRunId={activeRunId} />
          </div>

          {error ? (
            <div className="mt-4 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="wrap-anywhere">{error}</span>
            </div>
          ) : null}
        </div>

        <div
          ref={messagesViewportRef}
          onScroll={updateScrollStickiness}
          className="scroll-pane min-h-0 flex-1 px-4 py-5 sm:px-6"
        >
          {loading ? (
            <div className="flex h-full items-center justify-center text-ink/60">
              <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />
              Loading your agent workspace...
            </div>
          ) : visibleMessages.length ? (
            <div className={`mx-auto space-y-4 ${focusMode ? "max-w-5xl" : "max-w-4xl"}`}>
              {visibleMessages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </div>
          ) : (
            <div className="mx-auto max-w-5xl">
              <div className="surface-panel halo-panel rounded-[2.4rem] p-7">
                <div className="flex items-center gap-3">
                  <Sparkles className="h-6 w-6 text-signal" />
                  <p className="font-display text-2xl font-semibold text-ink">
                    Start with a real work goal
                  </p>
                </div>
                <p className="mt-3 max-w-2xl text-sm text-ink/60">
                  This agent can plan first, ask for approval on sensitive actions, summarize meetings,
                  inspect your machine, and coordinate Google workflows when connected.
                </p>
                <div className="mt-6 grid gap-3 lg:grid-cols-2">
                  {[
                    "Help me organize my work week and suggest a plan.",
                    "Summarize my meeting notes and prepare follow-up email points.",
                    "Search my machine for the latest PDF proposal in Downloads.",
                    "Plan a task workflow for calendar follow-ups and email outreach."
                  ].map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => setInput(prompt)}
                      className="surface-muted rounded-[1.6rem] px-4 py-4 text-left text-sm text-ink transition hover:-translate-y-0.5 hover:border-signal/35"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-ink/10 px-4 py-4 sm:px-6">
          <div className={`mx-auto ${focusMode ? "max-w-5xl" : "max-w-4xl"}`}>
            <div className="surface-muted rounded-[2rem] p-3">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !isComposingRef.current) {
                    event.preventDefault();
                    void handleSend();
                  }
                }}
                onCompositionStart={() => {
                  isComposingRef.current = true;
                }}
                onCompositionEnd={() => {
                  isComposingRef.current = false;
                }}
                placeholder="Ask the agent to plan work, inspect files, browse, summarize meetings, or coordinate tasks..."
                className="min-h-28 w-full resize-none bg-transparent p-3 text-base text-ink outline-none placeholder:text-ink/40"
              />
              <div className="flex flex-wrap items-center justify-between gap-3 px-3 pb-2">
                <div className="flex flex-wrap items-center gap-2 text-xs text-ink/45">
                  <span>
                    {activeRunId
                      ? "A run is active. Sensitive steps will still pause for approval."
                      : "Press Enter to send. Use Shift+Enter for a new line."}
                  </span>
                  {selectedMeetingContextId ? (
                    <span className="soft-chip rounded-full px-3 py-1 text-ink/60">
                      Meeting selected
                    </span>
                  ) : null}
                  {latestRun?.usage ? (
                    <span className="soft-chip rounded-full px-3 py-1 text-ink/60">
                      Last run {formatUsd(latestRun.usage.estimatedCostUsd)}
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={sending}
                  className="button-primary rounded-[1.15rem] px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sending ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <aside
        className={`fixed inset-y-3 right-3 z-30 w-[22rem] max-w-[calc(100vw-2.5rem)] transition xl:static xl:inset-auto xl:w-[22rem] xl:shrink-0 ${
          isUtilityDrawerOpen ? "translate-x-0" : "translate-x-[110%] xl:hidden"
        }`}
      >
        <div className="surface-panel flex h-full min-h-0 flex-col rounded-[2.2rem] p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="font-display text-xl font-semibold text-ink">Utility drawer</p>
              <p className="text-sm text-ink/55">Approvals, run usage, and tool activity.</p>
            </div>
            <button
              type="button"
              onClick={() => setIsUtilityDrawerOpen(false)}
              className="surface-muted inline-flex h-10 w-10 items-center justify-center rounded-[1.1rem] text-ink"
              title="Hide drawer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>

          <div className="scroll-pane min-h-0 flex-1 space-y-4 pr-1">
            <Panel title="Approvals" icon={<ShieldAlert className="h-5 w-5 text-ember" />}>
              {pendingApprovals.length ? (
                pendingApprovals.map((approval) => (
                  <div
                    key={approval.id}
                    className="rounded-[1.5rem] border border-ember/20 bg-[linear-gradient(180deg,rgba(217,119,6,0.08),rgba(255,255,255,0.84))] p-4"
                  >
                    <p className="wrap-anywhere font-medium text-ink">{approval.toolName}</p>
                    <p className="mt-1 text-sm text-ink/70">{approval.inputSummary}</p>
                    <p className="mt-2 text-xs text-ink/52">{approval.reason}</p>
                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        onClick={() => void handleApproval(approval.id, "approved")}
                        className="surface-elevated inline-flex items-center gap-2 rounded-2xl bg-signal px-3 py-2 text-sm text-white"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleApproval(approval.id, "denied")}
                        className="surface-muted inline-flex items-center gap-2 rounded-2xl border-red-200 px-3 py-2 text-sm text-red-600"
                      >
                        <XCircle className="h-4 w-4" />
                        Deny
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyPanelCopy text="No pending approvals. Sensitive tools will appear here before execution." />
              )}
            </Panel>

            <Panel title="Run insight" icon={<Sparkles className="h-5 w-5 text-signal" />}>
              {bundle?.runs.length ? (
                bundle.runs.slice(0, 4).map((run) => (
                  <div key={run.id} className="surface-muted rounded-[1.55rem] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-ink">{run.model}</p>
                      <span className="soft-chip rounded-full px-3 py-1 text-xs text-signal">
                        {run.status}
                      </span>
                    </div>
                    {run.plan ? (
                      <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm text-ink/65">
                        {run.plan}
                      </p>
                    ) : null}
                    {run.usage ? (
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-ink/55">
                        <span className="soft-chip rounded-full px-3 py-1">
                          {run.usage.totalTokens} tokens
                        </span>
                        <span className="soft-chip rounded-full px-3 py-1">
                          {formatUsd(run.usage.estimatedCostUsd)}
                        </span>
                      </div>
                    ) : null}
                    <p className="mt-3 text-xs text-ink/45">{formatTimestamp(run.updatedAt)}</p>
                  </div>
                ))
              ) : (
                <EmptyPanelCopy text="Run summaries and usage will appear here after the assistant starts working." />
              )}
            </Panel>

            <Panel title="Execution trace" icon={<Archive className="h-5 w-5 text-ink/65" />}>
              {bundle?.toolCalls.length ? (
                bundle.toolCalls.map((toolCall) => (
                  <div
                    key={toolCall.id}
                    className="surface-muted rounded-[1.55rem] p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="wrap-anywhere font-medium text-ink">{toolCall.toolName}</p>
                      <ToolCallBadge status={toolCall.status} />
                    </div>
                    <p className="mt-2 text-sm text-ink/68">{toolCall.summary}</p>
                    <p className="mt-2 text-xs text-ink/45">{formatTimestamp(toolCall.updatedAt)}</p>
                  </div>
                ))
              ) : (
                <EmptyPanelCopy text="Tool calls, statuses, and final outcomes will appear here." />
              )}
            </Panel>
          </div>
        </div>
      </aside>
    </div>
  );
};

const ToolbarButton = ({
  label,
  onClick,
  icon
}: {
  label: string;
  onClick: () => void;
  icon: ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    className="surface-muted inline-flex h-10 items-center justify-center rounded-[1.15rem] px-3 text-sm text-ink transition hover:border-signal/30 hover:text-signal"
    title={label}
  >
    {icon}
  </button>
);

const Panel = ({
  title,
  icon,
  children
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) => (
  <section className="surface-muted rounded-[1.8rem] p-4">
    <div className="mb-3 flex items-center gap-2">
      {icon}
      <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
    </div>
    <div className="space-y-3">{children}</div>
  </section>
);

const EmptyPanelCopy = ({ text }: { text: string }) => (
  <div className="surface-muted rounded-[1.4rem] border-dashed p-4 text-sm text-ink/55">
    {text}
  </div>
);

const RuntimePill = ({ label }: { label: string }) => (
  <span className="soft-chip rounded-full px-3 py-1 text-xs font-medium text-ink/65">
    {label}
  </span>
);

const StatusPill = ({ activeRunId }: { activeRunId: string | null }) => (
  <div
    className={`rounded-full px-4 py-2 text-sm font-medium ${
      activeRunId ? "soft-chip text-signal" : "surface-muted text-ink/60"
    }`}
  >
    {activeRunId ? "Run active" : "Ready"}
  </div>
);

const MessageBubble = ({ message }: { message: MessageRecord }) => {
  const isUser = message.role === "user";
  const isTool = message.role === "tool";
  const isPlan =
    message.role === "assistant" &&
    /^planned approach:|^\d+\./i.test(message.content.trim());

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`min-w-0 max-w-[min(100%,54rem)] rounded-[1.8rem] px-5 py-4 ${
          isUser
            ? "bg-ink text-white"
            : isTool
              ? "surface-muted text-ink"
              : isPlan
                ? "border border-signal/20 bg-[linear-gradient(180deg,rgba(17,121,111,0.08),rgba(255,255,255,0.9))] text-ink"
                : "surface-panel text-ink"
        }`}
      >
        <p className="mb-2 text-xs uppercase tracking-[0.2em] text-current/50">
          {isPlan ? "plan" : message.role}
        </p>
        <p className="wrap-anywhere whitespace-pre-wrap text-sm leading-7">
          {message.content}
        </p>
      </div>
    </div>
  );
};

const ToolCallBadge = ({ status }: { status: ToolCallRecord["status"] }) => {
  const styles: Record<ToolCallRecord["status"], string> = {
    pending_approval: "bg-amber-100 text-amber-700",
    approved: "bg-sky-100 text-sky-700",
    running: "bg-ink/10 text-ink",
    success: "bg-emerald-100 text-emerald-700",
    failed: "bg-red-100 text-red-700",
    denied: "bg-zinc-200 text-zinc-700"
  };

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  );
};

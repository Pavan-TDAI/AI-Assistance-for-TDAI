"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarRange,
  FileUp,
  LoaderCircle,
  Mail,
  Send,
  Sparkles
} from "lucide-react";

import type { MeetingRecord } from "@personal-ai/shared";

import { api, formatTimestamp } from "../lib/api";

const attendeeLines = (value: string) =>
  value
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);

const readStoredMeetingId = () => {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.localStorage.getItem("meetings.selectedId") ?? undefined;
};

export const MeetingStudio = () => {
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string>();
  const [calendarEvents, setCalendarEvents] = useState<Array<Record<string, unknown>>>([]);
  const [title, setTitle] = useState("");
  const [source, setSource] = useState<MeetingRecord["source"]>("notes_paste");
  const [transcript, setTranscript] = useState("");
  const [notes, setNotes] = useState("");
  const [attendees, setAttendees] = useState("");
  const [calendarEventId, setCalendarEventId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const selectedMeeting = useMemo(
    () => meetings.find((meeting) => meeting.id === selectedMeetingId) ?? null,
    [meetings, selectedMeetingId]
  );

  const load = async () => {
    const [nextMeetings, nextCalendar] = await Promise.all([
      api.listMeetings(),
      api.getMeetingCalendarEvents()
    ]);
    setMeetings(nextMeetings);
    setCalendarEvents(nextCalendar.events);
    if (!selectedMeetingId && nextMeetings[0]) {
      const storedMeetingId = readStoredMeetingId();
      const preferredMeeting = storedMeetingId
        ? nextMeetings.find((meeting) => meeting.id === storedMeetingId)
        : undefined;
      setSelectedMeetingId(preferredMeeting?.id ?? nextMeetings[0].id);
    }
  };

  useEffect(() => {
    void load()
      .catch((nextError) => {
        setError(nextError instanceof Error ? nextError.message : String(nextError));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedMeeting) {
      syncFromMeeting(selectedMeeting);
    }
  }, [selectedMeetingId, meetings.length]);

  useEffect(() => {
    if (typeof window === "undefined" || !selectedMeetingId) {
      return;
    }

    window.localStorage.setItem("meetings.selectedId", selectedMeetingId);
  }, [selectedMeetingId]);

  const syncFromMeeting = (meeting: MeetingRecord) => {
    setTitle(meeting.title);
    setSource(meeting.source);
    setTranscript(meeting.transcript);
    setNotes(meeting.notes ?? "");
    setAttendees(meeting.attendees.join("\n"));
    setCalendarEventId(meeting.calendarEventId ?? "");
  };

  const createDraft = async () => {
    setSaving(true);
    setError(null);
    setStatus(null);

    try {
      const meeting = await api.createMeeting({
        title: title || "Untitled meeting",
        source,
        transcript,
        notes,
        attendees: attendeeLines(attendees),
        calendarEventId: calendarEventId || undefined
      });
      await load();
      setSelectedMeetingId(meeting.id);
      setStatus("Meeting draft captured.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setSaving(false);
    }
  };

  const ensureMeeting = async () => {
    if (selectedMeeting) {
      return selectedMeeting.id;
    }

    const meeting = await api.createMeeting({
      title: title || "Untitled meeting",
      source,
      transcript,
      notes,
      attendees: attendeeLines(attendees),
      calendarEventId: calendarEventId || undefined
    });
    await load();
    setSelectedMeetingId(meeting.id);
    return meeting.id;
  };

  const generateMom = async () => {
    setSaving(true);
    setError(null);
    setStatus(null);

    try {
      const meetingId = await ensureMeeting();
      const updated = await api.generateMeeting(meetingId, {
        includeEmailDraft: true
      });
      await load();
      setSelectedMeetingId(updated.id);
      setStatus("MoM generated successfully.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setSaving(false);
    }
  };

  const draftEmail = async () => {
    if (!selectedMeeting) {
      return;
    }

    setSaving(true);
    setError(null);
    setStatus(null);

    try {
      const updated = await api.draftMeetingEmail(selectedMeeting.id, {
        to: attendeeLines(attendees)
      });
      await load();
      setSelectedMeetingId(updated.id);
      setStatus("Gmail draft created.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setSaving(false);
    }
  };

  const sendEmail = async () => {
    if (!selectedMeeting) {
      return;
    }

    const confirmed = window.confirm(
      "Send the meeting minutes email now? This is the explicit approval step."
    );
    if (!confirmed) {
      return;
    }

    setSaving(true);
    setError(null);
    setStatus(null);

    try {
      const updated = await api.sendMeetingEmail(selectedMeeting.id, {
        to: attendeeLines(attendees)
      });
      await load();
      setSelectedMeetingId(updated.id);
      setStatus("Meeting minutes email sent.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 xl:flex-row">
      <aside className="surface-panel min-h-[18rem] shrink-0 rounded-[2.2rem] p-4 xl:h-full xl:w-[20rem]">
        <div className="mb-4 flex items-center gap-2">
          <CalendarRange className="h-5 w-5 text-signal" />
          <h2 className="font-display text-xl font-semibold text-ink">Meetings</h2>
        </div>
        <div className="scroll-pane h-[18rem] space-y-3 pr-1 xl:h-[calc(100%-2rem)]">
          {meetings.length ? (
            meetings.map((meeting) => (
              <button
                key={meeting.id}
                type="button"
                onClick={() => {
                  setSelectedMeetingId(meeting.id);
                  syncFromMeeting(meeting);
                }}
                className={`w-full rounded-[1.7rem] p-4 text-left transition ${
                  meeting.id === selectedMeetingId
                    ? "surface-panel border-signal/35 bg-[linear-gradient(180deg,rgba(17,121,111,0.1),rgba(255,255,255,0.86))]"
                    : "surface-muted"
                }`}
              >
                <p className="font-medium text-ink">{meeting.title}</p>
                <p className="mt-1 line-clamp-2 text-sm text-ink/60">
                  {meeting.summary ?? meeting.notes ?? meeting.transcript}
                </p>
                <p className="mt-3 text-xs text-ink/45">{formatTimestamp(meeting.updatedAt)}</p>
              </button>
            ))
          ) : (
            <div className="surface-muted rounded-[1.6rem] border-dashed p-4 text-sm text-ink/55">
              No meetings yet. Paste notes or upload a transcript to get started.
            </div>
          )}
        </div>
      </aside>

      <section className="scroll-pane surface-panel min-h-0 flex-1 rounded-[2.2rem] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-display text-2xl font-semibold text-ink">Meeting studio</p>
            <p className="mt-1 max-w-3xl text-sm text-ink/60">
              Capture transcript or notes, generate structured minutes of meeting, then draft or send the follow-up email.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void createDraft()}
              className="surface-muted rounded-2xl px-4 py-2 text-sm text-ink"
            >
              Save draft
            </button>
            <button
              type="button"
              onClick={() => void generateMom()}
              className="surface-elevated inline-flex items-center gap-2 rounded-2xl bg-signal px-4 py-2 text-sm text-white"
            >
              {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Generate MoM
            </button>
          </div>
        </div>

        {status ? <p className="mt-4 text-sm text-signal">{status}</p> : null}
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

        {loading ? (
          <div className="mt-8 flex items-center gap-2 text-ink/60">
            <LoaderCircle className="h-5 w-5 animate-spin" />
            Loading meeting workspace...
          </div>
        ) : (
          <div className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-4">
              <Field label="Meeting title">
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="field"
                  placeholder="Weekly operations review"
                />
              </Field>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Source">
                  <select
                    value={source}
                    onChange={(event) =>
                      setSource(event.target.value as MeetingRecord["source"])
                    }
                    className="field"
                  >
                    <option value="notes_paste">notes_paste</option>
                    <option value="transcript_upload">transcript_upload</option>
                    <option value="calendar_enriched">calendar_enriched</option>
                  </select>
                </Field>

                <Field label="Calendar event">
                  <select
                    value={calendarEventId}
                    onChange={(event) => {
                      const eventId = event.target.value;
                      setCalendarEventId(eventId);
                      if (!eventId) {
                        return;
                      }

                      void api.getMeetingCalendarEventDetails(eventId).then((details) => {
                        setSource("calendar_enriched");
                        setTitle(String(details.summary ?? title));
                        const nextAttendees = Array.isArray(details.attendees)
                          ? details.attendees.map((entry) => String(entry)).join("\n")
                          : attendees;
                        setAttendees(nextAttendees);
                        setNotes((current) =>
                          current || String(details.description ?? "")
                        );
                      });
                    }}
                    className="field"
                  >
                    <option value="">Optional event enrichment</option>
                    {calendarEvents.map((event) => (
                      <option key={String(event.id)} value={String(event.id)}>
                        {String(event.summary ?? event.id)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Attendee emails">
                <textarea
                  value={attendees}
                  onChange={(event) => setAttendees(event.target.value)}
                  className="field min-h-28"
                  placeholder={"person@example.com\nanother@example.com"}
                />
              </Field>

              <Field label="Meeting notes">
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className="field min-h-40"
                  placeholder="Paste notes, action points, and context here."
                />
              </Field>

              <Field label="Transcript">
                <textarea
                  value={transcript}
                  onChange={(event) => setTranscript(event.target.value)}
                  className="field min-h-52"
                  placeholder="Paste meeting transcript or upload a text file below."
                />
              </Field>

              <label className="surface-muted inline-flex cursor-pointer items-center gap-2 rounded-2xl px-4 py-2 text-sm text-ink">
                <FileUp className="h-4 w-4" />
                Upload transcript
                <input
                  type="file"
                  accept=".txt,.md,.json"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) {
                      return;
                    }

                    void file.text().then((text) => {
                      setTranscript(text);
                      setSource("transcript_upload");
                    });
                  }}
                />
              </label>
            </div>

            <div className="space-y-4">
              <section className="surface-muted rounded-[1.9rem] p-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-display text-lg font-semibold text-ink">Generated MoM</h3>
                  {selectedMeeting ? (
                    <span className="soft-chip rounded-full px-3 py-1 text-xs text-ink/65">
                      {selectedMeeting.status}
                    </span>
                  ) : null}
                </div>

                {selectedMeeting?.summary ? (
                  <div className="mt-4 space-y-4">
                    {selectedMeeting.structuredMom ? (
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Structured MoM</p>
                        <div className="surface-panel mt-2 rounded-[1.5rem] p-4">
                          <p className="text-sm font-semibold text-ink">
                            Date: {selectedMeeting.structuredMom.dateLabel}
                          </p>
                          <p className="mt-3 text-xs uppercase tracking-[0.2em] text-signal">
                            {selectedMeeting.structuredMom.headline}
                          </p>
                          <div className="mt-4 space-y-3">
                            {selectedMeeting.structuredMom.assignments.map((assignment, index) => (
                              <div
                                key={`${assignment.owner}-${index}`}
                                className="rounded-[1.25rem] border border-ink/10 bg-white/72 px-4 py-3"
                              >
                                <p className="text-sm font-semibold text-ink">
                                  {assignment.owner}
                                </p>
                                <div className="mt-2 space-y-1 text-sm leading-6 text-ink/70">
                                  {assignment.tasks.map((task, taskIndex) => (
                                    <p key={`${assignment.owner}-${taskIndex}`}>Task: {task}</p>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : null}

                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Summary</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink/70">
                        {selectedMeeting.summary}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Decisions</p>
                      <ul className="mt-2 space-y-2 text-sm text-ink/70">
                        {selectedMeeting.decisions.map((decision, index) => (
                          <li
                            key={`${decision}-${index}`}
                            className="surface-panel rounded-[1.4rem] px-4 py-3"
                          >
                            {decision}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Action items</p>
                      <div className="mt-2 space-y-2">
                        {selectedMeeting.actionItems.map((item, index) => (
                          <div
                            key={`${item.title}-${index}`}
                            className="surface-panel rounded-[1.4rem] px-4 py-3 text-sm text-ink/70"
                          >
                            <p className="font-medium text-ink">{item.title}</p>
                            <p className="mt-1 text-xs text-ink/50">
                              {item.owner ? `Owner: ${item.owner}` : "Owner TBD"}
                              {item.dueDate ? ` | Due: ${item.dueDate}` : ""}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="surface-panel mt-4 rounded-[1.5rem] border-dashed p-4 text-sm text-ink/55">
                    No generated minutes yet. Save or generate a meeting draft first.
                  </div>
                )}
              </section>

              <section className="surface-muted rounded-[1.9rem] p-5">
                <div className="flex items-center gap-2">
                  <Mail className="h-5 w-5 text-ember" />
                  <h3 className="font-display text-lg font-semibold text-ink">Follow-up email</h3>
                </div>

                {selectedMeeting?.followUpEmail ? (
                  <div className="mt-4 space-y-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Subject</p>
                      <p className="mt-2 text-sm text-ink/70">
                        {selectedMeeting.followUpEmail.subject}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Body</p>
                      <pre className="surface-panel mt-2 whitespace-pre-wrap rounded-[1.5rem] p-4 text-sm text-ink/70">
                        {selectedMeeting.followUpEmail.body}
                      </pre>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void draftEmail()}
                        className="surface-panel rounded-2xl px-4 py-2 text-sm text-ink"
                      >
                        Create Gmail draft
                      </button>
                      <button
                        type="button"
                        onClick={() => void sendEmail()}
                        className="surface-elevated inline-flex items-center gap-2 rounded-2xl bg-ink px-4 py-2 text-sm text-white"
                      >
                        <Send className="h-4 w-4" />
                        Send email
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="surface-panel mt-4 rounded-[1.5rem] border-dashed p-4 text-sm text-ink/55">
                    Generate minutes first to create the follow-up email draft.
                  </div>
                )}
              </section>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

const Field = ({
  label,
  children
}: {
  label: string;
  children: ReactNode;
}) => (
  <label className="block">
    <span className="mb-2 block text-sm font-medium text-ink/70">{label}</span>
    {children}
  </label>
);

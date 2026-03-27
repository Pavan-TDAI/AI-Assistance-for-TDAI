import type {
  ApprovalDecision,
  ApprovalRecord,
  AuthResponse,
  AuthUser,
  ConnectorStatusRecord,
  CreateMeetingRequest,
  DraftMeetingEmailRequest,
  GenerateMeetingMomRequest,
  GoogleWorkspaceConnectorSecret,
  Microsoft365ConnectorSecret,
  HealthResponse,
  HistorySnapshot,
  LoginRequest,
  MeetingRecord,
  PromptRequest,
  PromptResponse,
  RegisterRequest,
  RunEvent,
  SessionBundle,
  SessionWithPreview,
  SettingsRecord,
  SettingsUpdate
} from "@personal-ai/shared";

import { clearStoredAccessToken, getStoredAccessToken } from "./auth-storage";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

const withAuthHeaders = (headers?: HeadersInit) => {
  const token = getStoredAccessToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(headers ?? {})
  };
};

const fetchJson = async <T>(input: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${input}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...withAuthHeaders(init?.headers)
    },
    cache: "no-store"
  });

  if (response.status === 401) {
    clearStoredAccessToken();
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Request failed with status ${response.status}.`);
  }

  return (await response.json()) as T;
};

const querySessions = (options?: { includeArchived?: boolean; archivedOnly?: boolean }) => {
  const params = new URLSearchParams();
  if (options?.includeArchived) {
    params.set("includeArchived", "true");
  }
  if (options?.archivedOnly) {
    params.set("archivedOnly", "true");
  }
  const query = params.toString();
  return `/api/sessions${query ? `?${query}` : ""}`;
};

export const api = {
  register: (payload: RegisterRequest) =>
    fetchJson<AuthResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  login: (payload: LoginRequest) =>
    fetchJson<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  getCurrentUser: () => fetchJson<{ user: AuthUser }>("/api/auth/me"),
  logout: async () => {
    const response = await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: "POST",
      headers: withAuthHeaders()
    });

    if (response.status === 401) {
      clearStoredAccessToken();
      return;
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? `Logout failed with status ${response.status}.`);
    }
  },
  getSessions: (options?: { includeArchived?: boolean; archivedOnly?: boolean }) =>
    fetchJson<SessionWithPreview[]>(querySessions(options)),
  getSession: (sessionId: string) => fetchJson<SessionBundle>(`/api/sessions/${sessionId}`),
  archiveSession: (sessionId: string) =>
    fetchJson(`/api/sessions/${sessionId}/archive`, {
      method: "POST"
    }),
  restoreSession: (sessionId: string) =>
    fetchJson(`/api/sessions/${sessionId}/restore`, {
      method: "POST"
    }),
  deleteSession: async (sessionId: string) => {
    const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}`, {
      method: "DELETE",
      headers: withAuthHeaders()
    });

    if (response.status === 401) {
      clearStoredAccessToken();
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? `Delete failed with status ${response.status}.`);
    }
  },
  sendPrompt: (payload: PromptRequest) =>
    fetchJson<PromptResponse>("/api/chat/send", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  getPendingApprovals: () => fetchJson<ApprovalRecord[]>("/api/approvals"),
  decideApproval: (approvalId: string, payload: ApprovalDecision) =>
    fetchJson<ApprovalRecord>(`/api/approvals/${approvalId}/decision`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  getHistory: () => fetchJson<HistorySnapshot>("/api/history"),
  getSettings: () => fetchJson<SettingsRecord>("/api/settings"),
  updateSettings: (payload: SettingsUpdate) =>
    fetchJson<SettingsRecord>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(payload)
    }),
  getTools: () =>
    fetchJson<
      Array<{
        name: string;
        description: string;
        permissionCategory: string;
        safeByDefault: boolean;
        timeoutMs: number;
      }>
    >("/api/tools"),
  getConnectors: () => fetchJson<ConnectorStatusRecord[]>("/api/connectors"),
  saveGoogleWorkspaceConnector: (payload: GoogleWorkspaceConnectorSecret) =>
    fetchJson<ConnectorStatusRecord[]>("/api/connectors/google-workspace", {
      method: "PUT",
      body: JSON.stringify(payload)
    }),
  removeGoogleWorkspaceConnector: () =>
    fetchJson<ConnectorStatusRecord[]>("/api/connectors/google-workspace", {
      method: "DELETE"
    }),
  saveMicrosoft365Connector: (payload: Microsoft365ConnectorSecret) =>
    fetchJson<ConnectorStatusRecord[]>("/api/connectors/microsoft-365", {
      method: "PUT",
      body: JSON.stringify(payload)
    }),
  removeMicrosoft365Connector: () =>
    fetchJson<ConnectorStatusRecord[]>("/api/connectors/microsoft-365", {
      method: "DELETE"
    }),
  listMeetings: () => fetchJson<MeetingRecord[]>("/api/meetings"),
  createMeeting: (payload: CreateMeetingRequest) =>
    fetchJson<MeetingRecord>("/api/meetings", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  getMeeting: (meetingId: string) => fetchJson<MeetingRecord>(`/api/meetings/${meetingId}`),
  generateMeeting: (
    meetingId: string,
    payload: Partial<GenerateMeetingMomRequest> = {}
  ) =>
    fetchJson<MeetingRecord>(`/api/meetings/${meetingId}/generate`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  draftMeetingEmail: (meetingId: string, payload: DraftMeetingEmailRequest = {}) =>
    fetchJson<MeetingRecord>(`/api/meetings/${meetingId}/draft-email`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  sendMeetingEmail: (
    meetingId: string,
    payload: DraftMeetingEmailRequest = {}
  ) =>
    fetchJson<MeetingRecord>(`/api/meetings/${meetingId}/send-email`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  getMeetingCalendarEvents: () =>
    fetchJson<{ events: Array<Record<string, unknown>> }>("/api/meetings/calendar-events"),
  getMeetingCalendarEventDetails: (eventId: string) =>
    fetchJson<Record<string, unknown>>(`/api/meetings/calendar-events/${eventId}`),
  getHealth: () => fetchJson<HealthResponse>("/health"),
  subscribeToRun: (
    runId: string,
    handlers: {
      onEvent: (event: RunEvent) => void;
      onError?: (error: Event) => void;
    }
  ) => {
    const token = getStoredAccessToken();
    const source = new EventSource(
      `${API_BASE_URL}/api/runs/${runId}/stream${
        token ? `?accessToken=${encodeURIComponent(token)}` : ""
      }`
    );
    source.onmessage = (message) => {
      handlers.onEvent(JSON.parse(message.data) as RunEvent);
    };
    source.onerror = (error) => {
      handlers.onError?.(error);
    };

    return source;
  }
};

export const formatTimestamp = (value?: string) => {
  if (!value) {
    return "Now";
  }

  return new Date(value).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short"
  });
};

export const formatUsd = (value = 0) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value < 1 ? 3 : 2
  }).format(value);

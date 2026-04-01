const AUTH_TOKEN_KEY = "tdai_access_token";
const AUTH_EXPIRES_AT_KEY = "tdai_access_token_expires_at";
const AUTH_LAST_ACTIVITY_KEY = "tdai_access_token_last_activity";
const AUTH_CHANGE_EVENT = "tdai-auth-changed";
const CLIENT_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const CLIENT_IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000;

const readSessionStorage = () => {
  if (typeof window === "undefined") {
    return null;
  }

  return window.sessionStorage;
};

const hasExpired = (expiresAt: string | null, lastActivity: string | null) => {
  const now = Date.now();
  const expiryTime = expiresAt ? Number(expiresAt) : 0;
  const activityTime = lastActivity ? Number(lastActivity) : 0;

  return !expiryTime || !activityTime || now >= expiryTime || now - activityTime >= CLIENT_IDLE_TIMEOUT_MS;
};

const emitAuthChange = () => {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
};

export const getStoredAccessToken = () => {
  const storage = readSessionStorage();
  if (!storage) {
    return null;
  }

  const token = storage.getItem(AUTH_TOKEN_KEY);
  if (!token) {
    return null;
  }

  const expiresAt = storage.getItem(AUTH_EXPIRES_AT_KEY);
  const lastActivity = storage.getItem(AUTH_LAST_ACTIVITY_KEY);
  if (hasExpired(expiresAt, lastActivity)) {
    clearStoredAccessToken();
    return null;
  }

  return token;
};

export const setStoredAccessToken = (token: string) => {
  const storage = readSessionStorage();
  if (!storage) {
    return;
  }

  const now = Date.now().toString();
  storage.setItem(AUTH_TOKEN_KEY, token);
  storage.setItem(AUTH_EXPIRES_AT_KEY, String(Date.now() + CLIENT_SESSION_TTL_MS));
  storage.setItem(AUTH_LAST_ACTIVITY_KEY, now);
  emitAuthChange();
};

export const clearStoredAccessToken = () => {
  const storage = readSessionStorage();
  if (!storage) {
    return;
  }

  storage.removeItem(AUTH_TOKEN_KEY);
  storage.removeItem(AUTH_EXPIRES_AT_KEY);
  storage.removeItem(AUTH_LAST_ACTIVITY_KEY);
  emitAuthChange();
};

export const touchStoredAccessTokenSession = () => {
  const storage = readSessionStorage();
  if (!storage || !storage.getItem(AUTH_TOKEN_KEY)) {
    return false;
  }

  const expiresAt = storage.getItem(AUTH_EXPIRES_AT_KEY);
  const lastActivity = storage.getItem(AUTH_LAST_ACTIVITY_KEY);
  if (hasExpired(expiresAt, lastActivity)) {
    clearStoredAccessToken();
    return false;
  }

  storage.setItem(AUTH_LAST_ACTIVITY_KEY, String(Date.now()));
  return true;
};

export const subscribeToAuthStorage = (listener: () => void) => {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleStorage = (event: StorageEvent) => {
    if (
      event.key === AUTH_TOKEN_KEY ||
      event.key === AUTH_EXPIRES_AT_KEY ||
      event.key === AUTH_LAST_ACTIVITY_KEY
    ) {
      listener();
    }
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(AUTH_CHANGE_EVENT, listener);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(AUTH_CHANGE_EVENT, listener);
  };
};

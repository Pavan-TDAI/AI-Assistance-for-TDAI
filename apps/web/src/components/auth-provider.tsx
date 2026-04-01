"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";

import type { AuthUser, LoginRequest, RegisterRequest } from "@personal-ai/shared";

import { api } from "../lib/api";
import {
  clearStoredAccessToken,
  getStoredAccessToken,
  setStoredAccessToken,
  subscribeToAuthStorage,
  touchStoredAccessTokenSession
} from "../lib/auth-storage";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (payload: LoginRequest) => Promise<AuthUser>;
  register: (payload: RegisterRequest) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = async () => {
    const token = getStoredAccessToken();
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const response = await api.getCurrentUser();
      setUser(response.user);
    } catch {
      clearStoredAccessToken();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refresh();

    return subscribeToAuthStorage(() => {
      setIsLoading(true);
      void refresh();
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleActivity = () => {
      touchStoredAccessTokenSession();
    };

    const validateSession = () => {
      const token = getStoredAccessToken();
      if (!token) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      void refresh();
    };

    const interval = window.setInterval(validateSession, 60_000);
    const activityEvents: Array<keyof WindowEventMap> = [
      "click",
      "keydown",
      "mousemove",
      "touchstart"
    ];

    for (const eventName of activityEvents) {
      window.addEventListener(eventName, handleActivity, { passive: true });
    }

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        validateSession();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(interval);
      for (const eventName of activityEvents) {
        window.removeEventListener(eventName, handleActivity);
      }
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      login: async (payload) => {
        const response = await api.login(payload);
        setStoredAccessToken(response.accessToken);
        setUser(response.user);
        setIsLoading(false);
        return response.user;
      },
      register: async (payload) => {
        const response = await api.register(payload);
        setStoredAccessToken(response.accessToken);
        setUser(response.user);
        setIsLoading(false);
        return response.user;
      },
      logout: async () => {
        try {
          await api.logout();
        } finally {
          clearStoredAccessToken();
          setUser(null);
          setIsLoading(false);
        }
      },
      refresh
    }),
    [isLoading, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }

  return context;
};

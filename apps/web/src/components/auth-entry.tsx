"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Bot, LoaderCircle, LockKeyhole, Sparkles } from "lucide-react";

import { userRoleValues, type UserRole } from "@personal-ai/shared/src/contracts.js";

import { useAuth } from "./auth-provider";

export function AuthEntry({
  mode
}: {
  mode: "login" | "signup";
}) {
  const isLogin = mode === "login";
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading, login, register } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("employee");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasCompletedSubmit, setHasCompletedSubmit] = useState(false);

  const nextPath = searchParams.get("next");
  const setupPath = `/settings?setup=account${
    nextPath ? `&next=${encodeURIComponent(nextPath)}` : ""
  }`;

  useEffect(() => {
    if (isLoading || !user || hasCompletedSubmit) {
      return;
    }

    router.replace(nextPath ?? "/chat");
  }, [hasCompletedSubmit, isLoading, nextPath, router, user]);

  const highlights = isLogin
    ? [
        "Continue from your workspace, meetings, and archived session history.",
        "Review approvals and execution trace before any sensitive action runs.",
        "Keep planning, follow-ups, and local context in one visible flow."
      ]
    : [
        "Create a stored local account in MongoDB and sign in with the same credentials later.",
        "Keep the product ready for real auth flows instead of a demo-only UI shell.",
        "Move straight into setup so runtime keys and connector secrets can be configured."
      ];

  const handleSubmit = async () => {
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      if (isLogin) {
        await login({
          email,
          password,
          role
        });
      } else {
        await register({
          displayName,
          email,
          password,
          role
        });
      }

      setHasCompletedSubmit(true);
      router.replace(setupPath);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-full overflow-hidden px-4 py-4 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(circle_at_top,rgba(15,118,110,0.2),transparent_48%)]" />
      <div className="pointer-events-none absolute left-0 top-32 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(17,121,111,0.14),transparent_65%)] blur-3xl" />

      <div className="relative flex min-h-full w-full flex-col gap-10">
        <header className="surface-panel rounded-[2.2rem] px-5 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <Link href="/" className="flex items-center gap-3">
              <div className="surface-elevated flex h-12 w-12 items-center justify-center rounded-[1.3rem] bg-ink text-white shadow-sm">
                <Bot className="h-6 w-6" />
              </div>
              <div>
                <p className="font-display text-lg font-semibold text-ink">TDAI Work Intelligence</p>
                <p className="text-sm text-ink/55">Local-first AI for operational workflows</p>
              </div>
            </Link>

            <div className="flex flex-wrap items-center gap-3">
              <Link href="/" className="button-secondary px-4 py-2 text-sm font-medium">
                Home
              </Link>
              <Link
                href={isLogin ? "/signup" : "/login"}
                className="button-primary px-4 py-2 text-sm font-medium"
              >
                {isLogin ? "Sign up" : "Login"}
              </Link>
            </div>
          </div>
        </header>

        <div className="grid flex-1 gap-10 pb-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <section className="max-w-4xl py-4">
            <div className="soft-chip inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-signal">
              <Sparkles className="h-4 w-4" />
              {isLogin ? "Return to your workspace" : "Create your local account"}
            </div>

            <h1 className="font-display mt-6 text-4xl font-semibold leading-[1.04] text-ink sm:text-5xl lg:text-[4.8rem]">
              {isLogin
                ? "Sign in and move straight back into your work assistant."
                : "Register once, store the user in MongoDB, and sign in with the same credentials later."}
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-ink/66 sm:text-lg">
              {isLogin
                ? "This login now verifies your email and password against the local database before opening the protected workspace."
                : "This signup now creates a stored local account. After access is created, we send you into setup so API keys and Google connector secrets can be configured safely."}
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {highlights.map((item, index) => (
                <div
                  key={item}
                  className={`pb-4 ${index < highlights.length - 1 ? "border-b border-white/45 sm:border-b-0 sm:border-r sm:pr-4" : ""}`}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-signal">
                    {`0${index + 1}`}
                  </p>
                  <p className="mt-3 text-sm leading-7 text-ink/64">{item}</p>
                </div>
              ))}
            </div>

            <div className="story-divider mt-10" />

            <div className="mt-8 max-w-3xl space-y-4">
              <FeatureLine text="Protected routes now depend on an authenticated local session, not just a demo form." />
              <FeatureLine text="Sessions and history are resolved using the signed-in profile instead of the shared default profile." />
              <FeatureLine text="After auth, the setup screen guides connector secrets, provider selection, and local runtime readiness." />
            </div>
          </section>

          <section className="surface-panel halo-panel rounded-[3rem] p-6 sm:p-8 lg:p-10">
            <div className="flex items-center gap-3">
              <div className="surface-elevated flex h-12 w-12 items-center justify-center rounded-[1.2rem] bg-ink text-white">
                <LockKeyhole className="h-5 w-5" />
              </div>
              <div>
                <p className="font-display text-2xl font-semibold text-ink">
                  {isLogin ? "Login" : "Sign up"}
                </p>
                <p className="text-sm text-ink/56">
                  Credentials are verified against the local database before the protected workspace opens.
                </p>
              </div>
            </div>

            <div className="mt-8 space-y-4">
              {!isLogin ? (
                <input
                  className="field"
                  placeholder="Full name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              ) : null}
              <input
                className="field"
                placeholder="Work email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <input
                className="field"
                placeholder="Password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <select
                className="field"
                value={role}
                onChange={(event) => setRole(event.target.value as UserRole)}
              >
                {userRoleValues.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </select>
            </div>

            <div className="surface-muted mt-6 rounded-[1.7rem] border-dashed p-4 text-sm leading-7 text-ink/62">
              {isLogin
                ? "After login, we will open the role-specific workspace. Sessions now expire automatically after inactivity and do not persist across browser restarts."
                : "After signup, we send the user to setup first so the account can be connected to provider and OAuth configuration."}
            </div>

            {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

            <div className="mt-7 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={
                  submitting ||
                  isLoading ||
                  !email.trim() ||
                  !password.trim() ||
                  (!isLogin && !displayName.trim())
                }
                className="button-primary text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                {isLogin ? "Login and continue" : "Create account"}
                <ArrowRight className="h-4 w-4" />
              </button>
              <Link href="/" className="button-secondary text-sm font-semibold">
                Back to home
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

const FeatureLine = ({ text }: { text: string }) => (
  <div className="flex items-start gap-3">
    <div className="mt-2 h-2.5 w-2.5 rounded-full bg-signal" />
    <p className="text-sm leading-7 text-ink/64">{text}</p>
  </div>
);

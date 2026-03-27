"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bot,
  CalendarRange,
  Clock3,
  Home,
  LogOut,
  MessageSquare,
  Settings2
} from "lucide-react";

import { useAuth } from "./auth-provider";

export const AppShell = ({ children }: { children: ReactNode }) => {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading, logout } = useAuth();
  const isMarketingRoute =
    pathname === "/" || pathname === "/login" || pathname === "/signup";
  const userInitials =
    user?.displayName
      ?.split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "AI";
  const compactName = user?.displayName?.split(/\s+/)[0] || user?.displayName || "Account";

  useEffect(() => {
    if (isMarketingRoute || isLoading || user) {
      return;
    }

    router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [isLoading, isMarketingRoute, pathname, router, user]);

  if (isMarketingRoute) {
    return <div className="h-[100dvh] overflow-y-auto">{children}</div>;
  }

  if (isLoading || !user) {
    return (
      <div className="flex h-[100dvh] items-center justify-center px-6">
        <div className="surface-panel max-w-md rounded-[2rem] px-6 py-8 text-center">
          <div className="surface-elevated mx-auto flex h-14 w-14 items-center justify-center rounded-[1.45rem] bg-ink text-white">
            <Bot className="h-6 w-6" />
          </div>
          <p className="font-display mt-5 text-2xl font-semibold text-ink">Preparing your workspace</p>
          <p className="mt-2 text-sm leading-7 text-ink/62">
            Checking your local session and reconnecting the product safely.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] w-full gap-4 overflow-hidden px-4 py-4">
      <aside className="shell-rail flex h-full w-[5rem] shrink-0 flex-col justify-between rounded-[2.25rem] p-3">
        <div className="space-y-4">
          <div className="surface-elevated flex h-14 w-14 items-center justify-center rounded-[1.45rem] bg-ink text-white">
            <Bot className="h-7 w-7" />
          </div>
          <nav className="space-y-3">
            <NavLink href="/" pathname={pathname} icon={<Home className="h-5 w-5" />} label="Home" />
            <NavLink
              href="/chat"
              pathname={pathname}
              icon={<MessageSquare className="h-5 w-5" />}
              label="Chat"
            />
            <NavLink
              href="/meetings"
              pathname={pathname}
              icon={<CalendarRange className="h-5 w-5" />}
              label="Meetings"
            />
            <NavLink
              href="/history"
              pathname={pathname}
              icon={<Clock3 className="h-5 w-5" />}
              label="History"
            />
            <NavLink
              href="/settings"
              pathname={pathname}
              icon={<Settings2 className="h-5 w-5" />}
              label="Settings"
            />
          </nav>
        </div>
        <div className="space-y-3">
          <div className="surface-muted min-w-0 rounded-[1.5rem] px-2 py-3 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">
              {userInitials}
            </div>
            <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.18em] text-ink/45">
              Signed in
            </p>
            <p
              className="mt-1 break-words text-[11px] font-semibold leading-4 text-ink"
              title={user.displayName}
            >
              {compactName}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void logout().then(() => router.replace("/login"))}
            className="nav-button flex h-12 w-full items-center justify-center rounded-[1.3rem]"
            title="Logout"
            aria-label="Logout"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>
      <main className="shell-main min-h-0 min-w-0 flex-1 overflow-hidden rounded-[2.25rem] p-2">
        {children}
      </main>
    </div>
  );
};

const NavLink = ({
  href,
  pathname,
  icon,
  label
}: {
  href: string;
  pathname: string;
  icon: ReactNode;
  label: string;
}) => (
  <LinkWrapper href={href} pathname={pathname} icon={icon} label={label} />
);

const LinkWrapper = ({
  href,
  pathname,
  icon,
  label
}: {
  href: string;
  pathname: string;
  icon: ReactNode;
  label: string;
}) => {
  const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={`nav-button flex h-14 items-center justify-center rounded-[1.45rem] ${
        isActive ? "nav-button-active" : ""
      }`}
      title={label}
      aria-label={label}
    >
      {icon}
    </Link>
  );
};

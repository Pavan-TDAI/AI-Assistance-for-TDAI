import type { ReactNode } from "react";
import type { Metadata } from "next";

import { AppShell } from "../components/app-shell";
import { AuthProvider } from "../components/auth-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "TDAI Work Intelligence",
  description:
    "A local-first AI work assistant for planning, meetings, approvals, and connected operational workflows."
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}

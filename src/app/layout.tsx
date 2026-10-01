import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { getCurrentUser } from "@/auth/session";
import { AppShell } from "@/components/app-shell";
import { readFlashError } from "@/lib/flash";
import { unreadNotificationCount } from "@/notifications/queries";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Tasker",
    template: "%s · Tasker",
  },
  description: "Zadania, terminy i odpowiedzialność w jednym miejscu.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#173f35",
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const user = await getCurrentUser();
  const [unreadNotifications, flashError] = user
    ? await Promise.all([unreadNotificationCount(user.id), readFlashError()])
    : [0, null];
  return (
    <html lang="pl">
      <body>
        {user ? <AppShell flashError={flashError} unreadNotifications={unreadNotifications} user={user}>{children}</AppShell> : children}
      </body>
    </html>
  );
}

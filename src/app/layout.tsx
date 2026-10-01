import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { getCurrentUser } from "@/auth/session";
import { AppShell } from "@/components/app-shell";
import { getNavigationCounts } from "@/navigation/queries";
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
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#173f35",
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const user = await getCurrentUser();
  let content = children;
  if (user) {
    const [unreadNotifications, navigationCounts, flashError] = await Promise.all([
      unreadNotificationCount(user.id),
      getNavigationCounts(user),
      readFlashError(),
    ]);
    content = (
      <AppShell flashError={flashError} navigationCounts={navigationCounts} unreadNotifications={unreadNotifications} user={user}>
        {children}
      </AppShell>
    );
  }

  return (
    <html lang="pl">
      <body>{content}</body>
    </html>
  );
}

import { and, count, desc, eq, isNull } from "drizzle-orm";

import { getDatabaseClient } from "@/db/client";
import { notifications } from "@/db/schema";

export async function unreadNotificationCount(userId: string) {
  const { db } = getDatabaseClient();
  const [row] = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.value ?? 0;
}

export async function listNotifications(userId: string, limit = 100) {
  const { db } = getDatabaseClient();
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

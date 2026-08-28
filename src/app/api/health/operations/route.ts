import { and, count, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDatabaseClient } from "@/db/client";
import { notificationDeliveries, reminders, workerHeartbeats } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { db } = getDatabaseClient();
    const [[worker], [failedReminders], [failedDeliveries]] = await Promise.all([
      db
        .select({
          healthy: sql<boolean>`${workerHeartbeats.lastSeenAt} > now() - interval '3 minutes'`,
          lastSeenAt: workerHeartbeats.lastSeenAt,
        })
        .from(workerHeartbeats)
        .where(eq(workerHeartbeats.service, "reminder-worker"))
        .limit(1),
      db
        .select({ value: count() })
        .from(reminders)
        .where(
          and(
            eq(reminders.status, "FAILED"),
            sql`${reminders.updatedAt} >= now() - interval '24 hours'`,
          ),
        ),
      db
        .select({ value: count() })
        .from(notificationDeliveries)
        .where(
          and(
            eq(notificationDeliveries.status, "FAILED"),
            sql`${notificationDeliveries.updatedAt} >= now() - interval '24 hours'`,
          ),
        ),
    ]);

    const failedReminderCount = failedReminders?.value ?? 0;
    const failedDeliveryCount = failedDeliveries?.value ?? 0;
    const operational = Boolean(worker?.healthy) && failedReminderCount === 0 && failedDeliveryCount === 0;
    return NextResponse.json(
      {
        status: operational ? "operational" : "degraded",
        database: "ok",
        worker: worker?.healthy ? "ok" : "stale",
        workerLastSeenAt: worker?.lastSeenAt?.toISOString() ?? null,
        failedReminders24h: failedReminderCount,
        failedDeliveries24h: failedDeliveryCount,
      },
      { status: operational ? 200 : 503 },
    );
  } catch (error) {
    console.error("Operations health check failed", error);
    return NextResponse.json(
      { status: "unavailable", database: "error", worker: "unknown" },
      { status: 503 },
    );
  }
}

import { and, count, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDatabaseClient } from "@/db/client";
import { notificationDeliveries, reminders, workerHeartbeats } from "@/db/schema";

export const dynamic = "force-dynamic";

/**
 * Failed deliveries tolerated within 24 hours before the system is reported as degraded. Single
 * failures (a flaky push endpoint) are normal; a burst means a channel is broken.
 */
const DELIVERY_FAILURE_THRESHOLD_24H = 3;

export async function GET() {
  try {
    const { db } = getDatabaseClient();
    const [[worker], [failedReminders], [failedDeliveries]] = await Promise.all([
      db
        .select({
          fresh: sql<boolean>`${workerHeartbeats.lastSeenAt} > now() - interval '3 minutes'`,
          status: workerHeartbeats.status,
          lastSeenAt: workerHeartbeats.lastSeenAt,
        })
        .from(workerHeartbeats)
        .where(eq(workerHeartbeats.service, "reminder-worker"))
        .limit(1),
      db
        .select({ value: count() })
        .from(reminders)
        .where(and(eq(reminders.status, "FAILED"), sql`${reminders.updatedAt} >= now() - interval '24 hours'`)),
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

    const workerState = !worker?.fresh ? "stale" : worker.status === "HEALTHY" ? "ok" : "degraded";
    const failedReminderCount = failedReminders?.value ?? 0;
    const failedDeliveryCount = failedDeliveries?.value ?? 0;
    const operational =
      workerState === "ok" && failedReminderCount === 0 && failedDeliveryCount < DELIVERY_FAILURE_THRESHOLD_24H;
    return NextResponse.json(
      {
        status: operational ? "operational" : "degraded",
        database: "ok",
        worker: workerState,
        workerLastSeenAt: worker?.lastSeenAt?.toISOString() ?? null,
        failedReminders24h: failedReminderCount,
        failedDeliveries24h: failedDeliveryCount,
        deliveryFailureThreshold24h: DELIVERY_FAILURE_THRESHOLD_24H,
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

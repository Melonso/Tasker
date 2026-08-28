import { NextResponse } from "next/server";

import { requireUser } from "@/auth/session";
import { getDatabaseClient } from "@/db/client";
import { notificationDeliveries, notifications, pushSubscriptions } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST() {
  const user = await requireUser();
  const { db } = getDatabaseClient();
  const [subscription] = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, user.id))
    .limit(1);
  if (!subscription) return NextResponse.json({ error: "PUSH_NOT_CONNECTED" }, { status: 409 });

  await db.transaction(async (tx) => {
    const [notification] = await tx
      .insert(notifications)
      .values({
        userId: user.id,
        title: "Tasker działa w tle",
        body: "To testowe powiadomienie Web Push. Kliknij, aby otworzyć centrum powiadomień.",
      })
      .returning({ id: notifications.id });
    if (!notification) throw new Error("Nie udało się utworzyć testowego powiadomienia.");
    await tx.insert(notificationDeliveries).values([
      {
        notificationId: notification.id,
        channel: "IN_APP",
        status: "SENT",
        attemptCount: 1,
        sentAt: new Date(),
        idempotencyKey: `push-test:${notification.id}:IN_APP`,
      },
      {
        notificationId: notification.id,
        channel: "WEB_PUSH",
        status: "PENDING",
        idempotencyKey: `push-test:${notification.id}:WEB_PUSH`,
      },
    ]);
  });
  return NextResponse.json({ status: "QUEUED" }, { status: 202 });
}

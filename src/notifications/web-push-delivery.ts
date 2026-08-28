import { eq, inArray, sql } from "drizzle-orm";
import webPush from "web-push";

import { getDatabaseClient } from "@/db/client";
import { notificationDeliveries, notifications, pushSubscriptions } from "@/db/schema";
import { getServerEnv } from "@/lib/env";

const MAX_DELIVERY_ATTEMPTS = 5;

interface ClaimedPushDelivery {
  id: string;
  notificationId: string;
  attemptCount: number;
}

function pushError(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 2_000);
  return "Nieznany błąd Web Push";
}

function pushStatusCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) return null;
  return Number((error as { statusCode?: unknown }).statusCode);
}

async function claimPushDeliveries(limit: number) {
  const { db } = getDatabaseClient();
  return db.transaction(async (tx) => {
    await tx.execute(sql`
      update notification_deliveries
      set status = 'FAILED',
          last_error = coalesce(last_error, 'Przekroczono limit prób Web Push.'),
          updated_at = now()
      where channel = 'WEB_PUSH'
        and status = 'PENDING'
        and attempt_count >= ${MAX_DELIVERY_ATTEMPTS}
        and updated_at <= now() - interval '5 minutes'
    `);
    const rows = await tx.execute(sql`
      select delivery.id, delivery.notification_id, delivery.attempt_count
      from notification_deliveries as delivery
      where delivery.channel = 'WEB_PUSH'
        and delivery.status in ('PENDING', 'FAILED')
        and delivery.attempt_count < ${MAX_DELIVERY_ATTEMPTS}
        and (
          delivery.attempt_count = 0
          or delivery.updated_at <= now() - make_interval(
            secs => least(300, 30 * power(2, greatest(delivery.attempt_count - 1, 0)))::int
          )
        )
      order by delivery.created_at asc
      for update skip locked
      limit ${Math.min(Math.max(limit, 1), 50)}
    `);
    const ids = rows.map((row) => String(row.id));
    if (ids.length) {
      await tx
        .update(notificationDeliveries)
        .set({
          status: "PENDING",
          attemptCount: sql`${notificationDeliveries.attemptCount} + 1`,
          updatedAt: new Date(),
        })
        .where(inArray(notificationDeliveries.id, ids));
    }
    return rows.map((row) => ({
      id: String(row.id),
      notificationId: String(row.notification_id),
      attemptCount: Number(row.attempt_count) + 1,
    } satisfies ClaimedPushDelivery));
  });
}

async function updateDelivery(
  deliveryId: string,
  status: "SENT" | "FAILED" | "SKIPPED",
  error: string | null,
) {
  const { db } = getDatabaseClient();
  await db
    .update(notificationDeliveries)
    .set({
      status,
      sentAt: status === "SENT" ? new Date() : null,
      lastError: error,
      updatedAt: new Date(),
    })
    .where(eq(notificationDeliveries.id, deliveryId));
}

async function sendPushDelivery(delivery: ClaimedPushDelivery) {
  const env = getServerEnv();
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    throw new Error("Brak konfiguracji VAPID dla Web Push.");
  }
  webPush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);

  const { db } = getDatabaseClient();
  const [notification] = await db
    .select()
    .from(notifications)
    .where(eq(notifications.id, delivery.notificationId))
    .limit(1);
  if (!notification) {
    await updateDelivery(delivery.id, "SKIPPED", "Powiadomienie już nie istnieje.");
    return "skipped" as const;
  }

  const subscriptions = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, notification.userId));
  if (!subscriptions.length) {
    await updateDelivery(delivery.id, "SKIPPED", "Użytkownik nie ma aktywnej subskrypcji Push.");
    return "skipped" as const;
  }

  const taskUrl = notification.taskId
    ? `${env.APP_BASE_URL.replace(/\/$/, "")}/tasks/${notification.taskId}`
    : `${env.APP_BASE_URL.replace(/\/$/, "")}/notifications`;
  const payload = JSON.stringify({
    title: notification.title,
    body: notification.body,
    url: taskUrl,
    tag: `tasker-notification-${notification.id}`,
  });
  let sent = 0;
  const transientErrors: string[] = [];

  for (const subscription of subscriptions) {
    try {
      await webPush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        payload,
        { TTL: 24 * 60 * 60, urgency: "high" },
      );
      sent += 1;
    } catch (error) {
      const statusCode = pushStatusCode(error);
      if (statusCode === 404 || statusCode === 410) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscription.id));
      } else {
        transientErrors.push(pushError(error));
      }
    }
  }

  if (sent > 0) {
    await updateDelivery(
      delivery.id,
      "SENT",
      transientErrors.length ? `Częściowa dostawa: ${transientErrors.join("; ").slice(0, 1_900)}` : null,
    );
    return "sent" as const;
  }
  if (!transientErrors.length) {
    await updateDelivery(delivery.id, "SKIPPED", "Wszystkie subskrypcje wygasły.");
    return "skipped" as const;
  }
  await updateDelivery(delivery.id, "FAILED", transientErrors.join("; ").slice(0, 2_000));
  return "failed" as const;
}

export async function processWebPushBatch(limit = 25) {
  const claimed = await claimPushDeliveries(limit);
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const delivery of claimed) {
    try {
      const result = await sendPushDelivery(delivery);
      if (result === "sent") sent += 1;
      else if (result === "failed") failed += 1;
      else skipped += 1;
    } catch (error) {
      failed += 1;
      await updateDelivery(delivery.id, "FAILED", pushError(error));
    }
  }
  return { claimed: claimed.length, sent, failed, skipped };
}

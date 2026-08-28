import { and, eq, inArray, sql } from "drizzle-orm";

import { getDatabaseClient } from "@/db/client";
import { notificationDeliveries } from "@/db/schema";
import { getServerEnv } from "@/lib/env";

const MAX_DELIVERY_ATTEMPTS = 5;

export interface ClaimedTelegramDelivery {
  deliveryId: string;
  notificationId: string;
  chatId: string;
  text: string;
  taskUrl: string | null;
  attempt: number;
}

export async function claimTelegramDeliveries(limit: number) {
  const { db } = getDatabaseClient();
  const safeLimit = Math.min(Math.max(limit, 1), 50);
  const rows = await db.transaction(async (tx) => {
    await tx.execute(sql`
      update notification_deliveries
      set status = 'FAILED',
          last_error = coalesce(last_error, 'Brak potwierdzenia z Telegrama po maksymalnej liczbie prób.'),
          updated_at = now()
      where channel = 'TELEGRAM'
        and status = 'PENDING'
        and attempt_count >= ${MAX_DELIVERY_ATTEMPTS}
        and updated_at <= now() - interval '5 minutes'
    `);
    const claimed = await tx.execute(sql`
      select
        delivery.id as delivery_id,
        delivery.notification_id,
        delivery.attempt_count,
        notification.task_id,
        notification.title,
        notification.body,
        connection.chat_id
      from notification_deliveries as delivery
      inner join notifications as notification on notification.id = delivery.notification_id
      inner join telegram_connections as connection
        on connection.user_id = notification.user_id and connection.status = 'CONNECTED'
      where delivery.channel = 'TELEGRAM'
        and delivery.status in ('PENDING', 'FAILED')
        and delivery.attempt_count < ${MAX_DELIVERY_ATTEMPTS}
        and (
          delivery.attempt_count = 0
          or delivery.updated_at <= now() - make_interval(
            secs => least(300, 30 * power(2, greatest(delivery.attempt_count - 1, 0)))::int
          )
        )
      order by delivery.created_at asc
      for update of delivery skip locked
      limit ${safeLimit}
    `);
    const ids = claimed.map((row) => String(row.delivery_id));
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
    return claimed;
  });

  const baseUrl = getServerEnv().APP_BASE_URL.replace(/\/$/, "");
  return rows.map((row) => {
    const taskId = row.task_id ? String(row.task_id) : null;
    const taskUrl = taskId ? `${baseUrl}/tasks/${taskId}` : null;
    return {
      deliveryId: String(row.delivery_id),
      notificationId: String(row.notification_id),
      chatId: String(row.chat_id),
      text: `🔔 ${String(row.title)}\n\n${String(row.body)}${taskUrl ? `\n\n${taskUrl}` : ""}`,
      taskUrl,
      attempt: Number(row.attempt_count) + 1,
    } satisfies ClaimedTelegramDelivery;
  });
}

export async function reportTelegramDelivery({
  deliveryId,
  success,
  error,
}: {
  deliveryId: string;
  success: boolean;
  error?: string;
}) {
  const { db } = getDatabaseClient();
  const now = new Date();
  const [updated] = await db
    .update(notificationDeliveries)
    .set({
      status: success ? "SENT" : "FAILED",
      sentAt: success ? now : null,
      lastError: success ? null : (error || "Błąd wysyłki Telegram").slice(0, 2_000),
      updatedAt: now,
    })
    .where(
      and(
        eq(notificationDeliveries.id, deliveryId),
        eq(notificationDeliveries.channel, "TELEGRAM"),
      ),
    )
    .returning({ id: notificationDeliveries.id });
  return Boolean(updated);
}

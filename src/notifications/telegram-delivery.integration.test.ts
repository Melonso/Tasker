import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { getDatabaseClient } from "@/db/client";
import { notificationDeliveries, notifications, telegramConnections } from "@/db/schema";
import { createTestUser, setupIntegrationDatabase } from "@/test/integration";

import { claimTelegramDeliveries, reportTelegramDelivery } from "./telegram-delivery";

setupIntegrationDatabase();

async function queueTelegramNotification(userId: string, connected = true) {
  const { db } = getDatabaseClient();
  if (connected) {
    await db.insert(telegramConnections).values({ userId, telegramUserId: `tg-${userId}`, chatId: `chat-${userId}` });
  }
  const [notification] = await db
    .insert(notifications)
    .values({ userId, title: "Termin jutro", body: "Raport" })
    .returning({ id: notifications.id });
  const [delivery] = await db
    .insert(notificationDeliveries)
    .values({ notificationId: notification!.id, channel: "TELEGRAM", idempotencyKey: `test:${notification!.id}` })
    .returning({ id: notificationDeliveries.id });
  return delivery!.id;
}

async function deliveryState(deliveryId: string) {
  const { db } = getDatabaseClient();
  const [delivery] = await db.select().from(notificationDeliveries).where(eq(notificationDeliveries.id, deliveryId));
  return delivery!;
}

describe("Telegram delivery results", () => {
  it("stops retrying and flags the connection when the user blocked the bot", async () => {
    const user = await createTestUser();
    const deliveryId = await queueTelegramNotification(user.id);
    expect(await claimTelegramDeliveries(10)).toHaveLength(1);

    const result = await reportTelegramDelivery({
      deliveryId,
      success: false,
      error: "Forbidden: bot was blocked by the user",
    });

    expect(result).toEqual({ status: "SKIPPED", permanent: true });
    expect((await deliveryState(deliveryId)).status).toBe("SKIPPED");
    const { db } = getDatabaseClient();
    await db.execute(sql`update notification_deliveries set updated_at = now() - interval '1 hour'`);
    expect(await claimTelegramDeliveries(10)).toHaveLength(0);
    const [connection] = await db.select().from(telegramConnections).where(eq(telegramConnections.userId, user.id));
    expect(connection?.status).toBe("NEEDS_ATTENTION");
  });

  it("retries a transient failure after the backoff", async () => {
    const user = await createTestUser();
    const deliveryId = await queueTelegramNotification(user.id);
    await claimTelegramDeliveries(10);
    await reportTelegramDelivery({ deliveryId, success: false, error: "ETIMEDOUT" });

    expect(await claimTelegramDeliveries(10)).toHaveLength(0);
    const { db } = getDatabaseClient();
    await db.execute(sql`update notification_deliveries set updated_at = now() - interval '1 minute'`);
    const retried = await claimTelegramDeliveries(10);
    expect(retried.map((delivery) => delivery.deliveryId)).toEqual([deliveryId]);
    expect(retried[0]?.attempt).toBe(2);
  });

  it("skips deliveries for recipients without a connected Telegram account", async () => {
    const user = await createTestUser();
    const deliveryId = await queueTelegramNotification(user.id, false);
    expect(await claimTelegramDeliveries(10)).toHaveLength(0);
    expect((await deliveryState(deliveryId)).status).toBe("SKIPPED");
  });
});

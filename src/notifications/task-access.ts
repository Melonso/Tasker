import { and, eq, inArray } from "drizzle-orm";

import type { DatabaseTransaction } from "@/db/client";
import {
  notificationDeliveries,
  notificationPreferences,
  notifications,
  pushSubscriptions,
  telegramConnections,
} from "@/db/schema";

export type TaskAccessNotificationKind = "ASSIGNED" | "SHARED";

export interface TaskAccessRecipient {
  userId: string;
  kind: TaskAccessNotificationKind;
}

export function taskAccessNotificationContent({
  kind,
  taskTitle,
  actorName,
}: {
  kind: TaskAccessNotificationKind;
  taskTitle: string;
  actorName: string;
}) {
  return kind === "ASSIGNED"
    ? {
        title: "Nowe zadanie dla Ciebie",
        body: `Masz nowe zadanie „${taskTitle}”. Autor: ${actorName}.`,
      }
    : {
        title: "Udostępniono Ci zadanie",
        body: `Masz dostęp do zadania „${taskTitle}”. Udostępnia: ${actorName}.`,
      };
}

export function taskAccessDeliveryStatus({
  channelEnabled,
  channelAvailable,
}: {
  channelEnabled: boolean;
  channelAvailable: boolean;
}) {
  return channelEnabled && channelAvailable ? "PENDING" as const : "SKIPPED" as const;
}

export async function queueTaskAccessNotifications(
  tx: DatabaseTransaction,
  {
    taskId,
    taskTitle,
    actorName,
    eventKey,
    recipients,
  }: {
    taskId: string;
    taskTitle: string;
    actorName: string;
    eventKey: string;
    recipients: TaskAccessRecipient[];
  },
) {
  const uniqueRecipients = [...new Map(recipients.map((recipient) => [recipient.userId, recipient])).values()];
  if (!uniqueRecipients.length) return;

  const recipientIds = uniqueRecipients.map((recipient) => recipient.userId);
  const [telegramRows, pushRows, preferenceRows] = await Promise.all([
    tx
      .select({ userId: telegramConnections.userId })
      .from(telegramConnections)
      .where(and(inArray(telegramConnections.userId, recipientIds), eq(telegramConnections.status, "CONNECTED"))),
    tx
      .selectDistinct({ userId: pushSubscriptions.userId })
      .from(pushSubscriptions)
      .where(inArray(pushSubscriptions.userId, recipientIds)),
    tx
      .select({
        userId: notificationPreferences.userId,
        channel: notificationPreferences.channel,
        enabled: notificationPreferences.enabled,
      })
      .from(notificationPreferences)
      .where(inArray(notificationPreferences.userId, recipientIds)),
  ]);
  const telegramUserIds = new Set(telegramRows.map((row) => row.userId));
  const pushUserIds = new Set(pushRows.map((row) => row.userId));
  const disabledChannels = new Set(
    preferenceRows
      .filter((preference) => !preference.enabled)
      .map((preference) => `${preference.userId}:${preference.channel}`),
  );
  const now = new Date();

  for (const recipient of uniqueRecipients) {
    const [notification] = await tx
      .insert(notifications)
      .values({
        userId: recipient.userId,
        taskId,
        ...taskAccessNotificationContent({ kind: recipient.kind, taskTitle, actorName }),
      })
      .returning({ id: notifications.id });
    if (!notification) throw new Error("Nie udało się utworzyć powiadomienia o dostępie do zadania.");

    const idempotencyPrefix = `${eventKey}:${recipient.userId}`;
    await tx.insert(notificationDeliveries).values([
      {
        notificationId: notification.id,
        channel: "IN_APP",
        status: "SENT",
        attemptCount: 1,
        sentAt: now,
        idempotencyKey: `${idempotencyPrefix}:IN_APP`,
      },
      {
        notificationId: notification.id,
        channel: "TELEGRAM",
        status: taskAccessDeliveryStatus({
          channelEnabled: !disabledChannels.has(`${recipient.userId}:TELEGRAM`),
          channelAvailable: telegramUserIds.has(recipient.userId),
        }),
        idempotencyKey: `${idempotencyPrefix}:TELEGRAM`,
      },
      {
        notificationId: notification.id,
        channel: "WEB_PUSH",
        status: taskAccessDeliveryStatus({
          channelEnabled: !disabledChannels.has(`${recipient.userId}:WEB_PUSH`),
          channelAvailable: pushUserIds.has(recipient.userId),
        }),
        idempotencyKey: `${idempotencyPrefix}:WEB_PUSH`,
      },
    ]);
  }
}

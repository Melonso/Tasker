import { and, eq, sql } from "drizzle-orm";

import { getDatabaseClient } from "@/db/client";
import {
  noteReminderSchedules,
  notificationDeliveries,
  notificationPreferences,
  notifications,
  pushSubscriptions,
  telegramConnections,
} from "@/db/schema";
import { nextNoteReminderAt, type NoteReminderFrequency } from "@/notes/reminders";

interface DueNoteReminderSchedule {
  id: string;
  userId: string;
  timeZone: string;
  frequency: NoteReminderFrequency;
  weekday: number | null;
  hour: number;
  minute: number;
  scheduledAt: Date;
}

export async function processDueNoteReminderBatch(limit = 50) {
  const { db } = getDatabaseClient();
  return db.transaction(async (tx) => {
    const dueRows = await tx.execute(sql`
      select
        schedule.id,
        schedule.user_id,
        schedule.frequency,
        schedule.weekday,
        schedule.hour,
        schedule.minute,
        schedule.next_reminder_at,
        app_user.time_zone
      from note_reminder_schedules as schedule
      inner join users as app_user on app_user.id = schedule.user_id and app_user.is_active = true
      where schedule.enabled = true and schedule.next_reminder_at <= now()
      order by schedule.next_reminder_at asc
      for update of schedule skip locked
      limit ${Math.min(Math.max(limit, 1), 50)}
    `);
    const schedules = dueRows.map((row) => ({
      id: String(row.id),
      userId: String(row.user_id),
      timeZone: String(row.time_zone),
      frequency: String(row.frequency) as NoteReminderFrequency,
      weekday: row.weekday === null ? null : Number(row.weekday),
      hour: Number(row.hour),
      minute: Number(row.minute),
      scheduledAt: new Date(String(row.next_reminder_at)),
    } satisfies DueNoteReminderSchedule));

    for (const schedule of schedules) {
      const [[telegramConnection], [pushSubscription], preferenceRows] = await Promise.all([
        tx
          .select({ userId: telegramConnections.userId })
          .from(telegramConnections)
          .where(and(eq(telegramConnections.userId, schedule.userId), eq(telegramConnections.status, "CONNECTED")))
          .limit(1),
        tx
          .select({ userId: pushSubscriptions.userId })
          .from(pushSubscriptions)
          .where(eq(pushSubscriptions.userId, schedule.userId))
          .limit(1),
        tx
          .select({ channel: notificationPreferences.channel, enabled: notificationPreferences.enabled })
          .from(notificationPreferences)
          .where(eq(notificationPreferences.userId, schedule.userId)),
      ]);
      const disabledChannels = new Set(
        preferenceRows.filter((preference) => !preference.enabled).map((preference) => preference.channel),
      );
      const [notification] = await tx
        .insert(notifications)
        .values({
          userId: schedule.userId,
          title: "Porządek w notatkach",
          body: "Pamiętaj, aby uporządkować swoje notatki.",
          targetPath: "/notes",
        })
        .returning({ id: notifications.id });
      if (!notification) throw new Error("Nie udało się utworzyć przypomnienia o notatkach.");
      const idempotencyPrefix = `note-reminder:${schedule.id}:${schedule.scheduledAt.getTime()}`;
      await tx.insert(notificationDeliveries).values([
        {
          notificationId: notification.id,
          channel: "IN_APP",
          status: "SENT",
          idempotencyKey: `${idempotencyPrefix}:IN_APP`,
          attemptCount: 1,
          sentAt: new Date(),
        },
        {
          notificationId: notification.id,
          channel: "TELEGRAM",
          status: telegramConnection && !disabledChannels.has("TELEGRAM") ? "PENDING" : "SKIPPED",
          idempotencyKey: `${idempotencyPrefix}:TELEGRAM`,
        },
        {
          notificationId: notification.id,
          channel: "WEB_PUSH",
          status: pushSubscription && !disabledChannels.has("WEB_PUSH") ? "PENDING" : "SKIPPED",
          idempotencyKey: `${idempotencyPrefix}:WEB_PUSH`,
        },
      ]);
      const now = new Date();
      await tx
        .update(noteReminderSchedules)
        .set({
          lastSentAt: now,
          nextReminderAt: nextNoteReminderAt({
            now,
            timeZone: schedule.timeZone,
            frequency: schedule.frequency,
            weekday: schedule.weekday,
            hour: schedule.hour,
            minute: schedule.minute,
          }),
          updatedAt: now,
        })
        .where(eq(noteReminderSchedules.id, schedule.id));
    }

    return { claimed: schedules.length, processed: schedules.length, failed: 0 };
  });
}

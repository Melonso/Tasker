import { and, eq, inArray, sql } from "drizzle-orm";

import { getDatabaseClient } from "@/db/client";
import {
  notificationDeliveries,
  notificationPreferences,
  notifications,
  pushSubscriptions,
  reminders,
  tasks,
  telegramConnections,
  users,
  workerHeartbeats,
} from "@/db/schema";
import type { ReminderKind } from "@/domain/reminders";
import { nextDailyReminder } from "@/domain/reminders";

import {
  reminderContent,
  reminderMatchesCurrentTask,
  reminderRecipientIds,
} from "./reminder-content";

const MAX_REMINDER_ATTEMPTS = 5;
const STALE_PROCESSING_MINUTES = 5;

interface ClaimedReminder {
  id: string;
  taskId: string;
  kind: ReminderKind;
  scheduledAt: Date;
  attemptCount: number;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 2_000) : "Nieznany błąd workera";
}

async function claimDueReminders(limit: number) {
  const { db } = getDatabaseClient();
  return db.transaction(async (tx) => {
    await tx.execute(sql`
      update reminders
      set status = 'SCHEDULED', updated_at = now(), last_error = 'Przywrócono po przerwanym przetwarzaniu.'
      where status = 'PROCESSING'
        and updated_at < now() - make_interval(mins => ${STALE_PROCESSING_MINUTES})
        and attempt_count < ${MAX_REMINDER_ATTEMPTS}
    `);
    await tx.execute(sql`
      update reminders
      set status = 'FAILED', processed_at = now(), updated_at = now(), last_error = coalesce(last_error, 'Przekroczono limit prób.')
      where status in ('SCHEDULED', 'PROCESSING') and attempt_count >= ${MAX_REMINDER_ATTEMPTS}
    `);

    const rows = await tx.execute(sql`
      with due as (
        select id
        from reminders
        where status = 'SCHEDULED'
          and scheduled_at <= now()
          and attempt_count < ${MAX_REMINDER_ATTEMPTS}
          and (
            attempt_count = 0
            or updated_at <= now() - make_interval(secs => least(300, 30 * power(2, greatest(attempt_count - 1, 0)))::int)
          )
        order by scheduled_at asc
        for update skip locked
        limit ${limit}
      )
      update reminders as reminder
      set status = 'PROCESSING', attempt_count = reminder.attempt_count + 1, updated_at = now()
      from due
      where reminder.id = due.id
      returning reminder.id, reminder.task_id, reminder.kind, reminder.scheduled_at, reminder.attempt_count
    `);

    return rows.map((row) => ({
      id: String(row.id),
      taskId: String(row.task_id),
      kind: String(row.kind) as ReminderKind,
      scheduledAt: new Date(String(row.scheduled_at)),
      attemptCount: Number(row.attempt_count),
    } satisfies ClaimedReminder));
  });
}

async function processClaimedReminder(reminder: ClaimedReminder, now: Date) {
  const { db } = getDatabaseClient();
  await db.transaction(async (tx) => {
    const [task] = await tx
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        authorId: tasks.authorId,
        assigneeId: tasks.assigneeId,
        dueAt: tasks.dueAt,
        assigneeTimeZone: users.timeZone,
        assigneeOverdueHour: users.overdueReminderHour,
      })
      .from(tasks)
      .innerJoin(users, eq(tasks.assigneeId, users.id))
      .where(eq(tasks.id, reminder.taskId))
      .limit(1);

    if (
      !task?.dueAt ||
      !["OPEN", "WAITING"].includes(task.status) ||
      !reminderMatchesCurrentTask({
        kind: reminder.kind,
        scheduledAt: reminder.scheduledAt,
        dueAt: task.dueAt,
        now,
      })
    ) {
      await tx
        .update(reminders)
        .set({ status: "CANCELED", processedAt: now, updatedAt: now })
        .where(and(eq(reminders.id, reminder.id), eq(reminders.status, "PROCESSING")));
      return;
    }

    const recipientIds = reminderRecipientIds(reminder.kind, task.authorId, task.assigneeId);
    const connectedRows = await tx
      .select({ userId: telegramConnections.userId })
      .from(telegramConnections)
      .where(
        and(
          inArray(telegramConnections.userId, recipientIds),
          eq(telegramConnections.status, "CONNECTED"),
        ),
      );
    const connectedUserIds = new Set(connectedRows.map((row) => row.userId));
    const pushRows = await tx
      .selectDistinct({ userId: pushSubscriptions.userId })
      .from(pushSubscriptions)
      .where(inArray(pushSubscriptions.userId, recipientIds));
    const pushUserIds = new Set(pushRows.map((row) => row.userId));
    const preferenceRows = await tx
      .select({
        userId: notificationPreferences.userId,
        channel: notificationPreferences.channel,
        enabled: notificationPreferences.enabled,
      })
      .from(notificationPreferences)
      .where(inArray(notificationPreferences.userId, recipientIds));
    const disabledChannels = new Set(
      preferenceRows
        .filter((preference) => !preference.enabled)
        .map((preference) => `${preference.userId}:${preference.channel}`),
    );

    for (const recipientId of recipientIds) {
      const content = reminderContent({
        kind: reminder.kind,
        taskTitle: task.title,
        dueAt: task.dueAt,
        timeZone: task.assigneeTimeZone,
      });
      const [notification] = await tx
        .insert(notifications)
        .values({ userId: recipientId, taskId: task.id, ...content })
        .returning({ id: notifications.id });
      if (!notification) throw new Error("Nie udało się utworzyć powiadomienia.");

      await tx.insert(notificationDeliveries).values([
        {
          notificationId: notification.id,
          channel: "IN_APP",
          status: "SENT",
          idempotencyKey: `${reminder.id}:${recipientId}:IN_APP`,
          attemptCount: 1,
          sentAt: now,
        },
        {
          notificationId: notification.id,
          channel: "TELEGRAM",
          status: connectedUserIds.has(recipientId) && !disabledChannels.has(`${recipientId}:TELEGRAM`) ? "PENDING" : "SKIPPED",
          idempotencyKey: `${reminder.id}:${recipientId}:TELEGRAM`,
        },
        {
          notificationId: notification.id,
          channel: "WEB_PUSH",
          status: pushUserIds.has(recipientId) && !disabledChannels.has(`${recipientId}:WEB_PUSH`) ? "PENDING" : "SKIPPED",
          idempotencyKey: `${reminder.id}:${recipientId}:WEB_PUSH`,
        },
      ]);
    }

    await tx
      .update(reminders)
      .set({ status: "SENT", processedAt: now, lastError: null, updatedAt: now })
      .where(and(eq(reminders.id, reminder.id), eq(reminders.status, "PROCESSING")));

    if (reminder.kind === "OVERDUE_DAILY") {
      const nextAt = nextDailyReminder(now, task.assigneeTimeZone, task.assigneeOverdueHour);
      await tx
        .insert(reminders)
        .values({ taskId: task.id, kind: "OVERDUE_DAILY", scheduledAt: nextAt })
        .onConflictDoNothing();
    }
  });
}

async function recordReminderFailure(reminder: ClaimedReminder, error: unknown) {
  const { db } = getDatabaseClient();
  const failed = reminder.attemptCount >= MAX_REMINDER_ATTEMPTS;
  await db
    .update(reminders)
    .set({
      status: failed ? "FAILED" : "SCHEDULED",
      processedAt: failed ? new Date() : null,
      lastError: errorMessage(error),
      updatedAt: new Date(),
    })
    .where(eq(reminders.id, reminder.id));
}

export async function updateWorkerHeartbeat(details: Record<string, unknown>) {
  const { db } = getDatabaseClient();
  const now = new Date();
  await db
    .insert(workerHeartbeats)
    .values({ service: "reminder-worker", status: "HEALTHY", details, lastSeenAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: workerHeartbeats.service,
      set: { status: "HEALTHY", details, lastSeenAt: now, updatedAt: now },
    });
}

export async function processDueReminderBatch(limit = 50) {
  const claimed = await claimDueReminders(limit);
  let processed = 0;
  let failed = 0;
  for (const reminder of claimed) {
    try {
      await processClaimedReminder(reminder, new Date());
      processed += 1;
    } catch (error) {
      failed += 1;
      console.error("Reminder processing failed", { reminderId: reminder.id, error });
      await recordReminderFailure(reminder, error);
    }
  }
  return { claimed: claimed.length, processed, failed };
}

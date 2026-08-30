import { and, eq } from "drizzle-orm";

import type { AuthenticatedUser } from "@/auth/session";
import { getDatabaseClient } from "@/db/client";
import {
  auditEvents,
  notificationDeliveries,
  notificationPreferences,
  notifications,
  taskCommandDrafts,
} from "@/db/schema";
import {
  completeTaskForUser,
  createTaskForUser,
  reassignTaskForUser,
  rescheduleTaskForUser,
  shareTaskWithUser,
  TaskInputError,
} from "@/tasks/service";

export type ClaimedTaskDraft = typeof taskCommandDrafts.$inferSelect;

export async function confirmClaimedTaskDraft(
  draft: ClaimedTaskDraft,
  user: AuthenticatedUser,
  mode: "MANUAL" | "AUTO",
) {
  if (draft.status !== "PROCESSING") throw new Error("Szkic nie został przejęty do przetwarzania.");
  const payload = draft.payload;
  let taskId: string;
  let taskTitle: string;
  if (payload.intent === "CREATE_TASK") {
    if (!payload.assigneeId) throw new TaskInputError("Szkic nie ma rozpoznanego wykonawcy.");
    taskTitle = payload.title;
    taskId = await createTaskForUser(user, {
      title: payload.title,
      description: payload.description,
      assigneeId: payload.assigneeId,
      visibility: payload.visibility,
      priority: payload.priority,
      dueAt: payload.dueAt ? new Date(payload.dueAt) : null,
      source: "TELEGRAM",
    });
  } else {
    if (mode === "AUTO") throw new TaskInputError("Automatyczne zatwierdzanie dotyczy tylko tworzenia zadań.");
    if (!payload.taskId) throw new TaskInputError("Szkic nie ma rozpoznanego zadania.");
    taskId = payload.taskId;
    taskTitle = payload.taskTitle ?? "zadanie";
    if (payload.intent === "COMPLETE_TASK") {
      await completeTaskForUser(user, taskId);
    } else if (payload.intent === "RESCHEDULE_TASK") {
      if (!payload.dueAt) throw new TaskInputError("Szkic nie ma nowego terminu.");
      await rescheduleTaskForUser(user, taskId, new Date(payload.dueAt));
    } else {
      if (!payload.targetUserId) throw new TaskInputError("Szkic nie ma rozpoznanej osoby.");
      if (payload.intent === "SHARE_TASK") {
        await shareTaskWithUser(user, taskId, payload.targetUserId);
      } else {
        await reassignTaskForUser(user, taskId, payload.targetUserId);
      }
    }
  }
  const { db } = getDatabaseClient();
  return db.transaction(async (tx) => {
    const now = new Date();
    const [confirmed] = await tx
      .update(taskCommandDrafts)
      .set({ status: "CONFIRMED", taskId, confirmedAt: now, updatedAt: now })
      .where(and(eq(taskCommandDrafts.id, draft.id), eq(taskCommandDrafts.status, "PROCESSING")))
      .returning();
    if (!confirmed) throw new Error("Stan szkicu zmienił się podczas zatwierdzania.");
    await tx.insert(auditEvents).values({
      actorId: user.id,
      taskId,
      action: mode === "AUTO" ? "TASK_DRAFT_AUTO_CONFIRMED" : "TASK_DRAFT_CONFIRMED",
      metadata: { draftId: draft.id, source: "TELEGRAM", mode, intent: payload.intent },
    });

    if (mode === "AUTO") {
      const preferenceRows = await tx
        .select({ channel: notificationPreferences.channel, enabled: notificationPreferences.enabled })
        .from(notificationPreferences)
        .where(eq(notificationPreferences.userId, user.id));
      const preferenceByChannel = new Map(preferenceRows.map((preference) => [preference.channel, preference.enabled]));
      const [notification] = await tx
        .insert(notifications)
        .values({
          userId: user.id,
          taskId,
          title: "Zadanie zatwierdzone automatycznie",
          body: `Szkic „${taskTitle}” nie został odrzucony w ciągu 10 minut, więc Tasker utworzył zadanie.`,
        })
        .returning({ id: notifications.id });
      if (!notification) throw new Error("Nie udało się utworzyć potwierdzenia automatycznego zadania.");
      await tx.insert(notificationDeliveries).values([
        {
          notificationId: notification.id,
          channel: "IN_APP",
          status: "SENT",
          attemptCount: 1,
          sentAt: now,
          idempotencyKey: `draft-auto:${draft.id}:IN_APP`,
        },
        {
          notificationId: notification.id,
          channel: "TELEGRAM",
          status: (preferenceByChannel.get("TELEGRAM") ?? true) ? "PENDING" : "SKIPPED",
          idempotencyKey: `draft-auto:${draft.id}:TELEGRAM`,
        },
        {
          notificationId: notification.id,
          channel: "WEB_PUSH",
          status: (preferenceByChannel.get("WEB_PUSH") ?? true) ? "PENDING" : "SKIPPED",
          idempotencyKey: `draft-auto:${draft.id}:WEB_PUSH`,
        },
      ]);
    }
    return confirmed;
  });
}

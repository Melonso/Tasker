import { and, eq } from "drizzle-orm";

import type { AuthenticatedUser } from "@/auth/session";
import { getDatabaseClient } from "@/db/client";
import {
  auditEvents,
  notificationDeliveries,
  notifications,
  taskCommandDrafts,
} from "@/db/schema";
import { createTaskForUser, TaskInputError } from "@/tasks/service";

export type ClaimedTaskDraft = typeof taskCommandDrafts.$inferSelect;

export async function confirmClaimedTaskDraft(
  draft: ClaimedTaskDraft,
  user: AuthenticatedUser,
  mode: "MANUAL" | "AUTO",
) {
  if (draft.status !== "PROCESSING") throw new Error("Szkic nie został przejęty do przetwarzania.");
  if (!draft.payload.assigneeId) throw new TaskInputError("Szkic nie ma rozpoznanego wykonawcy.");

  const taskId = await createTaskForUser(user, {
    title: draft.payload.title,
    description: draft.payload.description,
    assigneeId: draft.payload.assigneeId,
    visibility: draft.payload.visibility,
    priority: draft.payload.priority,
    dueAt: draft.payload.dueAt ? new Date(draft.payload.dueAt) : null,
    source: "TELEGRAM",
  });
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
      metadata: { draftId: draft.id, source: "TELEGRAM", mode },
    });

    if (mode === "AUTO") {
      const [notification] = await tx
        .insert(notifications)
        .values({
          userId: user.id,
          taskId,
          title: "Zadanie zatwierdzone automatycznie",
          body: `Szkic „${draft.payload.title}” nie został odrzucony w ciągu 10 minut, więc Tasker utworzył zadanie.`,
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
          status: "PENDING",
          idempotencyKey: `draft-auto:${draft.id}:TELEGRAM`,
        },
        {
          notificationId: notification.id,
          channel: "WEB_PUSH",
          status: "PENDING",
          idempotencyKey: `draft-auto:${draft.id}:WEB_PUSH`,
        },
      ]);
    }
    return confirmed;
  });
}

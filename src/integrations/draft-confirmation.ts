import { and, eq } from "drizzle-orm";

import type { AuthenticatedUser } from "@/auth/session";
import { getDatabaseClient, type DatabaseTransaction } from "@/db/client";
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

export type StoredTaskDraft = typeof taskCommandDrafts.$inferSelect;

export const DRAFT_AUTO_CONFIRM_DELAY_MS = 10 * 60 * 1_000;

export type DraftConfirmationResult =
  | { outcome: "CONFIRMED" | "ALREADY_CONFIRMED" | "NEEDS_CLARIFICATION" | "UNAVAILABLE"; draft: StoredTaskDraft }
  | { outcome: "EXPIRED"; draft: StoredTaskDraft }
  | { outcome: "NOT_FOUND" | "LOCKED" };

async function applyDraftToTask(
  tx: DatabaseTransaction,
  draft: StoredTaskDraft,
  user: AuthenticatedUser,
) {
  const payload = draft.payload;
  if (payload.intent === "CREATE_TASK") {
    if (!payload.assigneeId) throw new TaskInputError("Szkic nie ma rozpoznanego wykonawcy.");
    const taskId = await createTaskForUser(
      user,
      {
        title: payload.title,
        description: payload.description,
        assigneeId: payload.assigneeId,
        scope: payload.taskScope ?? (payload.visibility === "PRIVATE" ? "PRIVATE" : "COMPANY"),
        visibility: payload.visibility,
        priority: payload.priority,
        dueAt: payload.dueAt ? new Date(payload.dueAt) : null,
        source: "TELEGRAM",
        shareUserIds: payload.sharedUserId ? [payload.sharedUserId] : [],
      },
      tx,
    );
    return { taskId, taskTitle: payload.title };
  }

  if (!payload.taskId) throw new TaskInputError("Szkic nie ma rozpoznanego zadania.");
  const taskId = payload.taskId;
  if (payload.intent === "COMPLETE_TASK") {
    await completeTaskForUser(user, taskId, tx);
  } else if (payload.intent === "RESCHEDULE_TASK") {
    if (!payload.dueAt) throw new TaskInputError("Szkic nie ma nowego terminu.");
    await rescheduleTaskForUser(user, taskId, new Date(payload.dueAt), tx);
  } else {
    if (!payload.targetUserId) throw new TaskInputError("Szkic nie ma rozpoznanej osoby.");
    if (payload.intent === "SHARE_TASK") {
      await shareTaskWithUser(user, taskId, payload.targetUserId, tx);
    } else {
      await reassignTaskForUser(user, taskId, payload.targetUserId, tx);
    }
  }
  return { taskId, taskTitle: payload.taskTitle ?? "zadanie" };
}

async function queueAutoConfirmationNotice(
  tx: DatabaseTransaction,
  draft: StoredTaskDraft,
  user: AuthenticatedUser,
  taskId: string,
  taskTitle: string,
  now: Date,
) {
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

/**
 * Confirms a draft and applies its task operation in a single transaction. The draft row is locked
 * for the duration, so a manual confirmation, a cancellation and the automatic confirmation can
 * never apply the same draft twice. A {@link TaskInputError} rolls everything back and leaves the
 * draft untouched.
 */
export async function confirmTaskDraft({
  draftId,
  user,
  mode,
  now = new Date(),
}: {
  draftId: string;
  user: AuthenticatedUser;
  mode: "MANUAL" | "AUTO";
  now?: Date;
}): Promise<DraftConfirmationResult> {
  const { db } = getDatabaseClient();
  return db.transaction(async (tx) => {
    const query = tx
      .select()
      .from(taskCommandDrafts)
      .where(and(eq(taskCommandDrafts.id, draftId), eq(taskCommandDrafts.userId, user.id)))
      .limit(1);
    const [draft] = mode === "AUTO"
      ? await query.for("update", { skipLocked: true })
      : await query.for("update");
    if (!draft) return { outcome: mode === "AUTO" ? "LOCKED" : "NOT_FOUND" };
    if (draft.status === "CONFIRMED") return { outcome: "ALREADY_CONFIRMED", draft };
    if (draft.status === "NEEDS_CLARIFICATION") return { outcome: "NEEDS_CLARIFICATION", draft };
    if (draft.status === "EXPIRED") return { outcome: "EXPIRED", draft };
    if (draft.status !== "DRAFT") return { outcome: "UNAVAILABLE", draft };
    if (draft.expiresAt <= now) {
      const [expired] = await tx
        .update(taskCommandDrafts)
        .set({ status: "EXPIRED", updatedAt: now })
        .where(eq(taskCommandDrafts.id, draft.id))
        .returning();
      return { outcome: "EXPIRED", draft: expired ?? draft };
    }
    if (
      mode === "AUTO" &&
      (draft.payload.intent !== "CREATE_TASK" ||
        draft.createdAt.getTime() > now.getTime() - DRAFT_AUTO_CONFIRM_DELAY_MS)
    ) {
      return { outcome: "UNAVAILABLE", draft };
    }

    const { taskId, taskTitle } = await applyDraftToTask(tx, draft, user);
    const [confirmed] = await tx
      .update(taskCommandDrafts)
      .set({ status: "CONFIRMED", taskId, confirmedAt: now, updatedAt: now })
      .where(eq(taskCommandDrafts.id, draft.id))
      .returning();
    if (!confirmed) throw new Error("Nie udało się zapisać zatwierdzenia szkicu.");
    await tx.insert(auditEvents).values({
      actorId: user.id,
      taskId,
      action: mode === "AUTO" ? "TASK_DRAFT_AUTO_CONFIRMED" : "TASK_DRAFT_CONFIRMED",
      metadata: { draftId: draft.id, source: "TELEGRAM", mode, intent: draft.payload.intent },
    });
    if (mode === "AUTO") await queueAutoConfirmationNotice(tx, draft, user, taskId, taskTitle, now);
    return { outcome: "CONFIRMED", draft: confirmed };
  });
}

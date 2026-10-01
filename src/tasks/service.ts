import { and, eq, inArray } from "drizzle-orm";

import type { AuthenticatedUser } from "@/auth/session";
import { getDatabaseClient, type DatabaseTransaction } from "@/db/client";
import {
  auditEvents,
  reminders,
  roles,
  taskRecurrences,
  taskDueDateHistory,
  taskShares,
  tasks,
  teams,
  userRoles,
  users,
} from "@/db/schema";
import { buildReminderSchedule, nextDailyReminder, zonedDateTimeToUtc } from "@/domain/reminders";
import { firstRecurringDueAtAfter, nextRecurringDueAt, type RecurrenceRule } from "@/domain/recurrence";

import { isCalendarDateKey, isClockTimeKey } from "@/lib/dates";
import { UserInputError } from "@/lib/errors";

import { isCompanyUser } from "./policy";

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  assigneeId: string;
  visibility: "PRIVATE" | "COMPANY" | "SHARED";
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  dueAt: Date | null;
  plannedForDate?: string | null;
  source?: "WEB" | "TELEGRAM" | "API";
  recurrenceRule?: RecurrenceRule | null;
  shareUserIds?: string[];
  shareTeamIds?: string[];
}

export class TaskInputError extends UserInputError {}

type StoredTask = typeof tasks.$inferSelect;

const ACTIVE_TASK_STATUSES: Array<StoredTask["status"]> = ["OPEN", "WAITING"];

export function dueAtFromInput(
  dueDate: string | undefined,
  dueTime: string | undefined,
  user: Pick<AuthenticatedUser, "defaultTaskHour" | "timeZone">,
) {
  if (!dueDate) return null;
  if (!isCalendarDateKey(dueDate) || (dueTime && !isClockTimeKey(dueTime))) {
    throw new TaskInputError("Podaj prawidłową datę i godzinę.");
  }
  const [year, month, day] = dueDate.split("-").map(Number);
  const [hour, minute] = dueTime ? dueTime.split(":").map(Number) : [user.defaultTaskHour, 0];
  return zonedDateTimeToUtc({ year, month, day, hour, minute }, user.timeZone);
}

/**
 * Runs the work inside the caller's transaction, or opens a new one. Every task mutation goes
 * through here so that a draft confirmation can apply the task change and its own state change
 * atomically.
 */
function runInTransaction<T>(
  tx: DatabaseTransaction | undefined,
  work: (tx: DatabaseTransaction) => Promise<T>,
) {
  return tx ? work(tx) : getDatabaseClient().db.transaction(work);
}

/** Locks an active task row so that concurrent mutations are applied one after another. */
async function lockActiveTask(tx: DatabaseTransaction, taskId: string) {
  const [task] = await tx
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), inArray(tasks.status, ACTIVE_TASK_STATUSES)))
    .limit(1)
    .for("update");
  return task ?? null;
}

async function lockEditableTask(
  tx: DatabaseTransaction,
  user: Pick<AuthenticatedUser, "id">,
  taskId: string,
  message: string,
) {
  const task = await lockActiveTask(tx, taskId);
  if (!task || (task.authorId !== user.id && task.assigneeId !== user.id)) throw new TaskInputError(message);
  return task;
}

async function lockAuthoredTask(
  tx: DatabaseTransaction,
  user: Pick<AuthenticatedUser, "id">,
  taskId: string,
  message: string,
) {
  const task = await lockActiveTask(tx, taskId);
  if (!task || task.authorId !== user.id) throw new TaskInputError(message);
  return task;
}

async function updateLockedTask(
  tx: DatabaseTransaction,
  task: StoredTask,
  values: Partial<Omit<typeof tasks.$inferInsert, "id" | "version">>,
  now = new Date(),
) {
  const [updated] = await tx
    .update(tasks)
    .set({ ...values, updatedAt: now, version: task.version + 1 })
    .where(and(eq(tasks.id, task.id), eq(tasks.version, task.version)))
    .returning({ id: tasks.id });
  if (!updated) throw new Error("Zadanie zostało zmienione w trakcie zapisu.");
}

async function rolesForUser(tx: DatabaseTransaction, userId: string) {
  const rows = await tx
    .select({ role: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, userId));
  return rows.map((row) => row.role);
}

async function reminderSettingsForUser(tx: DatabaseTransaction, userId: string) {
  const [settings] = await tx
    .select({ timeZone: users.timeZone, overdueReminderHour: users.overdueReminderHour })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!settings) throw new TaskInputError("Nie znaleziono wykonawcy zadania.");
  return settings;
}

/** Cancels pending reminders of the task and schedules a fresh set for the given due date. */
async function replaceReminders(
  tx: DatabaseTransaction,
  taskId: string,
  dueAt: Date | null,
  settings: { timeZone: string; overdueReminderHour: number },
  now: Date,
) {
  await tx
    .update(reminders)
    .set({ status: "CANCELED", updatedAt: now })
    .where(and(eq(reminders.taskId, taskId), eq(reminders.status, "SCHEDULED")));
  if (!dueAt) return;
  const schedule = buildReminderSchedule({
    dueAt,
    now,
    timeZone: settings.timeZone,
    overdueReminderHour: settings.overdueReminderHour,
  });
  if (!schedule.length) return;
  await tx
    .insert(reminders)
    .values(schedule.map((item) => ({ taskId, kind: item.kind, scheduledAt: item.scheduledAt })))
    .onConflictDoUpdate({
      target: [reminders.taskId, reminders.kind, reminders.scheduledAt],
      set: { status: "SCHEDULED", attemptCount: 0, processedAt: null, lastError: null, updatedAt: now },
    });
}

async function validateShareTargets(
  tx: DatabaseTransaction,
  user: Pick<AuthenticatedUser, "id">,
  shareUserIds: string[],
  shareTeamIds: string[],
) {
  if (shareUserIds.length) {
    const sharedUsers = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.id, shareUserIds), eq(users.isActive, true)));
    if (sharedUsers.length !== shareUserIds.length) {
      throw new TaskInputError("Co najmniej jedna wybrana osoba nie jest dostępna.");
    }
  }
  if (shareTeamIds.length) {
    const sharedTeams = await tx
      .select({ id: teams.id })
      .from(teams)
      .where(and(inArray(teams.id, shareTeamIds), eq(teams.createdById, user.id)));
    if (sharedTeams.length !== shareTeamIds.length) {
      throw new TaskInputError("Co najmniej jeden wybrany zespół nie jest dostępny.");
    }
  }
}

export async function createTaskForUser(
  user: AuthenticatedUser,
  input: CreateTaskInput,
  transaction?: DatabaseTransaction,
) {
  return runInTransaction(transaction, async (tx) => {
    const [assignee] = await tx
      .select({
        id: users.id,
        isActive: users.isActive,
        timeZone: users.timeZone,
        overdueReminderHour: users.overdueReminderHour,
      })
      .from(users)
      .where(eq(users.id, input.assigneeId))
      .limit(1);
    if (!assignee?.isActive) throw new TaskInputError("Wybrany wykonawca nie jest aktywnym użytkownikiem.");
    if (user.roles.includes("EXTERNAL") && assignee.id !== user.id) {
      throw new TaskInputError("Użytkownik zewnętrzny nie może delegować zadań innym osobom.");
    }

    const assigneeRoles = await rolesForUser(tx, assignee.id);
    if (input.visibility === "COMPANY" && !isCompanyUser(assigneeRoles)) {
      throw new TaskInputError("Zadanie dla użytkownika zewnętrznego musi być prywatne lub udostępnione.");
    }
    if (input.recurrenceRule && !input.dueAt) {
      throw new TaskInputError("Zadanie cykliczne musi mieć pierwszy termin.");
    }

    const shareUserIds = [...new Set(input.shareUserIds ?? [])].filter(
      (id) => id !== user.id && id !== assignee.id,
    );
    const shareTeamIds = [...new Set(input.shareTeamIds ?? [])];
    if (input.visibility === "SHARED" && !shareUserIds.length && !shareTeamIds.length) {
      throw new TaskInputError("Wybierz przynajmniej jedną osobę lub zespół do udostępnienia.");
    }
    if (user.roles.includes("EXTERNAL") && (shareUserIds.length || shareTeamIds.length)) {
      throw new TaskInputError("Użytkownik zewnętrzny nie może udostępniać zadań dalej.");
    }
    await validateShareTargets(tx, user, shareUserIds, shareTeamIds);

    const now = new Date();
    const [task] = await tx
      .insert(tasks)
      .values({
        title: input.title,
        description: input.description || null,
        authorId: user.id,
        assigneeId: assignee.id,
        visibility: input.visibility,
        priority: input.priority,
        dueAt: input.dueAt,
        plannedForDate: input.plannedForDate ?? null,
      })
      .returning({ id: tasks.id });
    if (!task) throw new Error("Task insert returned no identifier.");

    await replaceReminders(tx, task.id, input.dueAt, assignee, now);

    if (input.recurrenceRule && input.dueAt) {
      await tx.insert(taskRecurrences).values({
        taskId: task.id,
        rule: input.recurrenceRule,
        nextOccurrenceAt: nextRecurringDueAt(input.dueAt, input.recurrenceRule, assignee.timeZone),
      });
    }

    if (input.visibility === "SHARED") {
      const shares = [
        ...shareUserIds.map((userId) => ({ taskId: task.id, userId })),
        ...shareTeamIds.map((teamId) => ({ taskId: task.id, teamId })),
      ];
      if (shares.length) await tx.insert(taskShares).values(shares);
    }

    await tx.insert(auditEvents).values({
      actorId: user.id,
      taskId: task.id,
      action: "TASK_CREATED",
      metadata: {
        assigneeId: assignee.id,
        dueAt: input.dueAt?.toISOString() ?? null,
        source: input.source ?? "WEB",
        recurrence: input.recurrenceRule ?? null,
        sharedUsers: input.visibility === "SHARED" ? shareUserIds.length : 0,
        sharedTeams: input.visibility === "SHARED" ? shareTeamIds.length : 0,
      },
    });
    return task.id;
  });
}

export async function completeTaskForUser(
  user: AuthenticatedUser,
  taskId: string,
  transaction?: DatabaseTransaction,
) {
  return runInTransaction(transaction, async (tx) => {
    const task = await lockEditableTask(tx, user, taskId, "Nie masz uprawnień do zakończenia tego zadania.");
    const [[recurrence], assignee, shares] = await Promise.all([
      tx.select().from(taskRecurrences).where(eq(taskRecurrences.taskId, task.id)).limit(1),
      reminderSettingsForUser(tx, task.assigneeId),
      tx
        .select({ userId: taskShares.userId, teamId: taskShares.teamId })
        .from(taskShares)
        .where(eq(taskShares.taskId, task.id)),
    ]);

    const now = new Date();
    await updateLockedTask(tx, task, { status: "COMPLETED", completedAt: now, completedById: user.id }, now);
    await replaceReminders(tx, task.id, null, assignee, now);
    await tx.insert(auditEvents).values({ actorId: user.id, taskId: task.id, action: "TASK_COMPLETED" });

    let nextTaskId: string | null = null;
    if (recurrence && !recurrence.isPaused && task.dueAt) {
      const nextDueAt = firstRecurringDueAtAfter(
        recurrence.nextOccurrenceAt ?? nextRecurringDueAt(task.dueAt, recurrence.rule, assignee.timeZone),
        recurrence.rule,
        assignee.timeZone,
        now,
      );
      const [nextTask] = await tx
        .insert(tasks)
        .values({
          title: task.title,
          description: task.description,
          authorId: task.authorId,
          assigneeId: task.assigneeId,
          visibility: task.visibility,
          priority: task.priority,
          dueAt: nextDueAt,
        })
        .returning({ id: tasks.id });
      if (!nextTask) throw new Error("Nie udało się utworzyć kolejnego wystąpienia.");
      nextTaskId = nextTask.id;
      await tx.insert(taskRecurrences).values({
        taskId: nextTask.id,
        seriesId: recurrence.seriesId,
        rule: recurrence.rule,
        nextOccurrenceAt: nextRecurringDueAt(nextDueAt, recurrence.rule, assignee.timeZone),
      });
      if (shares.length) {
        await tx.insert(taskShares).values(
          shares.map((share) => ({
            taskId: nextTask.id,
            ...(share.userId ? { userId: share.userId } : { teamId: share.teamId }),
          })),
        );
      }
      await replaceReminders(tx, nextTask.id, nextDueAt, assignee, now);
      await tx.insert(auditEvents).values({
        actorId: user.id,
        taskId: nextTask.id,
        action: "TASK_RECURRENCE_GENERATED",
        metadata: { previousTaskId: task.id, seriesId: recurrence.seriesId },
      });
    }

    return { taskId: task.id, nextTaskId };
  });
}

export async function rescheduleTaskForUser(
  user: AuthenticatedUser,
  taskId: string,
  newDueAt: Date,
  transaction?: DatabaseTransaction,
) {
  return runInTransaction(transaction, async (tx) => {
    const task = await lockEditableTask(tx, user, taskId, "Nie masz uprawnień do zmiany terminu tego zadania.");
    const [assignee, [recurrence]] = await Promise.all([
      reminderSettingsForUser(tx, task.assigneeId),
      tx.select().from(taskRecurrences).where(eq(taskRecurrences.taskId, task.id)).limit(1),
    ]);
    const now = new Date();
    await updateLockedTask(tx, task, { dueAt: newDueAt }, now);
    await tx.insert(taskDueDateHistory).values({
      taskId: task.id,
      changedById: user.id,
      previousDueAt: task.dueAt,
      newDueAt,
    });
    await replaceReminders(tx, task.id, newDueAt, assignee, now);
    if (recurrence) {
      await tx
        .update(taskRecurrences)
        .set({
          nextOccurrenceAt: nextRecurringDueAt(newDueAt, recurrence.rule, assignee.timeZone),
          updatedAt: now,
        })
        .where(eq(taskRecurrences.taskId, task.id));
    }
    await tx.insert(auditEvents).values({
      actorId: user.id,
      taskId: task.id,
      action: "TASK_RESCHEDULED",
      metadata: { previousDueAt: task.dueAt?.toISOString() ?? null, newDueAt: newDueAt.toISOString() },
    });
    return task.id;
  });
}

export async function shareTaskWithUser(
  user: AuthenticatedUser,
  taskId: string,
  targetUserId: string,
  transaction?: DatabaseTransaction,
) {
  return runInTransaction(transaction, async (tx) => {
    const task = await lockAuthoredTask(tx, user, taskId, "Tylko autor może udostępnić to zadanie.");
    if (user.roles.includes("EXTERNAL")) {
      throw new TaskInputError("Użytkownik zewnętrzny nie może udostępniać zadań dalej.");
    }
    const [targetUser] = await tx
      .select({ id: users.id, isActive: users.isActive })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);
    if (!targetUser?.isActive) throw new TaskInputError("Wybrana osoba nie jest aktywnym użytkownikiem.");
    if (targetUser.id === task.authorId || targetUser.id === task.assigneeId) {
      throw new TaskInputError("Wybrana osoba ma już dostęp do zadania.");
    }

    // A company task stays visible to the whole company; the share only adds one more person.
    const nextVisibility = task.visibility === "PRIVATE" ? "SHARED" : task.visibility;
    await updateLockedTask(tx, task, { visibility: nextVisibility });
    await tx
      .insert(taskShares)
      .values({ taskId: task.id, userId: targetUser.id })
      .onConflictDoNothing({ target: [taskShares.taskId, taskShares.userId] });
    await tx.insert(auditEvents).values({
      actorId: user.id,
      taskId: task.id,
      action: "TASK_SHARED_WITH_USER",
      metadata: { targetUserId: targetUser.id, previousVisibility: task.visibility, newVisibility: nextVisibility },
    });
    return task.id;
  });
}

export async function reassignTaskForUser(
  user: AuthenticatedUser,
  taskId: string,
  targetAssigneeId: string,
  transaction?: DatabaseTransaction,
) {
  return runInTransaction(transaction, async (tx) => {
    const task = await lockAuthoredTask(tx, user, taskId, "Tylko autor może przekazać to zadanie.");
    if (user.roles.includes("EXTERNAL")) {
      throw new TaskInputError("Użytkownik zewnętrzny nie może przekazywać zadań innym osobom.");
    }
    const [[targetAssignee], [recurrence], shares] = await Promise.all([
      tx
        .select({
          id: users.id,
          isActive: users.isActive,
          timeZone: users.timeZone,
          overdueReminderHour: users.overdueReminderHour,
        })
        .from(users)
        .where(eq(users.id, targetAssigneeId))
        .limit(1),
      tx.select().from(taskRecurrences).where(eq(taskRecurrences.taskId, task.id)).limit(1),
      tx
        .select({ userId: taskShares.userId, teamId: taskShares.teamId })
        .from(taskShares)
        .where(eq(taskShares.taskId, task.id)),
    ]);
    if (!targetAssignee?.isActive) throw new TaskInputError("Wybrany wykonawca nie jest aktywnym użytkownikiem.");
    if (targetAssignee.id === task.assigneeId) throw new TaskInputError("Wybrana osoba jest już wykonawcą zadania.");
    const targetRoles = await rolesForUser(tx, targetAssignee.id);
    if (task.visibility === "COMPANY" && !isCompanyUser(targetRoles)) {
      throw new TaskInputError("Zadanie firmowe można przekazać wyłącznie użytkownikowi firmowemu.");
    }

    // The previous assignee keeps access through a direct share, unless they are the author.
    const keepsPreviousAssignee = task.assigneeId !== task.authorId;
    const remainingShares = shares.filter((share) => share.userId !== targetAssignee.id);
    const hasSharesAfter = remainingShares.length > 0 || keepsPreviousAssignee;
    const nextVisibility = task.visibility === "COMPANY" ? "COMPANY" : hasSharesAfter ? "SHARED" : "PRIVATE";
    const now = new Date();
    await updateLockedTask(
      tx,
      task,
      { assigneeId: targetAssignee.id, visibility: nextVisibility, plannedForDate: null },
      now,
    );
    await tx
      .delete(taskShares)
      .where(and(eq(taskShares.taskId, task.id), eq(taskShares.userId, targetAssignee.id)));
    if (keepsPreviousAssignee) {
      await tx
        .insert(taskShares)
        .values({ taskId: task.id, userId: task.assigneeId })
        .onConflictDoNothing({ target: [taskShares.taskId, taskShares.userId] });
    }
    await replaceReminders(tx, task.id, task.dueAt, targetAssignee, now);
    if (recurrence && task.dueAt) {
      await tx
        .update(taskRecurrences)
        .set({
          nextOccurrenceAt: nextRecurringDueAt(task.dueAt, recurrence.rule, targetAssignee.timeZone),
          updatedAt: now,
        })
        .where(eq(taskRecurrences.taskId, task.id));
    }
    await tx.insert(auditEvents).values({
      actorId: user.id,
      taskId: task.id,
      action: "TASK_REASSIGNED",
      metadata: {
        previousAssigneeId: task.assigneeId,
        newAssigneeId: targetAssignee.id,
        previousVisibility: task.visibility,
        newVisibility: nextVisibility,
        previousAssigneeKeepsAccess: keepsPreviousAssignee,
      },
    });
    return task.id;
  });
}

export async function setTaskPlannedForDateForUser(
  user: AuthenticatedUser,
  taskId: string,
  plannedForDate: string | null,
) {
  return runInTransaction(undefined, async (tx) => {
    const task = await lockActiveTask(tx, taskId);
    if (!task || task.assigneeId !== user.id) {
      throw new TaskInputError("Do swojego planu możesz dodać tylko aktywne zadanie przypisane do Ciebie.");
    }
    await updateLockedTask(tx, task, { plannedForDate });
    await tx.insert(auditEvents).values({
      actorId: user.id,
      taskId: task.id,
      action: plannedForDate ? "TASK_PLANNED_FOR_TODAY" : "TASK_REMOVED_FROM_TODAY_PLAN",
      metadata: { plannedForDate },
    });
    return task.id;
  });
}

export async function setTaskWaitingForUser(user: AuthenticatedUser, taskId: string, reason: string) {
  return runInTransaction(undefined, async (tx) => {
    const task = await lockEditableTask(tx, user, taskId, "Nie masz uprawnień do zmiany tego zadania.");
    await updateLockedTask(tx, task, { status: "WAITING", waitingReason: reason });
    await tx.insert(auditEvents).values({
      actorId: user.id,
      taskId: task.id,
      action: "TASK_WAITING",
      metadata: { reason },
    });
    return task.id;
  });
}

export async function resumeTaskForUser(user: AuthenticatedUser, taskId: string) {
  return runInTransaction(undefined, async (tx) => {
    const task = await lockEditableTask(tx, user, taskId, "Nie masz uprawnień do zmiany tego zadania.");
    if (task.status !== "WAITING") throw new TaskInputError("To zadanie nie jest wstrzymane.");
    await updateLockedTask(tx, task, { status: "OPEN", waitingReason: null });
    await tx.insert(auditEvents).values({ actorId: user.id, taskId: task.id, action: "TASK_RESUMED" });
    return task.id;
  });
}

export async function cancelTaskForUser(user: AuthenticatedUser, taskId: string) {
  return runInTransaction(undefined, async (tx) => {
    const task = await lockAuthoredTask(tx, user, taskId, "Tylko autor może anulować zadanie.");
    const now = new Date();
    await updateLockedTask(tx, task, { status: "CANCELED", waitingReason: null }, now);
    await tx
      .update(reminders)
      .set({ status: "CANCELED", updatedAt: now })
      .where(and(eq(reminders.taskId, task.id), eq(reminders.status, "SCHEDULED")));
    await tx.insert(auditEvents).values({ actorId: user.id, taskId: task.id, action: "TASK_CANCELED" });
    return task.id;
  });
}

export async function updateTaskRecurrenceForUser(
  user: AuthenticatedUser,
  taskId: string,
  rule: RecurrenceRule,
) {
  return runInTransaction(undefined, async (tx) => {
    const task = await lockAuthoredTask(tx, user, taskId, "Tylko autor może zmienić cykl zadania.");
    if (!task.dueAt) throw new TaskInputError("Zadanie cykliczne musi mieć termin.");
    const assignee = await reminderSettingsForUser(tx, task.assigneeId);
    const now = new Date();
    const nextOccurrenceAt = nextRecurringDueAt(task.dueAt, rule, assignee.timeZone);
    await tx
      .insert(taskRecurrences)
      .values({ taskId: task.id, rule, nextOccurrenceAt, isPaused: false })
      .onConflictDoUpdate({
        target: taskRecurrences.taskId,
        set: { rule, nextOccurrenceAt, isPaused: false, updatedAt: now },
      });
    await updateLockedTask(tx, task, {}, now);
    await tx.insert(auditEvents).values({
      actorId: user.id,
      taskId: task.id,
      action: "TASK_RECURRENCE_UPDATED",
      metadata: { rule },
    });
    return task.id;
  });
}

export async function setTaskRecurrencePausedForUser(user: AuthenticatedUser, taskId: string, paused: boolean) {
  return runInTransaction(undefined, async (tx) => {
    const task = await lockAuthoredTask(tx, user, taskId, "Tylko autor może wstrzymać cykl zadania.");
    const [updated] = await tx
      .update(taskRecurrences)
      .set({ isPaused: paused, updatedAt: new Date() })
      .where(eq(taskRecurrences.taskId, task.id))
      .returning({ taskId: taskRecurrences.taskId });
    if (!updated) throw new TaskInputError("To zadanie nie ma ustawionego cyklu.");
    await tx.insert(auditEvents).values({
      actorId: user.id,
      taskId: task.id,
      action: paused ? "TASK_RECURRENCE_PAUSED" : "TASK_RECURRENCE_RESUMED",
    });
    return task.id;
  });
}

export async function updateTaskSharesForUser(
  user: AuthenticatedUser,
  taskId: string,
  userIds: string[],
  teamIds: string[],
) {
  return runInTransaction(undefined, async (tx) => {
    const task = await lockAuthoredTask(tx, user, taskId, "Tylko autor może zmienić udostępnienie.");
    if (user.roles.includes("EXTERNAL")) {
      throw new TaskInputError("Użytkownik zewnętrzny nie może udostępniać zadań dalej.");
    }
    if (task.visibility !== "SHARED") throw new TaskInputError("To zadanie nie ma widoczności udostępnionej.");
    const uniqueUserIds = [...new Set(userIds)].filter((id) => id !== task.authorId && id !== task.assigneeId);
    const uniqueTeamIds = [...new Set(teamIds)];
    if (!uniqueUserIds.length && !uniqueTeamIds.length) {
      throw new TaskInputError("Wybierz przynajmniej jedną osobę lub zespół.");
    }
    await validateShareTargets(tx, user, uniqueUserIds, uniqueTeamIds);
    await tx.delete(taskShares).where(eq(taskShares.taskId, task.id));
    await tx.insert(taskShares).values([
      ...uniqueUserIds.map((userId) => ({ taskId: task.id, userId })),
      ...uniqueTeamIds.map((teamId) => ({ taskId: task.id, teamId })),
    ]);
    await updateLockedTask(tx, task, {});
    await tx.insert(auditEvents).values({
      actorId: user.id,
      taskId: task.id,
      action: "TASK_SHARES_UPDATED",
      metadata: { sharedUsers: uniqueUserIds.length, sharedTeams: uniqueTeamIds.length },
    });
    return task.id;
  });
}

/**
 * Moves the scheduled daily overdue reminders of the user's active tasks to a new hour, e.g. after
 * the user changed the overdue reminder time in their settings.
 */
export async function rescheduleOverdueRemindersForAssignee(
  tx: DatabaseTransaction,
  userId: string,
  settings: { timeZone: string; overdueReminderHour: number },
  now = new Date(),
) {
  const pending = await tx
    .select({ reminderId: reminders.id, taskId: tasks.id, dueAt: tasks.dueAt })
    .from(reminders)
    .innerJoin(tasks, eq(reminders.taskId, tasks.id))
    .where(
      and(
        eq(tasks.assigneeId, userId),
        inArray(tasks.status, ACTIVE_TASK_STATUSES),
        eq(reminders.kind, "OVERDUE_DAILY"),
        eq(reminders.status, "SCHEDULED"),
      ),
    );
  for (const reminder of pending) {
    if (!reminder.dueAt) continue;
    const anchor = reminder.dueAt.getTime() > now.getTime() ? reminder.dueAt : now;
    const scheduledAt = nextDailyReminder(anchor, settings.timeZone, settings.overdueReminderHour);
    await tx
      .update(reminders)
      .set({ status: "CANCELED", updatedAt: now })
      .where(eq(reminders.id, reminder.reminderId));
    await tx
      .insert(reminders)
      .values({ taskId: reminder.taskId, kind: "OVERDUE_DAILY", scheduledAt })
      .onConflictDoUpdate({
        target: [reminders.taskId, reminders.kind, reminders.scheduledAt],
        set: { status: "SCHEDULED", attemptCount: 0, processedAt: null, lastError: null, updatedAt: now },
      });
  }
  return pending.length;
}

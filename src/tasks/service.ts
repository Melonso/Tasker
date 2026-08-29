import { and, eq, inArray } from "drizzle-orm";

import type { AuthenticatedUser } from "@/auth/session";
import { getDatabaseClient } from "@/db/client";
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
import { buildReminderSchedule, zonedDateTimeToUtc } from "@/domain/reminders";
import { nextRecurringDueAt, type RecurrenceRule } from "@/domain/recurrence";

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

export class TaskInputError extends Error {}

export function dueAtFromInput(
  dueDate: string | undefined,
  dueTime: string | undefined,
  user: Pick<AuthenticatedUser, "defaultTaskHour" | "timeZone">,
) {
  if (!dueDate) return null;
  const [year, month, day] = dueDate.split("-").map(Number);
  const [hour, minute] = dueTime ? dueTime.split(":").map(Number) : [user.defaultTaskHour, 0];
  return zonedDateTimeToUtc({ year, month, day, hour, minute }, user.timeZone);
}

async function rolesForUser(userId: string) {
  const { db } = getDatabaseClient();
  const rows = await db
    .select({ role: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, userId));
  return rows.map((row) => row.role);
}

export async function createTaskForUser(user: AuthenticatedUser, input: CreateTaskInput) {
  const { db } = getDatabaseClient();
  const [assignee] = await db
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

  const assigneeRoles = await rolesForUser(assignee.id);
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
  if (shareUserIds.length) {
    const sharedUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.id, shareUserIds), eq(users.isActive, true)));
    if (sharedUsers.length !== shareUserIds.length) {
      throw new TaskInputError("Co najmniej jedna wybrana osoba nie jest dostępna.");
    }
  }
  if (shareTeamIds.length) {
    const sharedTeams = await db
      .select({ id: teams.id })
      .from(teams)
      .where(and(inArray(teams.id, shareTeamIds), eq(teams.createdById, user.id)));
    if (sharedTeams.length !== shareTeamIds.length) {
      throw new TaskInputError("Co najmniej jeden wybrany zespół nie jest dostępny.");
    }
  }

  return db.transaction(async (tx) => {
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

    if (input.dueAt) {
      const schedule = buildReminderSchedule({
        dueAt: input.dueAt,
        now: new Date(),
        timeZone: assignee.timeZone,
        overdueReminderHour: assignee.overdueReminderHour,
      });
      if (schedule.length) {
        await tx.insert(reminders).values(
          schedule.map((item) => ({ taskId: task.id, kind: item.kind, scheduledAt: item.scheduledAt })),
        );
      }
    }

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
        sharedUsers: shareUserIds.length,
        sharedTeams: shareTeamIds.length,
      },
    });
    return task.id;
  });
}

export async function completeTaskForUser(user: AuthenticatedUser, taskId: string) {
  const { db } = getDatabaseClient();
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), inArray(tasks.status, ["OPEN", "WAITING"])))
    .limit(1);
  if (!task || (task.authorId !== user.id && task.assigneeId !== user.id)) {
    throw new TaskInputError("Nie masz uprawnień do zakończenia tego zadania.");
  }

  const [[recurrence], [assignee], shares] = await Promise.all([
    db.select().from(taskRecurrences).where(eq(taskRecurrences.taskId, task.id)).limit(1),
    db
      .select({
        timeZone: users.timeZone,
        overdueReminderHour: users.overdueReminderHour,
      })
      .from(users)
      .where(eq(users.id, task.assigneeId))
      .limit(1),
    db.select({ userId: taskShares.userId, teamId: taskShares.teamId }).from(taskShares).where(eq(taskShares.taskId, task.id)),
  ]);
  if (!assignee) throw new TaskInputError("Nie znaleziono wykonawcy zadania.");

  return db.transaction(async (tx) => {
    const now = new Date();
    await tx
      .update(tasks)
      .set({
        status: "COMPLETED",
        completedAt: now,
        completedById: user.id,
        updatedAt: now,
        version: task.version + 1,
      })
      .where(eq(tasks.id, task.id));
    await tx
      .update(reminders)
      .set({ status: "CANCELED", updatedAt: now })
      .where(and(eq(reminders.taskId, task.id), eq(reminders.status, "SCHEDULED")));
    await tx.insert(auditEvents).values({ actorId: user.id, taskId: task.id, action: "TASK_COMPLETED" });

    let nextTaskId: string | null = null;
    if (recurrence && !recurrence.isPaused && task.dueAt) {
      const nextDueAt = recurrence.nextOccurrenceAt ?? nextRecurringDueAt(task.dueAt, recurrence.rule, assignee.timeZone);
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
      const schedule = buildReminderSchedule({
        dueAt: nextDueAt,
        now,
        timeZone: assignee.timeZone,
        overdueReminderHour: assignee.overdueReminderHour,
      });
      if (schedule.length) {
        await tx.insert(reminders).values(
          schedule.map((item) => ({ taskId: nextTask.id, kind: item.kind, scheduledAt: item.scheduledAt })),
        );
      }
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

export async function rescheduleTaskForUser(user: AuthenticatedUser, taskId: string, newDueAt: Date) {
  const { db } = getDatabaseClient();
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), inArray(tasks.status, ["OPEN", "WAITING"])))
    .limit(1);
  if (!task || (task.authorId !== user.id && task.assigneeId !== user.id)) {
    throw new TaskInputError("Nie masz uprawnień do zmiany terminu tego zadania.");
  }
  const [[assignee], [recurrence]] = await Promise.all([
    db
      .select({ timeZone: users.timeZone, overdueReminderHour: users.overdueReminderHour })
      .from(users)
      .where(eq(users.id, task.assigneeId))
      .limit(1),
    db.select().from(taskRecurrences).where(eq(taskRecurrences.taskId, task.id)).limit(1),
  ]);
  if (!assignee) throw new TaskInputError("Nie znaleziono wykonawcy zadania.");
  await db.transaction(async (tx) => {
    await tx
      .update(tasks)
      .set({ dueAt: newDueAt, updatedAt: new Date(), version: task.version + 1 })
      .where(eq(tasks.id, task.id));
    await tx.insert(taskDueDateHistory).values({
      taskId: task.id,
      changedById: user.id,
      previousDueAt: task.dueAt,
      newDueAt,
    });
    await tx
      .update(reminders)
      .set({ status: "CANCELED", updatedAt: new Date() })
      .where(and(eq(reminders.taskId, task.id), eq(reminders.status, "SCHEDULED")));
    const schedule = buildReminderSchedule({
      dueAt: newDueAt,
      now: new Date(),
      timeZone: assignee.timeZone,
      overdueReminderHour: assignee.overdueReminderHour,
    });
    if (schedule.length) {
      await tx
        .insert(reminders)
        .values(schedule.map((item) => ({ taskId: task.id, kind: item.kind, scheduledAt: item.scheduledAt })))
        .onConflictDoUpdate({
          target: [reminders.taskId, reminders.kind, reminders.scheduledAt],
          set: { status: "SCHEDULED", attemptCount: 0, processedAt: null, lastError: null, updatedAt: new Date() },
        });
    }
    if (recurrence) {
      await tx
        .update(taskRecurrences)
        .set({
          nextOccurrenceAt: nextRecurringDueAt(newDueAt, recurrence.rule, assignee.timeZone),
          updatedAt: new Date(),
        })
        .where(eq(taskRecurrences.taskId, task.id));
    }
    await tx.insert(auditEvents).values({
      actorId: user.id,
      taskId: task.id,
      action: "TASK_RESCHEDULED",
      metadata: { previousDueAt: task.dueAt?.toISOString() ?? null, newDueAt: newDueAt.toISOString() },
    });
  });
  return task.id;
}

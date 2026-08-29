"use server";

import { and, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/auth/session";
import { getDatabaseClient } from "@/db/client";
import {
  auditEvents,
  reminders,
  taskComments,
  taskRecurrences,
  taskShares,
  tasks,
  teams,
  users,
} from "@/db/schema";
import { nextRecurringDueAt } from "@/domain/recurrence";
import { canAccessStoredTask } from "./queries";
import { completeTaskForUser, createTaskForUser, dueAtFromInput, rescheduleTaskForUser, TaskInputError } from "./service";

const taskSchema = z.object({
  title: z.string().trim().min(3, "Tytuł musi zawierać co najmniej 3 znaki.").max(300),
  description: z.string().trim().max(5_000).optional(),
  assigneeId: z.uuid(),
  visibility: z.enum(["PRIVATE", "COMPANY", "SHARED"]),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  dueTime: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
  recurrenceFrequency: z.enum(["NONE", "DAILY", "WEEKLY", "MONTHLY"]),
  recurrenceInterval: z.coerce.number().int().min(1).max(365),
});

const rescheduleSchema = z.object({
  taskId: z.uuid(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueTime: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
});

const waitingSchema = z.object({
  taskId: z.uuid(),
  reason: z.string().trim().min(3, "Podaj krótki powód oczekiwania.").max(500),
});

const taskIdSchema = z.object({ taskId: z.uuid() });

const commentSchema = z.object({
  taskId: z.uuid(),
  body: z.string().trim().min(1, "Komentarz nie może być pusty.").max(2_000),
});

const recurrenceSchema = z.object({
  taskId: z.uuid(),
  frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
  interval: z.coerce.number().int().min(1).max(365),
});

export interface TaskFormState {
  error?: string;
}

export async function createTaskAction(
  _state: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  const user = await requireUser();
  const parsed = taskSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    assigneeId: formData.get("assigneeId"),
    visibility: formData.get("visibility"),
    priority: formData.get("priority"),
    dueDate: formData.get("dueDate"),
    dueTime: formData.get("dueTime"),
    recurrenceFrequency: formData.get("recurrenceFrequency") || "NONE",
    recurrenceInterval: formData.get("recurrenceInterval") || 1,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Nieprawidłowe dane zadania." };

  const dueAt = dueAtFromInput(parsed.data.dueDate, parsed.data.dueTime, user);
  try {
    await createTaskForUser(user, {
      title: parsed.data.title,
      description: parsed.data.description,
      assigneeId: parsed.data.assigneeId,
      visibility: parsed.data.visibility,
      priority: parsed.data.priority,
      dueAt,
      source: "WEB",
      recurrenceRule: parsed.data.recurrenceFrequency !== "NONE"
        ? {
            frequency: parsed.data.recurrenceFrequency,
            interval: parsed.data.recurrenceInterval,
          }
        : null,
      shareUserIds: formData.getAll("shareUserIds").map(String),
      shareTeamIds: formData.getAll("shareTeamIds").map(String),
    });
  } catch (error) {
    if (error instanceof TaskInputError) return { error: error.message };
    throw error;
  }

  revalidatePath("/");
  redirect("/");
}

async function editableTask(taskId: string, userId: string) {
  const { db } = getDatabaseClient();
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), inArray(tasks.status, ["OPEN", "WAITING"])))
    .limit(1);
  if (!task || (task.authorId !== userId && task.assigneeId !== userId)) {
    throw new Error("Nie masz uprawnień do zmiany tego zadania.");
  }
  return task;
}

export async function completeTaskAction(formData: FormData) {
  const user = await requireUser();
  const taskId = z.uuid().parse(formData.get("taskId"));
  await completeTaskForUser(user, taskId);
  revalidatePath("/");
}

export async function rescheduleTaskAction(formData: FormData) {
  const user = await requireUser();
  const parsed = rescheduleSchema.parse({
    taskId: formData.get("taskId"),
    dueDate: formData.get("dueDate"),
    dueTime: formData.get("dueTime"),
  });
  const task = await editableTask(parsed.taskId, user.id);
  const newDueAt = dueAtFromInput(parsed.dueDate, parsed.dueTime, user);
  if (!newDueAt) throw new Error("Nowy termin jest wymagany.");
  await rescheduleTaskForUser(user, task.id, newDueAt);
  revalidatePath("/");
  revalidatePath(`/tasks/${task.id}`);
}

export async function waitTaskAction(formData: FormData) {
  const user = await requireUser();
  const parsed = waitingSchema.parse({ taskId: formData.get("taskId"), reason: formData.get("reason") });
  const task = await editableTask(parsed.taskId, user.id);
  const { db } = getDatabaseClient();
  await db.transaction(async (tx) => {
    await tx
      .update(tasks)
      .set({ status: "WAITING", waitingReason: parsed.reason, updatedAt: new Date(), version: task.version + 1 })
      .where(eq(tasks.id, task.id));
    await tx.insert(auditEvents).values({
      actorId: user.id,
      taskId: task.id,
      action: "TASK_WAITING",
      metadata: { reason: parsed.reason },
    });
  });
  revalidatePath("/");
  revalidatePath(`/tasks/${task.id}`);
}

export async function resumeTaskAction(formData: FormData) {
  const user = await requireUser();
  const { taskId } = taskIdSchema.parse({ taskId: formData.get("taskId") });
  const task = await editableTask(taskId, user.id);
  const { db } = getDatabaseClient();
  await db.transaction(async (tx) => {
    await tx
      .update(tasks)
      .set({ status: "OPEN", waitingReason: null, updatedAt: new Date(), version: task.version + 1 })
      .where(eq(tasks.id, task.id));
    await tx.insert(auditEvents).values({ actorId: user.id, taskId: task.id, action: "TASK_RESUMED" });
  });
  revalidatePath("/");
  revalidatePath(`/tasks/${task.id}`);
}

export async function cancelTaskAction(formData: FormData) {
  const user = await requireUser();
  const { taskId } = taskIdSchema.parse({ taskId: formData.get("taskId") });
  const task = await editableTask(taskId, user.id);
  if (task.authorId !== user.id) throw new Error("Tylko autor może anulować zadanie.");
  const { db } = getDatabaseClient();
  await db.transaction(async (tx) => {
    await tx
      .update(tasks)
      .set({ status: "CANCELED", waitingReason: null, updatedAt: new Date(), version: task.version + 1 })
      .where(eq(tasks.id, task.id));
    await tx
      .update(reminders)
      .set({ status: "CANCELED", updatedAt: new Date() })
      .where(and(eq(reminders.taskId, task.id), eq(reminders.status, "SCHEDULED")));
    await tx.insert(auditEvents).values({ actorId: user.id, taskId: task.id, action: "TASK_CANCELED" });
  });
  revalidatePath("/");
  revalidatePath(`/tasks/${task.id}`);
}

export async function addTaskCommentAction(formData: FormData) {
  const user = await requireUser();
  const parsed = commentSchema.parse({ taskId: formData.get("taskId"), body: formData.get("body") });
  if (!(await canAccessStoredTask(user, parsed.taskId))) {
    throw new Error("Nie masz uprawnień do komentowania tego zadania.");
  }
  const { db } = getDatabaseClient();
  await db.transaction(async (tx) => {
    await tx.insert(taskComments).values({ taskId: parsed.taskId, authorId: user.id, body: parsed.body });
    await tx.insert(auditEvents).values({
      actorId: user.id,
      taskId: parsed.taskId,
      action: "TASK_COMMENT_ADDED",
    });
  });
  revalidatePath(`/tasks/${parsed.taskId}`);
}

export async function updateTaskRecurrenceAction(formData: FormData) {
  const user = await requireUser();
  const parsed = recurrenceSchema.parse({
    taskId: formData.get("taskId"),
    frequency: formData.get("frequency"),
    interval: formData.get("interval"),
  });
  const task = await editableTask(parsed.taskId, user.id);
  if (task.authorId !== user.id) throw new Error("Tylko autor może zmienić cykl zadania.");
  if (!task.dueAt) throw new Error("Zadanie cykliczne musi mieć termin.");
  const { db } = getDatabaseClient();
  const [assignee] = await db
    .select({ timeZone: users.timeZone })
    .from(users)
    .where(eq(users.id, task.assigneeId))
    .limit(1);
  if (!assignee) throw new Error("Nie znaleziono wykonawcy zadania.");
  const rule = { frequency: parsed.frequency, interval: parsed.interval };
  await db.transaction(async (tx) => {
    await tx
      .insert(taskRecurrences)
      .values({
        taskId: task.id,
        rule,
        nextOccurrenceAt: nextRecurringDueAt(task.dueAt!, rule, assignee.timeZone),
        isPaused: false,
      })
      .onConflictDoUpdate({
        target: taskRecurrences.taskId,
        set: {
          rule,
          nextOccurrenceAt: nextRecurringDueAt(task.dueAt!, rule, assignee.timeZone),
          isPaused: false,
          updatedAt: new Date(),
        },
      });
    await tx.insert(auditEvents).values({
      actorId: user.id,
      taskId: task.id,
      action: "TASK_RECURRENCE_UPDATED",
      metadata: { rule },
    });
  });
  revalidatePath("/");
  revalidatePath(`/tasks/${task.id}`);
}

async function setTaskRecurrencePaused(formData: FormData, paused: boolean) {
  const user = await requireUser();
  const { taskId } = taskIdSchema.parse({ taskId: formData.get("taskId") });
  const task = await editableTask(taskId, user.id);
  if (task.authorId !== user.id) throw new Error("Tylko autor może wstrzymać cykl zadania.");
  const { db } = getDatabaseClient();
  const [updated] = await db
    .update(taskRecurrences)
    .set({ isPaused: paused, updatedAt: new Date() })
    .where(eq(taskRecurrences.taskId, task.id))
    .returning({ taskId: taskRecurrences.taskId });
  if (!updated) throw new Error("To zadanie nie ma ustawionego cyklu.");
  await db.insert(auditEvents).values({
    actorId: user.id,
    taskId: task.id,
    action: paused ? "TASK_RECURRENCE_PAUSED" : "TASK_RECURRENCE_RESUMED",
  });
  revalidatePath("/");
  revalidatePath(`/tasks/${task.id}`);
}

export async function pauseTaskRecurrenceAction(formData: FormData) {
  await setTaskRecurrencePaused(formData, true);
}

export async function resumeTaskRecurrenceAction(formData: FormData) {
  await setTaskRecurrencePaused(formData, false);
}

export async function updateTaskSharesAction(formData: FormData) {
  const user = await requireUser();
  const taskId = z.uuid().parse(formData.get("taskId"));
  const task = await editableTask(taskId, user.id);
  if (task.authorId !== user.id) throw new Error("Tylko autor może zmienić udostępnienie.");
  if (task.visibility !== "SHARED") throw new Error("To zadanie nie ma widoczności udostępnionej.");
  const userIds = z.array(z.uuid()).parse(formData.getAll("shareUserIds").map(String));
  const teamIds = z.array(z.uuid()).parse(formData.getAll("shareTeamIds").map(String));
  const uniqueUserIds = [...new Set(userIds)].filter((id) => id !== task.authorId && id !== task.assigneeId);
  const uniqueTeamIds = [...new Set(teamIds)];
  if (!uniqueUserIds.length && !uniqueTeamIds.length) {
    throw new Error("Wybierz przynajmniej jedną osobę lub zespół.");
  }
  const { db } = getDatabaseClient();
  const [availableUsers, availableTeams] = await Promise.all([
    uniqueUserIds.length
      ? db.select({ id: users.id }).from(users).where(and(inArray(users.id, uniqueUserIds), eq(users.isActive, true)))
      : Promise.resolve([]),
    uniqueTeamIds.length
      ? db.select({ id: teams.id }).from(teams).where(and(inArray(teams.id, uniqueTeamIds), eq(teams.createdById, user.id)))
      : Promise.resolve([]),
  ]);
  if (availableUsers.length !== uniqueUserIds.length || availableTeams.length !== uniqueTeamIds.length) {
    throw new Error("Co najmniej jeden odbiorca nie jest dostępny.");
  }
  await db.transaction(async (tx) => {
    await tx.delete(taskShares).where(eq(taskShares.taskId, task.id));
    await tx.insert(taskShares).values([
      ...uniqueUserIds.map((userId) => ({ taskId: task.id, userId })),
      ...uniqueTeamIds.map((teamId) => ({ taskId: task.id, teamId })),
    ]);
    await tx.insert(auditEvents).values({
      actorId: user.id,
      taskId: task.id,
      action: "TASK_SHARES_UPDATED",
      metadata: { sharedUsers: uniqueUserIds.length, sharedTeams: uniqueTeamIds.length },
    });
  });
  revalidatePath(`/tasks/${task.id}`);
}

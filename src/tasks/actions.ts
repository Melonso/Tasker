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
  taskDueDateHistory,
  tasks,
  users,
} from "@/db/schema";
import { buildReminderSchedule } from "@/domain/reminders";
import { canAccessStoredTask } from "./queries";
import { createTaskForUser, dueAtFromInput, TaskInputError } from "./service";

const taskSchema = z.object({
  title: z.string().trim().min(3, "Tytuł musi zawierać co najmniej 3 znaki.").max(300),
  description: z.string().trim().max(5_000).optional(),
  assigneeId: z.uuid(),
  visibility: z.enum(["PRIVATE", "COMPANY", "SHARED"]),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  dueTime: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
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
  await editableTask(taskId, user.id);

  const { db } = getDatabaseClient();
  await db.transaction(async (tx) => {
    await tx
      .update(tasks)
      .set({ status: "COMPLETED", completedAt: new Date(), completedById: user.id, updatedAt: new Date() })
      .where(eq(tasks.id, taskId));
    await tx
      .update(reminders)
      .set({ status: "CANCELED", updatedAt: new Date() })
      .where(and(eq(reminders.taskId, taskId), eq(reminders.status, "SCHEDULED")));
    await tx.insert(auditEvents).values({ actorId: user.id, taskId, action: "TASK_COMPLETED" });
  });
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

  const { db } = getDatabaseClient();
  const [assigneePreferences] = await db
    .select({ timeZone: users.timeZone, overdueReminderHour: users.overdueReminderHour })
    .from(users)
    .where(eq(users.id, task.assigneeId))
    .limit(1);
  if (!assigneePreferences) throw new Error("Nie znaleziono wykonawcy zadania.");
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
      timeZone: assigneePreferences.timeZone,
      overdueReminderHour: assigneePreferences.overdueReminderHour,
    });
    if (schedule.length) {
      await tx
        .insert(reminders)
        .values(
          schedule.map((item) => ({ taskId: task.id, kind: item.kind, scheduledAt: item.scheduledAt })),
        )
        .onConflictDoUpdate({
          target: [reminders.taskId, reminders.kind, reminders.scheduledAt],
          set: {
            status: "SCHEDULED",
            attemptCount: 0,
            processedAt: null,
            lastError: null,
            updatedAt: new Date(),
          },
        });
    }
    await tx.insert(auditEvents).values({
      actorId: user.id,
      taskId: task.id,
      action: "TASK_RESCHEDULED",
      metadata: { previousDueAt: task.dueAt?.toISOString() ?? null, newDueAt: newDueAt.toISOString() },
    });
  });
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

"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/auth/session";
import { getDatabaseClient } from "@/db/client";
import { auditEvents, taskComments, tasks } from "@/db/schema";
import { localDateKey, localDateKeyAfterDays, localTimeKey } from "./presentation";
import { canAccessStoredTask } from "./queries";
import {
  cancelTaskForUser,
  completeTaskForUser,
  createTaskForUser,
  dueAtFromInput,
  rescheduleTaskForUser,
  resumeTaskForUser,
  setTaskPlannedForDateForUser,
  setTaskRecurrencePausedForUser,
  setTaskWaitingForUser,
  TaskInputError,
  updateTaskRecurrenceForUser,
  updateTaskSharesForUser,
} from "./service";

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
  planForToday: z.boolean(),
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
    planForToday: formData.get("planForToday") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Nieprawidłowe dane zadania." };
  if (parsed.data.planForToday && parsed.data.assigneeId !== user.id) {
    return { error: "Do własnego planu dnia możesz dodać tylko zadanie przypisane do Ciebie." };
  }

  const shareIds = z
    .object({ users: z.array(z.uuid()), teams: z.array(z.uuid()) })
    .safeParse({
      users: formData.getAll("shareUserIds").map(String),
      teams: formData.getAll("shareTeamIds").map(String),
    });
  if (!shareIds.success) return { error: "Nieprawidłowa lista osób lub zespołów do udostępnienia." };

  const dueAt = dueAtFromInput(parsed.data.dueDate, parsed.data.dueTime, user);
  try {
    await createTaskForUser(user, {
      title: parsed.data.title,
      description: parsed.data.description,
      assigneeId: parsed.data.assigneeId,
      visibility: parsed.data.visibility,
      priority: parsed.data.priority,
      dueAt,
      plannedForDate: parsed.data.planForToday ? localDateKey(new Date(), user.timeZone) : null,
      source: "WEB",
      recurrenceRule: parsed.data.recurrenceFrequency !== "NONE"
        ? {
            frequency: parsed.data.recurrenceFrequency,
            interval: parsed.data.recurrenceInterval,
          }
        : null,
      shareUserIds: shareIds.data.users,
      shareTeamIds: shareIds.data.teams,
    });
  } catch (error) {
    if (error instanceof TaskInputError) return { error: error.message };
    throw error;
  }

  revalidatePath("/");
  redirect("/");
}

export async function completeTaskAction(formData: FormData) {
  const user = await requireUser();
  const taskId = z.uuid().parse(formData.get("taskId"));
  await completeTaskForUser(user, taskId);
  revalidatePath("/");
  revalidatePath(`/tasks/${taskId}`);
}

export async function rescheduleTaskAction(formData: FormData) {
  const user = await requireUser();
  const parsed = rescheduleSchema.parse({
    taskId: formData.get("taskId"),
    dueDate: formData.get("dueDate"),
    dueTime: formData.get("dueTime"),
  });
  const newDueAt = dueAtFromInput(parsed.dueDate, parsed.dueTime, user);
  if (!newDueAt) throw new TaskInputError("Nowy termin jest wymagany.");
  await rescheduleTaskForUser(user, parsed.taskId, newDueAt);
  revalidatePath("/");
  revalidatePath(`/tasks/${parsed.taskId}`);
}

export async function rescheduleTaskPresetAction(formData: FormData) {
  const user = await requireUser();
  const taskId = z.uuid().parse(formData.get("taskId"));
  const preset = z.enum(["TOMORROW", "NEXT_WEEK"]).parse(formData.get("preset"));
  const { db } = getDatabaseClient();
  const [task] = await db.select({ dueAt: tasks.dueAt }).from(tasks).where(eq(tasks.id, taskId)).limit(1);
  const dueDate = localDateKeyAfterDays(new Date(), user.timeZone, preset === "TOMORROW" ? 1 : 7);
  const dueTime = task?.dueAt ? localTimeKey(task.dueAt, user.timeZone) : undefined;
  const newDueAt = dueAtFromInput(dueDate, dueTime, user);
  if (!newDueAt) throw new TaskInputError("Nie udało się wyznaczyć nowego terminu.");
  await rescheduleTaskForUser(user, taskId, newDueAt);
  revalidatePath("/");
  revalidatePath(`/tasks/${taskId}`);
}

export async function setTaskPlannedForTodayAction(formData: FormData) {
  const user = await requireUser();
  const taskId = z.uuid().parse(formData.get("taskId"));
  const planned = z.enum(["true", "false"]).parse(formData.get("planned")) === "true";
  await setTaskPlannedForDateForUser(user, taskId, planned ? localDateKey(new Date(), user.timeZone) : null);
  revalidatePath("/");
  revalidatePath(`/tasks/${taskId}`);
}

export async function waitTaskAction(formData: FormData) {
  const user = await requireUser();
  const parsed = waitingSchema.parse({ taskId: formData.get("taskId"), reason: formData.get("reason") });
  await setTaskWaitingForUser(user, parsed.taskId, parsed.reason);
  revalidatePath("/");
  revalidatePath(`/tasks/${parsed.taskId}`);
}

export async function resumeTaskAction(formData: FormData) {
  const user = await requireUser();
  const { taskId } = taskIdSchema.parse({ taskId: formData.get("taskId") });
  await resumeTaskForUser(user, taskId);
  revalidatePath("/");
  revalidatePath(`/tasks/${taskId}`);
}

export async function cancelTaskAction(formData: FormData) {
  const user = await requireUser();
  const { taskId } = taskIdSchema.parse({ taskId: formData.get("taskId") });
  await cancelTaskForUser(user, taskId);
  revalidatePath("/");
  revalidatePath(`/tasks/${taskId}`);
}

export async function addTaskCommentAction(formData: FormData) {
  const user = await requireUser();
  const parsed = commentSchema.parse({ taskId: formData.get("taskId"), body: formData.get("body") });
  if (!(await canAccessStoredTask(user, parsed.taskId))) {
    throw new TaskInputError("Nie masz uprawnień do komentowania tego zadania.");
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
  await updateTaskRecurrenceForUser(user, parsed.taskId, { frequency: parsed.frequency, interval: parsed.interval });
  revalidatePath("/");
  revalidatePath(`/tasks/${parsed.taskId}`);
}

export async function pauseTaskRecurrenceAction(formData: FormData) {
  const user = await requireUser();
  const { taskId } = taskIdSchema.parse({ taskId: formData.get("taskId") });
  await setTaskRecurrencePausedForUser(user, taskId, true);
  revalidatePath("/");
  revalidatePath(`/tasks/${taskId}`);
}

export async function resumeTaskRecurrenceAction(formData: FormData) {
  const user = await requireUser();
  const { taskId } = taskIdSchema.parse({ taskId: formData.get("taskId") });
  await setTaskRecurrencePausedForUser(user, taskId, false);
  revalidatePath("/");
  revalidatePath(`/tasks/${taskId}`);
}

export async function updateTaskSharesAction(formData: FormData) {
  const user = await requireUser();
  const taskId = z.uuid().parse(formData.get("taskId"));
  const userIds = z.array(z.uuid()).parse(formData.getAll("shareUserIds").map(String));
  const teamIds = z.array(z.uuid()).parse(formData.getAll("shareTeamIds").map(String));
  await updateTaskSharesForUser(user, taskId, userIds, teamIds);
  revalidatePath("/");
  revalidatePath(`/tasks/${taskId}`);
}

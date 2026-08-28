import { eq } from "drizzle-orm";

import type { AuthenticatedUser } from "@/auth/session";
import { getDatabaseClient } from "@/db/client";
import { auditEvents, reminders, roles, tasks, userRoles, users } from "@/db/schema";
import { buildReminderSchedule, zonedDateTimeToUtc } from "@/domain/reminders";

import { isCompanyUser } from "./policy";

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  assigneeId: string;
  visibility: "PRIVATE" | "COMPANY" | "SHARED";
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  dueAt: Date | null;
  source?: "WEB" | "TELEGRAM" | "API";
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

    await tx.insert(auditEvents).values({
      actorId: user.id,
      taskId: task.id,
      action: "TASK_CREATED",
      metadata: {
        assigneeId: assignee.id,
        dueAt: input.dueAt?.toISOString() ?? null,
        source: input.source ?? "WEB",
      },
    });
    return task.id;
  });
}

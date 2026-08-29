import { and, asc, eq, inArray, or } from "drizzle-orm";

import type { AuthenticatedUser } from "@/auth/session";
import { getDatabaseClient } from "@/db/client";
import {
  auditEvents,
  type CreateTaskDraftPayload,
  type TaskActionDraftPayload,
  taskCommandDrafts,
  tasks,
} from "@/db/schema";
import { dateTimePartsInZone, zonedDateTimeToUtc } from "@/domain/reminders";
import { listAssignableUsers } from "@/tasks/queries";
import { dueAtFromInput } from "@/tasks/service";
import { matchTaskByQuery } from "./task-matching";

export const TASK_DRAFT_DURATION_MS = 30 * 60 * 1000;

export interface CreateTaskDraftInput {
  sourceEventId: string;
  sourceText?: string;
  title: string;
  description?: string;
  assignee?: string;
  dueDate?: string;
  dueTime?: string;
  visibility: "PRIVATE" | "COMPANY" | "SHARED";
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
}

export interface CreateTaskActionDraftInput {
  sourceEventId: string;
  intent: "COMPLETE_TASK" | "RESCHEDULE_TASK";
  taskQuery: string;
  dueDate?: string;
  dueTime?: string;
}

function normalizePerson(value: string) {
  return value.trim().toLocaleLowerCase("pl-PL").replace(/\s+/g, " ");
}

export function commandAssignsAuthor(sourceText: string | undefined) {
  if (!sourceText) return false;
  const normalized = sourceText.toLocaleLowerCase("pl-PL").replace(/[,.!?;:()]/g, " ").replace(/\s+/g, " ");
  return /(?:^|\s)(?:żebym|abym|bym)(?:\s|$)/u.test(normalized);
}

export function taskDraftExpiresAt(now = new Date()) {
  return new Date(now.getTime() + TASK_DRAFT_DURATION_MS);
}

export async function createTaskDraft(user: AuthenticatedUser, input: CreateTaskDraftInput) {
  const assignees = await listAssignableUsers(user);
  const requestedAssignee = commandAssignsAuthor(input.sourceText) ? "" : input.assignee;
  const query = normalizePerson(requestedAssignee || `${user.firstName} ${user.lastName}`);
  const exactMatches = assignees.filter((person) => {
    const fullName = normalizePerson(`${person.firstName} ${person.lastName}`);
    return fullName === query || normalizePerson(person.email) === query;
  });
  const firstNameMatches = assignees.filter(
    (person) => normalizePerson(person.firstName) === query,
  );
  const matches = exactMatches.length ? exactMatches : firstNameMatches;
  const assignee = matches.length === 1 ? matches[0] : null;
  const clarification = assignee
    ? null
    : matches.length > 1
      ? `Niejednoznaczny wykonawca „${requestedAssignee}”. Podaj imię i nazwisko.`
      : `Nie znaleziono wykonawcy „${requestedAssignee || ""}”.`;
  const dueAt = input.dueDate ? dueAtFromInput(input.dueDate, input.dueTime, user) : null;
  const payload: CreateTaskDraftPayload = {
    intent: "CREATE_TASK",
    title: input.title,
    description: input.description || null,
    assigneeId: assignee?.id ?? null,
    assigneeName: assignee ? `${assignee.firstName} ${assignee.lastName}` : null,
    dueAt: dueAt?.toISOString() ?? null,
    visibility: input.visibility,
    priority: input.priority,
    clarification,
  };
  const status = clarification ? "NEEDS_CLARIFICATION" : "DRAFT";
  const { db } = getDatabaseClient();
  const [inserted] = await db
    .insert(taskCommandDrafts)
    .values({
      userId: user.id,
      source: "TELEGRAM",
      sourceEventId: input.sourceEventId,
      status,
      payload,
      expiresAt: taskDraftExpiresAt(),
    })
    .onConflictDoNothing({
      target: [taskCommandDrafts.source, taskCommandDrafts.sourceEventId],
    })
    .returning({ id: taskCommandDrafts.id });

  const [draft] = await db
    .select()
    .from(taskCommandDrafts)
    .where(
      and(
        eq(taskCommandDrafts.source, "TELEGRAM"),
        eq(taskCommandDrafts.sourceEventId, input.sourceEventId),
      ),
    )
    .limit(1);
  if (!draft || draft.userId !== user.id) throw new Error("Source event is already assigned.");
  if (inserted) {
    await db.insert(auditEvents).values({
      actorId: user.id,
      action: "TASK_DRAFT_CREATED",
      metadata: { draftId: draft.id, source: "TELEGRAM", status: draft.status },
    });
  }
  return draft;
}

export async function createTaskActionDraft(user: AuthenticatedUser, input: CreateTaskActionDraftInput) {
  const { db } = getDatabaseClient();
  const candidates = await db
    .select({ id: tasks.id, title: tasks.title })
    .from(tasks)
    .where(
      and(
        inArray(tasks.status, ["OPEN", "WAITING"]),
        or(eq(tasks.authorId, user.id), eq(tasks.assigneeId, user.id)),
      ),
    )
    .orderBy(asc(tasks.dueAt), asc(tasks.createdAt));
  const resolution = matchTaskByQuery(candidates, input.taskQuery);
  const task = resolution.task;
  const dueAt = input.intent === "RESCHEDULE_TASK" && input.dueDate
    ? dueAtFromInput(input.dueDate, input.dueTime, user)
    : null;
  let clarification: string | null = null;
  if (!task) {
    const suggestions = resolution.ranked.map((match, index) => `${index + 1}. ${match.task.title}`).join("\n");
    clarification = resolution.ambiguous
      ? `Znalazłem kilka podobnych zadań. Napisz charakterystyczny fragment tytułu:\n${suggestions}`
      : suggestions
        ? `Nie mam pewności, o które zadanie chodzi. Najbliższe wyniki:\n${suggestions}`
        : `Nie znaleziono aktywnego zadania pasującego do „${input.taskQuery}”.`;
  } else if (input.intent === "RESCHEDULE_TASK" && !dueAt) {
    clarification = "Podaj nową datę zadania.";
  }
  const payload: TaskActionDraftPayload = {
    intent: input.intent,
    taskId: task?.id ?? null,
    taskTitle: task?.title ?? null,
    dueAt: dueAt?.toISOString() ?? null,
    clarification,
  };
  const status = clarification ? "NEEDS_CLARIFICATION" : "DRAFT";
  const [inserted] = await db
    .insert(taskCommandDrafts)
    .values({
      userId: user.id,
      source: "TELEGRAM",
      sourceEventId: input.sourceEventId,
      status,
      payload,
      expiresAt: taskDraftExpiresAt(),
    })
    .onConflictDoNothing({ target: [taskCommandDrafts.source, taskCommandDrafts.sourceEventId] })
    .returning({ id: taskCommandDrafts.id });
  const [draft] = await db
    .select()
    .from(taskCommandDrafts)
    .where(and(eq(taskCommandDrafts.source, "TELEGRAM"), eq(taskCommandDrafts.sourceEventId, input.sourceEventId)))
    .limit(1);
  if (!draft || draft.userId !== user.id) throw new Error("Source event is already assigned.");
  if (inserted) {
    await db.insert(auditEvents).values({
      actorId: user.id,
      taskId: task?.id,
      action: "TASK_DRAFT_CREATED",
      metadata: { draftId: draft.id, source: "TELEGRAM", status, intent: input.intent },
    });
  }
  return draft;
}

export async function telegramTaskSummary(user: AuthenticatedUser, view: "TODAY" | "OVERDUE") {
  const now = new Date();
  const local = dateTimePartsInZone(now, user.timeZone);
  const start = zonedDateTimeToUtc({ year: local.year, month: local.month, day: local.day, hour: 0 }, user.timeZone);
  const nextDate = new Date(Date.UTC(local.year, local.month - 1, local.day + 1));
  const end = zonedDateTimeToUtc(
    { year: nextDate.getUTCFullYear(), month: nextDate.getUTCMonth() + 1, day: nextDate.getUTCDate(), hour: 0 },
    user.timeZone,
  );
  const { db } = getDatabaseClient();
  const rows = await db
    .select({ id: tasks.id, title: tasks.title, dueAt: tasks.dueAt, priority: tasks.priority })
    .from(tasks)
    .where(and(eq(tasks.assigneeId, user.id), inArray(tasks.status, ["OPEN", "WAITING"])))
    .orderBy(asc(tasks.dueAt), asc(tasks.createdAt));
  return rows
    .filter((task) => task.dueAt && (view === "OVERDUE"
      ? task.dueAt < now
      : task.dueAt >= start && task.dueAt < end))
    .slice(0, 20);
}

export function draftResponse(draft: typeof taskCommandDrafts.$inferSelect) {
  if (draft.payload.intent !== "CREATE_TASK") {
    return {
      kind: "DRAFT" as const,
      id: draft.id,
      status: draft.status,
      expiresAt: draft.expiresAt.toISOString(),
      preview: {
        intent: draft.payload.intent,
        title: draft.payload.taskTitle,
        dueAt: draft.payload.dueAt,
      },
      clarification: draft.payload.clarification,
      taskId: draft.taskId ?? draft.payload.taskId,
    };
  }
  return {
    kind: "DRAFT" as const,
    id: draft.id,
    status: draft.status,
    expiresAt: draft.expiresAt.toISOString(),
    preview: {
      title: draft.payload.title,
      description: draft.payload.description,
      assignee: draft.payload.assigneeName,
      dueAt: draft.payload.dueAt,
      visibility: draft.payload.visibility,
      priority: draft.payload.priority,
    },
    clarification: draft.payload.clarification,
    taskId: draft.taskId,
  };
}

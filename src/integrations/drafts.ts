import { and, asc, eq, inArray, or } from "drizzle-orm";

import type { AuthenticatedUser } from "@/auth/session";
import { getDatabaseClient } from "@/db/client";
import {
  auditEvents,
  type CreateTaskDraftPayload,
  type TaskActionDraftPayload,
  taskCommandDrafts,
  taskShares,
  tasks,
} from "@/db/schema";
import { dateTimePartsInZone, zonedDateTimeToUtc } from "@/domain/reminders";
import { listAssignableUsers, listTasksForView, type TaskView } from "@/tasks/queries";
import { dueAtFromInput } from "@/tasks/service";
import { matchTaskByQuery } from "./task-matching";

export const TASK_DRAFT_DURATION_MS = 30 * 60 * 1000;

export interface CreateTaskDraftInput {
  sourceEventId: string;
  sourceText?: string;
  title: string;
  description?: string;
  assignee?: string;
  shareWith?: string;
  dueDate?: string;
  dueTime?: string;
  visibility: "PRIVATE" | "COMPANY" | "SHARED";
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
}

interface TaskActionDraftBaseInput {
  sourceEventId: string;
  taskQuery: string;
}

export type CreateTaskActionDraftInput = TaskActionDraftBaseInput & ({
  intent: "COMPLETE_TASK" | "RESCHEDULE_TASK";
  dueDate?: string;
  dueTime?: string;
} | {
  intent: "SHARE_TASK" | "REASSIGN_TASK";
  assignee: string;
});

interface AssignablePerson {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

function normalizePerson(value: string) {
  return value.trim().toLocaleLowerCase("pl-PL").replace(/\s+/g, " ");
}

export function matchAssignablePerson(people: AssignablePerson[], requestedPerson: string) {
  const query = normalizePerson(requestedPerson);
  const exactMatches = people.filter((person) => {
    const fullName = normalizePerson(`${person.firstName} ${person.lastName}`);
    return fullName === query || normalizePerson(person.email) === query;
  });
  const firstNameMatches = people.filter(
    (person) => normalizePerson(person.firstName) === query,
  );
  const matches = exactMatches.length ? exactMatches : firstNameMatches;
  return {
    person: matches.length === 1 ? matches[0] : null,
    matchCount: matches.length,
    clarification: matches.length > 1
      ? `Niejednoznaczna osoba „${requestedPerson}”. Podaj imię i nazwisko.`
      : matches.length === 0
        ? `Nie znaleziono osoby „${requestedPerson}”.`
        : null,
  };
}

export function resolveCreateTaskShare(
  people: AssignablePerson[],
  requestedPerson: string | undefined,
  authorId: string,
  assigneeId: string | null,
  visibility: "PRIVATE" | "COMPANY" | "SHARED",
) {
  const shareWith = requestedPerson?.trim() ?? "";
  const wantsSharing = visibility === "SHARED" || Boolean(shareWith);
  if (!wantsSharing) return { person: null, visibility, clarification: null };
  if (!shareWith) {
    return {
      person: null,
      visibility: "SHARED" as const,
      clarification: "Podaj osobę, której chcesz udostępnić zadanie.",
    };
  }
  const resolution = matchAssignablePerson(people, shareWith);
  if (resolution.clarification || !resolution.person) {
    return { person: null, visibility: "SHARED" as const, clarification: resolution.clarification };
  }
  if (resolution.person.id === authorId || resolution.person.id === assigneeId) {
    return {
      person: null,
      visibility: "SHARED" as const,
      clarification: `${resolution.person.firstName} ${resolution.person.lastName} ma już dostęp do tego zadania.`,
    };
  }
  return { person: resolution.person, visibility: "SHARED" as const, clarification: null };
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
  const assigneeResolution = matchAssignablePerson(
    assignees,
    requestedAssignee || `${user.firstName} ${user.lastName}`,
  );
  const assignee = assigneeResolution.person;
  const assigneeClarification = assignee
    ? null
    : assigneeResolution.matchCount > 1
      ? `Niejednoznaczny wykonawca „${requestedAssignee}”. Podaj imię i nazwisko.`
      : `Nie znaleziono wykonawcy „${requestedAssignee || ""}”.`;
  const shareResolution = resolveCreateTaskShare(
    assignees,
    input.shareWith,
    user.id,
    assignee?.id ?? null,
    input.visibility,
  );
  const clarification = assigneeClarification ?? shareResolution.clarification;
  const dueAt = input.dueDate ? dueAtFromInput(input.dueDate, input.dueTime, user) : null;
  const payload: CreateTaskDraftPayload = {
    intent: "CREATE_TASK",
    title: input.title,
    description: input.description || null,
    assigneeId: assignee?.id ?? null,
    assigneeName: assignee ? `${assignee.firstName} ${assignee.lastName}` : null,
    sharedUserId: shareResolution.person?.id ?? null,
    sharedUserName: shareResolution.person
      ? `${shareResolution.person.firstName} ${shareResolution.person.lastName}`
      : null,
    dueAt: dueAt?.toISOString() ?? null,
    visibility: shareResolution.visibility,
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
  const changesPeople = input.intent === "SHARE_TASK" || input.intent === "REASSIGN_TASK";
  const candidates = await db
    .select({ id: tasks.id, title: tasks.title, authorId: tasks.authorId, assigneeId: tasks.assigneeId })
    .from(tasks)
    .where(
      and(
        inArray(tasks.status, ["OPEN", "WAITING"]),
        changesPeople
          ? eq(tasks.authorId, user.id)
          : or(eq(tasks.authorId, user.id), eq(tasks.assigneeId, user.id)),
      ),
    )
    .orderBy(asc(tasks.dueAt), asc(tasks.createdAt));
  const resolution = matchTaskByQuery(candidates, input.taskQuery);
  const task = resolution.task;
  const dueAt = input.intent === "RESCHEDULE_TASK" && input.dueDate
    ? dueAtFromInput(input.dueDate, input.dueTime, user)
    : null;
  const targetResolution = changesPeople
    ? matchAssignablePerson(await listAssignableUsers(user), input.assignee)
    : { person: null, matchCount: 0, clarification: null };
  const targetUser = targetResolution.person;
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
  } else if (changesPeople && targetResolution.clarification) {
    clarification = targetResolution.clarification;
  } else if (input.intent === "REASSIGN_TASK" && targetUser?.id === task.assigneeId) {
    clarification = `${targetUser.firstName} ${targetUser.lastName} jest już wykonawcą tego zadania.`;
  } else if (input.intent === "SHARE_TASK" && targetUser && (targetUser.id === task.authorId || targetUser.id === task.assigneeId)) {
    clarification = `${targetUser.firstName} ${targetUser.lastName} ma już dostęp do tego zadania.`;
  } else if (input.intent === "SHARE_TASK" && targetUser) {
    const [existingShare] = await db
      .select({ id: taskShares.id })
      .from(taskShares)
      .where(and(eq(taskShares.taskId, task.id), eq(taskShares.userId, targetUser.id)))
      .limit(1);
    if (existingShare) clarification = `${targetUser.firstName} ${targetUser.lastName} ma już dostęp do tego zadania.`;
  }
  const payload: TaskActionDraftPayload = {
    intent: input.intent,
    taskId: task?.id ?? null,
    taskTitle: task?.title ?? null,
    dueAt: dueAt?.toISOString() ?? null,
    targetUserId: targetUser?.id ?? null,
    targetUserName: targetUser ? `${targetUser.firstName} ${targetUser.lastName}` : null,
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

export type TelegramTaskSummaryView = "TODAY" | "TOMORROW" | "OVERDUE";

export function telegramSummaryBounds(now: Date, timeZone: string, view: TelegramTaskSummaryView) {
  const local = dateTimePartsInZone(now, timeZone);
  const dayOffset = view === "TOMORROW" ? 1 : 0;
  const targetDate = new Date(Date.UTC(local.year, local.month - 1, local.day + dayOffset));
  const start = zonedDateTimeToUtc({
    year: targetDate.getUTCFullYear(),
    month: targetDate.getUTCMonth() + 1,
    day: targetDate.getUTCDate(),
    hour: 0,
  }, timeZone);
  const nextDate = new Date(Date.UTC(local.year, local.month - 1, local.day + dayOffset + 1));
  const end = zonedDateTimeToUtc(
    { year: nextDate.getUTCFullYear(), month: nextDate.getUTCMonth() + 1, day: nextDate.getUTCDate(), hour: 0 },
    timeZone,
  );
  return { start, end };
}

export async function telegramTaskSummary(user: AuthenticatedUser, view: TelegramTaskSummaryView) {
  const now = new Date();
  const { start, end } = telegramSummaryBounds(now, user.timeZone, view);
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

const telegramOverviewViews = ["current", "waiting", "delegated", "recurring"] as const satisfies readonly TaskView[];

export async function telegramTaskOverview(user: AuthenticatedUser) {
  const rowsByView = await Promise.all(telegramOverviewViews.map(async (view) => {
    const rows = await listTasksForView(user, view);
    return [view, rows.map((task) => ({
      id: task.id,
      title: task.title,
      dueAt: task.dueAt,
      priority: task.priority,
      assignee: `${task.assigneeFirstName} ${task.assigneeLastName}`,
    }))] as const;
  }));
  return Object.fromEntries(rowsByView) as Record<(typeof telegramOverviewViews)[number], Array<{
    id: string;
    title: string;
    dueAt: Date | null;
    priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
    assignee: string;
  }>>;
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
        targetUser: draft.payload.targetUserName,
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
      shareWith: draft.payload.sharedUserName,
      dueAt: draft.payload.dueAt,
      visibility: draft.payload.visibility,
      priority: draft.payload.priority,
    },
    clarification: draft.payload.clarification,
    taskId: draft.taskId,
  };
}

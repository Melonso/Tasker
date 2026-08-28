import { and, eq } from "drizzle-orm";

import type { AuthenticatedUser } from "@/auth/session";
import { getDatabaseClient } from "@/db/client";
import {
  auditEvents,
  type CreateTaskDraftPayload,
  taskCommandDrafts,
} from "@/db/schema";
import { listAssignableUsers } from "@/tasks/queries";
import { dueAtFromInput } from "@/tasks/service";

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

export function draftResponse(draft: typeof taskCommandDrafts.$inferSelect) {
  return {
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

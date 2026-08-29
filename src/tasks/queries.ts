import { and, asc, desc, eq, isNotNull, lte, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { AuthenticatedUser } from "@/auth/session";
import { getDatabaseClient } from "@/db/client";
import {
  taskComments,
  taskDueDateHistory,
  taskRecurrences,
  tasks,
  taskShares,
  teamMembers,
  teams,
  users,
} from "@/db/schema";
import { zonedDateTimeToUtc } from "@/domain/reminders";
import { localDateKey } from "./presentation";

import { isCompanyUser } from "./policy";

export type TaskView = "today" | "current" | "waiting" | "delegated" | "recurring" | "done";

export function accessCondition(user: AuthenticatedUser) {
  const directConditions = [
    eq(tasks.authorId, user.id),
    eq(tasks.assigneeId, user.id),
    eq(taskShares.userId, user.id),
    eq(teamMembers.userId, user.id),
  ];
  if (isCompanyUser(user.roles)) directConditions.push(eq(tasks.visibility, "COMPANY"));
  return or(...directConditions);
}

export async function canAccessStoredTask(user: AuthenticatedUser, taskId: string) {
  const { db } = getDatabaseClient();
  const [row] = await db
    .selectDistinct({ id: tasks.id })
    .from(tasks)
    .leftJoin(taskShares, eq(tasks.id, taskShares.taskId))
    .leftJoin(teamMembers, and(eq(taskShares.teamId, teamMembers.teamId), eq(teamMembers.userId, user.id)))
    .where(and(eq(tasks.id, taskId), accessCondition(user)))
    .limit(1);
  return Boolean(row);
}

export async function getTaskDetails(user: AuthenticatedUser, taskId: string) {
  const { db } = getDatabaseClient();
  const author = alias(users, "author");
  const assignee = alias(users, "detail_assignee");
  const commentAuthor = alias(users, "comment_author");
  const dueDateChanger = alias(users, "due_date_changer");

  const [task] = await db
    .selectDistinct({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      visibility: tasks.visibility,
      priority: tasks.priority,
      dueAt: tasks.dueAt,
      waitingReason: tasks.waitingReason,
      completedAt: tasks.completedAt,
      authorId: tasks.authorId,
      assigneeId: tasks.assigneeId,
      authorFirstName: author.firstName,
      authorLastName: author.lastName,
      authorAvatarDataUrl: author.avatarDataUrl,
      assigneeFirstName: assignee.firstName,
      assigneeLastName: assignee.lastName,
      assigneeAvatarDataUrl: assignee.avatarDataUrl,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
    })
    .from(tasks)
    .innerJoin(author, eq(tasks.authorId, author.id))
    .innerJoin(assignee, eq(tasks.assigneeId, assignee.id))
    .leftJoin(taskShares, eq(tasks.id, taskShares.taskId))
    .leftJoin(teamMembers, and(eq(taskShares.teamId, teamMembers.teamId), eq(teamMembers.userId, user.id)))
    .where(and(eq(tasks.id, taskId), accessCondition(user)))
    .limit(1);
  if (!task) return null;

  const [comments, dueDateHistory, [recurrence], shareRows] = await Promise.all([
    db
      .select({
        id: taskComments.id,
        body: taskComments.body,
        createdAt: taskComments.createdAt,
        authorId: taskComments.authorId,
        authorFirstName: commentAuthor.firstName,
        authorLastName: commentAuthor.lastName,
        authorAvatarDataUrl: commentAuthor.avatarDataUrl,
      })
      .from(taskComments)
      .innerJoin(commentAuthor, eq(taskComments.authorId, commentAuthor.id))
      .where(eq(taskComments.taskId, taskId))
      .orderBy(asc(taskComments.createdAt)),
    db
      .select({
        id: taskDueDateHistory.id,
        previousDueAt: taskDueDateHistory.previousDueAt,
        newDueAt: taskDueDateHistory.newDueAt,
        changedAt: taskDueDateHistory.changedAt,
        changedByFirstName: dueDateChanger.firstName,
        changedByLastName: dueDateChanger.lastName,
      })
      .from(taskDueDateHistory)
      .innerJoin(dueDateChanger, eq(taskDueDateHistory.changedById, dueDateChanger.id))
      .where(eq(taskDueDateHistory.taskId, taskId))
      .orderBy(desc(taskDueDateHistory.changedAt)),
    db.select().from(taskRecurrences).where(eq(taskRecurrences.taskId, taskId)).limit(1),
    db
      .select({
        userId: taskShares.userId,
        userFirstName: users.firstName,
        userLastName: users.lastName,
        teamId: taskShares.teamId,
        teamName: teams.name,
      })
      .from(taskShares)
      .leftJoin(users, eq(taskShares.userId, users.id))
      .leftJoin(teams, eq(taskShares.teamId, teams.id))
      .where(eq(taskShares.taskId, taskId)),
  ]);

  return { ...task, comments, dueDateHistory, recurrence: recurrence ?? null, shares: shareRows };
}

function viewCondition(user: AuthenticatedUser, view: Exclude<TaskView, "today">) {
  switch (view) {
    case "current":
      return and(eq(tasks.assigneeId, user.id), eq(tasks.status, "OPEN"));
    case "waiting":
      return eq(tasks.status, "WAITING");
    case "delegated":
      return and(eq(tasks.authorId, user.id), ne(tasks.assigneeId, user.id), or(eq(tasks.status, "OPEN"), eq(tasks.status, "WAITING")));
    case "recurring":
      return and(isNotNull(taskRecurrences.taskId), or(eq(tasks.status, "OPEN"), eq(tasks.status, "WAITING")));
    case "done":
      return eq(tasks.status, "COMPLETED");
  }
}

export async function listTasksForView(user: AuthenticatedUser, view: TaskView) {
  const { db } = getDatabaseClient();
  const assignee = alias(users, "assignee");
  const now = new Date();

  let viewFilter;
  if (view === "today") {
    const localDate = localDateKey(now, user.timeZone);
    const [year, month, day] = localDate.split("-").map(Number);
    const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
    const endOfDay = new Date(
      zonedDateTimeToUtc(
        {
          year: nextDay.getUTCFullYear(),
          month: nextDay.getUTCMonth() + 1,
          day: nextDay.getUTCDate(),
          hour: 0,
        },
        user.timeZone,
      ).getTime() - 1,
    );
    viewFilter = and(
      eq(tasks.assigneeId, user.id),
      eq(tasks.status, "OPEN"),
      or(
        and(isNotNull(tasks.dueAt), lte(tasks.dueAt, endOfDay)),
        eq(tasks.plannedForDate, localDate),
      ),
    );
  } else {
    viewFilter = viewCondition(user, view);
  }

  return db
    .selectDistinct({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      visibility: tasks.visibility,
      priority: tasks.priority,
      dueAt: tasks.dueAt,
      plannedForDate: tasks.plannedForDate,
      authorId: tasks.authorId,
      assigneeId: tasks.assigneeId,
      assigneeFirstName: assignee.firstName,
      assigneeLastName: assignee.lastName,
      assigneeAvatarDataUrl: assignee.avatarDataUrl,
      recurrenceRule: taskRecurrences.rule,
      recurrencePaused: taskRecurrences.isPaused,
      waitingReason: tasks.waitingReason,
      completedAt: tasks.completedAt,
      createdAt: tasks.createdAt,
      isOverdue: sql<boolean>`${tasks.dueAt} is not null and ${tasks.dueAt} < now() and ${tasks.status} <> 'COMPLETED'`,
    })
    .from(tasks)
    .innerJoin(assignee, eq(tasks.assigneeId, assignee.id))
    .leftJoin(taskShares, eq(tasks.id, taskShares.taskId))
    .leftJoin(teamMembers, and(eq(taskShares.teamId, teamMembers.teamId), eq(teamMembers.userId, user.id)))
    .leftJoin(taskRecurrences, eq(tasks.id, taskRecurrences.taskId))
    .where(and(accessCondition(user), viewFilter))
    .orderBy(asc(tasks.dueAt), desc(tasks.createdAt));
}

export async function listAssignableUsers(user: AuthenticatedUser) {
  const { db } = getDatabaseClient();
  if (user.roles.includes("EXTERNAL")) {
    return db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        avatarDataUrl: users.avatarDataUrl,
      })
      .from(users)
      .where(eq(users.id, user.id));
  }

  return db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      avatarDataUrl: users.avatarDataUrl,
    })
    .from(users)
    .where(eq(users.isActive, true))
    .orderBy(asc(users.firstName), asc(users.lastName));
}

export async function listTeamsForSharing(user: AuthenticatedUser) {
  if (!user.roles.includes("BUSINESS_OWNER")) return [];
  const { db } = getDatabaseClient();
  return db
    .select({ id: teams.id, name: teams.name, isExternal: teams.isExternal })
    .from(teams)
    .where(eq(teams.createdById, user.id))
    .orderBy(asc(teams.name));
}

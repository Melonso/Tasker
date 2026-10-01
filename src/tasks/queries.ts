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
import { avatarUrlColumn } from "@/users/avatar-url";
import { zonedDateTimeToUtc } from "@/domain/reminders";
import { localDateKey } from "./presentation";

import { isCompanyUser } from "./policy";

export type TaskView = "today" | "current" | "waiting" | "delegated" | "recurring" | "done";

/** Number of most recently completed tasks shown in the archive view. */
export const DONE_VIEW_LIMIT = 100;

/**
 * The single access rule for tasks: the author, the assignee, company members for company tasks,
 * and everyone the task is shared with directly or through a team. A share grants access whatever
 * the visibility, so a company task can also be shared with an external person.
 */
export function accessCondition(user: Pick<AuthenticatedUser, "id" | "roles">) {
  const conditions = [
    eq(tasks.authorId, user.id),
    eq(tasks.assigneeId, user.id),
    sql`exists (
      select 1
      from ${taskShares}
      left join ${teamMembers}
        on ${teamMembers.teamId} = ${taskShares.teamId} and ${teamMembers.userId} = ${user.id}
      where ${taskShares.taskId} = ${tasks.id}
        and (${taskShares.userId} = ${user.id} or ${teamMembers.userId} is not null)
    )`,
  ];
  if (isCompanyUser(user.roles)) conditions.push(eq(tasks.visibility, "COMPANY"));
  return or(...conditions);
}

export async function canAccessStoredTask(user: AuthenticatedUser, taskId: string) {
  const { db } = getDatabaseClient();
  const [row] = await db
    .select({ id: tasks.id })
    .from(tasks)
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
    .select({
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
      authorAvatarUrl: avatarUrlColumn(author),
      assigneeFirstName: assignee.firstName,
      assigneeLastName: assignee.lastName,
      assigneeAvatarUrl: avatarUrlColumn(assignee),
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
    })
    .from(tasks)
    .innerJoin(author, eq(tasks.authorId, author.id))
    .innerJoin(assignee, eq(tasks.assigneeId, assignee.id))
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
        authorAvatarUrl: avatarUrlColumn(commentAuthor),
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

  const query = db
    .select({
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
      assigneeAvatarUrl: avatarUrlColumn(assignee),
      recurrenceRule: taskRecurrences.rule,
      recurrencePaused: taskRecurrences.isPaused,
      waitingReason: tasks.waitingReason,
      completedAt: tasks.completedAt,
      createdAt: tasks.createdAt,
      isOverdue: sql<boolean>`${tasks.dueAt} is not null and ${tasks.dueAt} < now() and ${tasks.status} <> 'COMPLETED'`,
    })
    .from(tasks)
    .innerJoin(assignee, eq(tasks.assigneeId, assignee.id))
    .leftJoin(taskRecurrences, eq(tasks.id, taskRecurrences.taskId))
    .where(and(accessCondition(user), viewFilter));
  if (view === "done") return query.orderBy(desc(tasks.completedAt), desc(tasks.createdAt)).limit(DONE_VIEW_LIMIT);
  return query.orderBy(asc(tasks.dueAt), desc(tasks.createdAt));
}

/** Counters for the dashboard summary, computed in one aggregate query instead of loading lists. */
export async function countTasksByView(user: AuthenticatedUser) {
  const { db } = getDatabaseClient();
  const active = sql`${tasks.status} in ('OPEN', 'WAITING')`;
  const [row] = await db
    .select({
      current: sql<number>`count(*) filter (where ${tasks.assigneeId} = ${user.id} and ${tasks.status} = 'OPEN')`.mapWith(Number),
      overdue: sql<number>`count(*) filter (
        where ${tasks.assigneeId} = ${user.id} and ${tasks.status} = 'OPEN' and ${tasks.dueAt} < now()
      )`.mapWith(Number),
      waiting: sql<number>`count(*) filter (where ${tasks.status} = 'WAITING')`.mapWith(Number),
      delegated: sql<number>`count(*) filter (
        where ${tasks.authorId} = ${user.id} and ${tasks.assigneeId} <> ${user.id} and ${active}
      )`.mapWith(Number),
      done: sql<number>`count(*) filter (where ${tasks.status} = 'COMPLETED')`.mapWith(Number),
    })
    .from(tasks)
    .where(accessCondition(user));
  return row ?? { current: 0, overdue: 0, waiting: 0, delegated: 0, done: 0 };
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
        avatarUrl: avatarUrlColumn(users),
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
      avatarUrl: avatarUrlColumn(users),
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

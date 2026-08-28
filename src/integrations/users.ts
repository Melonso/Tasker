import { eq } from "drizzle-orm";

import type { AuthenticatedUser } from "@/auth/session";
import { getDatabaseClient } from "@/db/client";
import { roles, telegramConnections, userRoles, users } from "@/db/schema";

export async function userForTelegramId(telegramUserId: string): Promise<AuthenticatedUser | null> {
  const { db } = getDatabaseClient();
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      avatarDataUrl: users.avatarDataUrl,
      timeZone: users.timeZone,
      defaultTaskHour: users.defaultTaskHour,
      overdueReminderHour: users.overdueReminderHour,
      language: users.language,
      isActive: users.isActive,
      role: roles.key,
    })
    .from(telegramConnections)
    .innerJoin(users, eq(telegramConnections.userId, users.id))
    .leftJoin(userRoles, eq(users.id, userRoles.userId))
    .leftJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(telegramConnections.telegramUserId, telegramUserId));
  const first = rows[0];
  if (!first?.isActive) return null;
  return {
    id: first.id,
    email: first.email,
    firstName: first.firstName,
    lastName: first.lastName,
    avatarDataUrl: first.avatarDataUrl,
    timeZone: first.timeZone,
    defaultTaskHour: first.defaultTaskHour,
    overdueReminderHour: first.overdueReminderHour,
    language: first.language,
    roles: rows.flatMap((row) => (row.role ? [row.role] : [])),
  };
}

export async function userForId(userId: string): Promise<AuthenticatedUser | null> {
  const { db } = getDatabaseClient();
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      avatarDataUrl: users.avatarDataUrl,
      timeZone: users.timeZone,
      defaultTaskHour: users.defaultTaskHour,
      overdueReminderHour: users.overdueReminderHour,
      language: users.language,
      isActive: users.isActive,
      role: roles.key,
    })
    .from(users)
    .leftJoin(userRoles, eq(users.id, userRoles.userId))
    .leftJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(users.id, userId));
  const first = rows[0];
  if (!first?.isActive) return null;
  return {
    id: first.id,
    email: first.email,
    firstName: first.firstName,
    lastName: first.lastName,
    avatarDataUrl: first.avatarDataUrl,
    timeZone: first.timeZone,
    defaultTaskHour: first.defaultTaskHour,
    overdueReminderHour: first.overdueReminderHour,
    language: first.language,
    roles: rows.flatMap((row) => (row.role ? [row.role] : [])),
  };
}

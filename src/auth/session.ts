import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";

import { getDatabaseClient } from "@/db/client";
import { roles, sessions, userRoles, users } from "@/db/schema";

const SESSION_COOKIE = "tasker_session";
const SESSION_DURATION_SECONDS = 30 * 24 * 60 * 60;

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarDataUrl: string | null;
  timeZone: string;
  defaultTaskHour: number;
  overdueReminderHour: number;
  language: string;
  roles: string[];
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_SECONDS * 1000);
  const { db } = getDatabaseClient();
  await db.insert(sessions).values({ userId, tokenHash: hashSessionToken(token), expiresAt });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function deleteCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    const { db } = getDatabaseClient();
    await db.delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(token)));
  }
  cookieStore.delete(SESSION_COOKIE);
}

export const getCurrentUser = cache(async (): Promise<AuthenticatedUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

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
      role: roles.key,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .leftJoin(userRoles, eq(users.id, userRoles.userId))
    .leftJoin(roles, eq(userRoles.roleId, roles.id))
    .where(
      and(
        eq(sessions.tokenHash, hashSessionToken(token)),
        gt(sessions.expiresAt, new Date()),
        eq(users.isActive, true),
      ),
    );

  const first = rows[0];
  if (!first) return null;

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
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(role: string) {
  const user = await requireUser();
  if (!user.roles.includes(role)) redirect("/");
  return user;
}

import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";

import { getDatabaseClient } from "@/db/client";
import { loginAttempts, users } from "@/db/schema";

import { hashPassword, verifyPassword } from "./password";

export const LOGIN_WINDOW_MINUTES = 15;
export const MAX_FAILED_LOGINS_PER_EMAIL = 5;
export const MAX_FAILED_LOGINS_PER_IP = 20;

export type LoginResult = { ok: true; userId: string } | { ok: false; reason: "INVALID" | "RATE_LIMITED" };

let dummyHash: Promise<string> | undefined;

/** A hash verified for unknown accounts so that every attempt costs the same time. */
function dummyPasswordHash() {
  dummyHash ??= hashPassword(randomBytes(24).toString("base64url"));
  return dummyHash;
}

async function recentFailures(email: string, ipAddress: string | null) {
  const { db } = getDatabaseClient();
  const window = sql`now() - make_interval(mins => ${LOGIN_WINDOW_MINUTES})`;
  const [row] = await db
    .select({
      byEmail: sql<number>`count(*) filter (
        where ${loginAttempts.email} = ${email}
          and ${loginAttempts.createdAt} > coalesce((
            select max(success.created_at) from login_attempts as success
            where success.email = ${email} and success.succeeded
          ), '-infinity'::timestamptz)
      )`.mapWith(Number),
      byIp: ipAddress
        ? sql<number>`count(*) filter (where ${loginAttempts.ipAddress} = ${ipAddress})`.mapWith(Number)
        : sql<number>`0`.mapWith(Number),
    })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.succeeded, false), sql`${loginAttempts.createdAt} > ${window}`));
  return row ?? { byEmail: 0, byIp: 0 };
}

export async function authenticateWithPassword(
  email: string,
  password: string,
  ipAddress: string | null,
): Promise<LoginResult> {
  const failures = await recentFailures(email, ipAddress);
  if (failures.byEmail >= MAX_FAILED_LOGINS_PER_EMAIL || failures.byIp >= MAX_FAILED_LOGINS_PER_IP) {
    return { ok: false, reason: "RATE_LIMITED" };
  }

  const { db } = getDatabaseClient();
  const [user] = await db
    .select({ id: users.id, isActive: users.isActive, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  const passwordMatches = await verifyPassword(password, user?.passwordHash ?? (await dummyPasswordHash()));
  const succeeded = Boolean(user?.isActive && user.passwordHash && passwordMatches);
  await db.insert(loginAttempts).values({ email, ipAddress, succeeded });
  return succeeded && user ? { ok: true, userId: user.id } : { ok: false, reason: "INVALID" };
}

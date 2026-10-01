import { randomUUID } from "node:crypto";
import { afterAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";

import type { AuthenticatedUser } from "@/auth/session";
import { getDatabaseClient } from "@/db/client";
import { roles, userRoles, users } from "@/db/schema";

import { assertTestDatabase } from "./integration-global-setup";

type RoleKey = "APP_ADMIN" | "BUSINESS_OWNER" | "COMPANY_MEMBER" | "EXTERNAL";

const roleLabels: Record<RoleKey, string> = {
  APP_ADMIN: "Administrator aplikacji",
  BUSINESS_OWNER: "Właściciel biznesowy",
  COMPANY_MEMBER: "Użytkownik firmowy",
  EXTERNAL: "Użytkownik zewnętrzny",
};

export async function resetDatabase() {
  assertTestDatabase(process.env.DATABASE_URL);
  const { db } = getDatabaseClient();
  const rows = await db.execute(sql`
    select tablename from pg_tables
    where schemaname = 'public' and tablename <> 'roles'
  `);
  const tables = rows.map((row) => `"${String(row.tablename)}"`);
  if (tables.length) await db.execute(sql.raw(`truncate ${tables.join(", ")} restart identity cascade`));
  await db
    .insert(roles)
    .values(Object.entries(roleLabels).map(([key, label]) => ({ key: key as RoleKey, label })))
    .onConflictDoNothing({ target: roles.key });
}

export async function createTestUser(
  options: { firstName?: string; lastName?: string; roles?: RoleKey[]; isActive?: boolean } = {},
): Promise<AuthenticatedUser> {
  const { db } = getDatabaseClient();
  const userRolesToAssign = options.roles ?? ["COMPANY_MEMBER"];
  const [user] = await db
    .insert(users)
    .values({
      email: `${randomUUID()}@example.test`,
      firstName: options.firstName ?? "Test",
      lastName: options.lastName ?? randomUUID().slice(0, 8),
      isActive: options.isActive ?? true,
    })
    .returning();
  if (!user) throw new Error("Unable to create test user.");
  const storedRoles = await db.select().from(roles);
  for (const role of userRolesToAssign) {
    const roleId = storedRoles.find((stored) => stored.key === role)?.id;
    if (!roleId) throw new Error(`Missing role ${role}`);
    await db.insert(userRoles).values({ userId: user.id, roleId });
  }
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: null,
    timeZone: user.timeZone,
    defaultTaskHour: user.defaultTaskHour,
    overdueReminderHour: user.overdueReminderHour,
    language: user.language,
    roles: userRolesToAssign,
  };
}

export function setupIntegrationDatabase() {
  beforeEach(async () => {
    await resetDatabase();
  });
  afterAll(async () => {
    await getDatabaseClient().sql.end({ timeout: 5 });
  });
}

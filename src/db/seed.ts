import { eq } from "drizzle-orm";

import { createDatabaseClient } from "./client";
import { pilotUsers } from "../lib/pilot-users";
import { hashPassword } from "../auth/password";
import { getServerEnv } from "../lib/env";
import { roles, userRoles, users } from "./schema";

const roleDefinitions = [
  { key: "APP_ADMIN", label: "Administrator aplikacji" },
  { key: "BUSINESS_OWNER", label: "Właściciel biznesowy" },
  { key: "COMPANY_MEMBER", label: "Użytkownik firmowy" },
  { key: "EXTERNAL", label: "Użytkownik zewnętrzny" },
] as const;

const { db, sql } = createDatabaseClient(1);
const seedPassword = getServerEnv().SEED_PILOT_PASSWORD;
const passwordHash = seedPassword ? await hashPassword(seedPassword) : null;

try {
  await db.insert(roles).values([...roleDefinitions]).onConflictDoNothing({ target: roles.key });
  const storedRoles = await db.select().from(roles);
  const roleByKey = new Map(storedRoles.map((role) => [role.key, role.id]));

  for (const pilotUser of pilotUsers) {
    await db
      .insert(users)
      .values({
        email: pilotUser.email,
        firstName: pilotUser.firstName,
        lastName: pilotUser.lastName,
        passwordHash,
        isActive: Boolean(passwordHash),
      })
      .onConflictDoUpdate({
        target: users.email,
        set: passwordHash
          ? { passwordHash, isActive: true, updatedAt: new Date() }
          : { updatedAt: new Date() },
      });

    const [storedUser] = await db.select().from(users).where(eq(users.email, pilotUser.email)).limit(1);
    if (!storedUser) throw new Error(`Unable to seed user ${pilotUser.email}`);

    for (const roleKey of pilotUser.roles) {
      const roleId = roleByKey.get(roleKey);
      if (!roleId) throw new Error(`Unable to find seeded role ${roleKey}`);
      await db.insert(userRoles).values({ userId: storedUser.id, roleId }).onConflictDoNothing();
    }
  }

  console.info(
    `Seeded ${pilotUsers.length} pilot users (${passwordHash ? "active" : "awaiting activation"}).`,
  );
} finally {
  await sql.end();
}

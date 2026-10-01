import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { getDatabaseClient } from "@/db/client";
import { loginAttempts, sessions } from "@/db/schema";
import { createTestUser, setupIntegrationDatabase } from "@/test/integration";

import { processHousekeeping } from "./housekeeping";

setupIntegrationDatabase();

describe("worker housekeeping", () => {
  it("removes expired sessions and old login attempts but keeps current ones", async () => {
    const user = await createTestUser();
    const { db } = getDatabaseClient();
    await db.insert(sessions).values([
      { userId: user.id, tokenHash: "expired", expiresAt: new Date(Date.now() - 1_000) },
      { userId: user.id, tokenHash: "active", expiresAt: new Date(Date.now() + 86_400_000) },
    ]);
    await db.insert(loginAttempts).values([
      { email: user.email, succeeded: false, createdAt: new Date(Date.now() - 40 * 86_400_000) },
      { email: user.email, succeeded: false },
    ]);

    expect(await processHousekeeping()).toEqual({ sessions: 1, telegramLinkCodes: 0, loginAttempts: 1 });
    const [remaining] = await db.execute(sql`
      select (select count(*) from sessions)::int as sessions, (select count(*) from login_attempts)::int as attempts
    `);
    expect(remaining).toEqual({ sessions: 1, attempts: 1 });
  });
});

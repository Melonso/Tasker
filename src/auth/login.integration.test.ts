import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { getDatabaseClient } from "@/db/client";
import { users } from "@/db/schema";
import { createTestUser, setupIntegrationDatabase } from "@/test/integration";

import { authenticateWithPassword, MAX_FAILED_LOGINS_PER_EMAIL } from "./login";
import { hashPassword } from "./password";

setupIntegrationDatabase();

const password = "poprawne-haslo-123";

async function userWithPassword() {
  const user = await createTestUser();
  const { db } = getDatabaseClient();
  await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, user.id));
  return user;
}

describe("password login", () => {
  it("accepts the correct password and rejects a wrong one", async () => {
    const user = await userWithPassword();
    expect(await authenticateWithPassword(user.email, password, "10.0.0.1")).toEqual({ ok: true, userId: user.id });
    expect(await authenticateWithPassword(user.email, "zle-haslo-12345", "10.0.0.1")).toEqual({ ok: false, reason: "INVALID" });
    expect(await authenticateWithPassword("nieznany@example.test", password, "10.0.0.1")).toEqual({
      ok: false,
      reason: "INVALID",
    });
  });

  it("locks the account after repeated failures, even for the correct password", async () => {
    const user = await userWithPassword();
    for (let attempt = 0; attempt < MAX_FAILED_LOGINS_PER_EMAIL; attempt += 1) {
      await authenticateWithPassword(user.email, "zle-haslo-12345", `10.0.0.${attempt}`);
    }
    expect(await authenticateWithPassword(user.email, password, "10.0.1.1")).toEqual({
      ok: false,
      reason: "RATE_LIMITED",
    });
  });

  it("starts counting failures again after a successful login", async () => {
    const user = await userWithPassword();
    for (let attempt = 0; attempt < MAX_FAILED_LOGINS_PER_EMAIL - 1; attempt += 1) {
      await authenticateWithPassword(user.email, "zle-haslo-12345", "10.0.0.1");
    }
    expect((await authenticateWithPassword(user.email, password, "10.0.0.1")).ok).toBe(true);
    await authenticateWithPassword(user.email, "zle-haslo-12345", "10.0.0.1");
    expect((await authenticateWithPassword(user.email, password, "10.0.0.1")).ok).toBe(true);
  });
});

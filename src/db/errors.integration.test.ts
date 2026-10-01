import { describe, expect, it } from "vitest";

import { createTestUser, setupIntegrationDatabase } from "@/test/integration";

import { getDatabaseClient } from "./client";
import { isUniqueViolation } from "./errors";
import { telegramConnections } from "./schema";

setupIntegrationDatabase();

describe("unique violations from the database driver", () => {
  it("are recognized through Drizzle's error wrapping", async () => {
    const first = await createTestUser();
    const second = await createTestUser();
    const { db } = getDatabaseClient();
    await db.insert(telegramConnections).values({ userId: first.id, telegramUserId: "42", chatId: "42" });
    const error = await db
      .insert(telegramConnections)
      .values({ userId: second.id, telegramUserId: "42", chatId: "42" })
      .catch((caught: unknown) => caught);
    expect(isUniqueViolation(error)).toBe(true);
  });
});

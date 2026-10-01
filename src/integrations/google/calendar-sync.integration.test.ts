import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { getDatabaseClient } from "@/db/client";
import { calendarEventLinks, googleConnections } from "@/db/schema";
import { createTaskForUser } from "@/tasks/service";
import { createTestUser, setupIntegrationDatabase } from "@/test/integration";

import { removeGoogleCalendarConnection } from "./calendar-sync";

setupIntegrationDatabase();

describe("Google Calendar disconnect", () => {
  it("removes a connection whose tokens can no longer be used", async () => {
    const user = await createTestUser();
    const taskId = await createTaskForUser(user, {
      title: "Spotkanie",
      assigneeId: user.id,
      visibility: "PRIVATE",
      priority: "NORMAL",
      dueAt: new Date(Date.now() + 86_400_000),
    });
    const { db } = getDatabaseClient();
    const [connection] = await db
      .insert(googleConnections)
      .values({ userId: user.id, status: "NEEDS_ATTENTION", encryptedAccessToken: "broken" })
      .returning();
    await db.insert(calendarEventLinks).values({ taskId, userId: user.id, calendarId: "primary", eventId: "event-1" });

    const result = await removeGoogleCalendarConnection(connection!);

    expect(result.remainingEvents).toBe(1);
    expect(await db.select().from(googleConnections).where(eq(googleConnections.userId, user.id))).toHaveLength(0);
    expect(await db.select().from(calendarEventLinks).where(eq(calendarEventLinks.userId, user.id))).toHaveLength(0);
  });
});

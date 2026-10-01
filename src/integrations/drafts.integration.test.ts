import { describe, expect, it } from "vitest";

import { createTaskForUser } from "@/tasks/service";
import { createTestUser, setupIntegrationDatabase } from "@/test/integration";

import { telegramSummaryBounds, telegramTaskSummary } from "./drafts";

setupIntegrationDatabase();

describe("Telegram task summaries", () => {
  it("lists only the assignee's active tasks within the requested window", async () => {
    const user = await createTestUser();
    const now = new Date();
    const tomorrow = telegramSummaryBounds(now, user.timeZone, "TOMORROW");
    const create = (title: string, dueAt: Date | null) =>
      createTaskForUser(user, { title, assigneeId: user.id, scope: "PRIVATE", visibility: "PRIVATE", priority: "NORMAL", dueAt });

    await create("Zaległe", new Date(now.getTime() - 3_600_000));
    await create("Jutro", new Date(tomorrow.start.getTime() + 3_600_000));
    await create("Bez terminu", null);

    expect((await telegramTaskSummary(user, "OVERDUE")).map((task) => task.title)).toEqual(["Zaległe"]);
    expect((await telegramTaskSummary(user, "TOMORROW")).map((task) => task.title)).toEqual(["Jutro"]);
  });
});

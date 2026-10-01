import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { getDatabaseClient } from "@/db/client";
import { taskRecurrences, tasks } from "@/db/schema";
import { createTestUser, setupIntegrationDatabase } from "@/test/integration";

import { canAccessStoredTask } from "./queries";
import { completeTaskForUser, createTaskForUser, shareTaskWithUser } from "./service";

setupIntegrationDatabase();

const inTwoDays = () => new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);

describe("task completion", () => {
  it("creates exactly one next occurrence when a recurring task is completed concurrently", async () => {
    const author = await createTestUser();
    const taskId = await createTaskForUser(author, {
      title: "Raport tygodniowy",
      assigneeId: author.id,
      visibility: "PRIVATE",
      priority: "NORMAL",
      dueAt: inTwoDays(),
      recurrenceRule: { frequency: "WEEKLY", interval: 1 },
    });

    const results = await Promise.allSettled([
      completeTaskForUser(author, taskId),
      completeTaskForUser(author, taskId),
      completeTaskForUser(author, taskId),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const { db } = getDatabaseClient();
    const [recurrence] = await db.select().from(taskRecurrences).where(eq(taskRecurrences.taskId, taskId));
    const series = await db
      .select({ id: tasks.id, status: tasks.status })
      .from(tasks)
      .innerJoin(taskRecurrences, eq(taskRecurrences.taskId, tasks.id))
      .where(eq(taskRecurrences.seriesId, recurrence!.seriesId));
    expect(series).toHaveLength(2);
    expect(series.filter((task) => task.status === "OPEN")).toHaveLength(1);
  });

  it("schedules the next occurrence in the future when an overdue recurring task is completed", async () => {
    const author = await createTestUser();
    const threeWeeksAgo = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000);
    const taskId = await createTaskForUser(author, {
      title: "Cotygodniowy przegląd",
      assigneeId: author.id,
      visibility: "PRIVATE",
      priority: "NORMAL",
      dueAt: threeWeeksAgo,
      recurrenceRule: { frequency: "WEEKLY", interval: 1 },
    });

    const { nextTaskId } = await completeTaskForUser(author, taskId);

    const { db } = getDatabaseClient();
    const [nextTask] = await db.select({ dueAt: tasks.dueAt }).from(tasks).where(eq(tasks.id, nextTaskId!));
    expect(nextTask!.dueAt!.getTime()).toBeGreaterThan(Date.now());
    expect(nextTask!.dueAt!.getTime()).toBeLessThanOrEqual(Date.now() + 8 * 24 * 60 * 60 * 1000);
  });

  it("rejects completing a task that is already completed", async () => {
    const author = await createTestUser();
    const taskId = await createTaskForUser(author, {
      title: "Jednorazowe",
      assigneeId: author.id,
      visibility: "PRIVATE",
      priority: "NORMAL",
      dueAt: null,
    });
    await completeTaskForUser(author, taskId);
    await expect(completeTaskForUser(author, taskId)).rejects.toThrow();
  });
});

describe("task sharing", () => {
  it("keeps company visibility when a company task is shared with a person", async () => {
    const author = await createTestUser();
    const colleague = await createTestUser();
    const external = await createTestUser({ roles: ["EXTERNAL"] });
    const taskId = await createTaskForUser(author, {
      title: "Zadanie firmowe",
      assigneeId: author.id,
      visibility: "COMPANY",
      priority: "NORMAL",
      dueAt: null,
    });

    await shareTaskWithUser(author, taskId, external.id);

    const { db } = getDatabaseClient();
    const [task] = await db.select({ visibility: tasks.visibility }).from(tasks).where(and(eq(tasks.id, taskId)));
    expect(task?.visibility).toBe("COMPANY");
    expect(await canAccessStoredTask(colleague, taskId)).toBe(true);
    expect(await canAccessStoredTask(external, taskId)).toBe(true);
  });
});

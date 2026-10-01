import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { getDatabaseClient } from "@/db/client";
import { teamMembers, teams, users } from "@/db/schema";
import { createTestUser, setupIntegrationDatabase } from "@/test/integration";

import { canAccessStoredTask, countTasksByView, listTasksForView } from "./queries";
import { completeTaskForUser, createTaskForUser } from "./service";

setupIntegrationDatabase();

const baseTask = { priority: "NORMAL" as const, dueAt: null };

describe("task access rule", () => {
  it("grants access according to visibility, shares and team membership", async () => {
    const owner = await createTestUser({ roles: ["BUSINESS_OWNER", "COMPANY_MEMBER"] });
    const colleague = await createTestUser();
    const external = await createTestUser({ roles: ["EXTERNAL"] });
    const teamMember = await createTestUser();
    const { db } = getDatabaseClient();
    const [team] = await db.insert(teams).values({ name: "Marketing", createdById: owner.id }).returning();
    await db.insert(teamMembers).values([{ teamId: team!.id, userId: owner.id }, { teamId: team!.id, userId: teamMember.id }]);

    const privateTask = await createTaskForUser(owner, { ...baseTask, title: "Prywatne", assigneeId: owner.id, visibility: "PRIVATE" });
    const companyTask = await createTaskForUser(owner, { ...baseTask, title: "Firmowe", assigneeId: owner.id, visibility: "COMPANY" });
    const sharedTask = await createTaskForUser(owner, {
      ...baseTask,
      title: "Udostępnione",
      assigneeId: owner.id,
      visibility: "SHARED",
      shareUserIds: [external.id],
      shareTeamIds: [team!.id],
    });

    const access = async (taskId: string) => ({
      colleague: await canAccessStoredTask(colleague, taskId),
      external: await canAccessStoredTask(external, taskId),
      teamMember: await canAccessStoredTask(teamMember, taskId),
    });
    expect(await access(privateTask)).toEqual({ colleague: false, external: false, teamMember: false });
    expect(await access(companyTask)).toEqual({ colleague: true, external: false, teamMember: true });
    expect(await access(sharedTask)).toEqual({ colleague: false, external: true, teamMember: true });
  });
});

describe("dashboard counters", () => {
  it("counts each task once even when it is shared many ways", async () => {
    const owner = await createTestUser({ roles: ["BUSINESS_OWNER", "COMPANY_MEMBER"] });
    const other = await createTestUser();
    const third = await createTestUser();
    const { db } = getDatabaseClient();
    const [team] = await db.insert(teams).values({ name: "Zespół", createdById: owner.id }).returning();
    await db.insert(teamMembers).values([{ teamId: team!.id, userId: owner.id }, { teamId: team!.id, userId: other.id }]);

    await createTaskForUser(owner, {
      ...baseTask,
      title: "Delegowane",
      assigneeId: other.id,
      visibility: "SHARED",
      shareUserIds: [third.id],
      shareTeamIds: [team!.id],
    });
    await createTaskForUser(owner, {
      ...baseTask,
      title: "Po terminie",
      assigneeId: owner.id,
      visibility: "PRIVATE",
      dueAt: new Date(Date.now() - 60_000),
    });
    const doneId = await createTaskForUser(owner, { ...baseTask, title: "Zrobione", assigneeId: owner.id, visibility: "PRIVATE" });
    await completeTaskForUser(owner, doneId);

    expect(await countTasksByView(owner)).toEqual({ current: 1, overdue: 1, waiting: 0, delegated: 1, done: 1 });
    expect(await listTasksForView(owner, "delegated")).toHaveLength(1);
    const [doneTask] = await listTasksForView(owner, "done");
    expect(doneTask?.title).toBe("Zrobione");
  });
});

describe("avatars in task lists", () => {
  it("returns a cacheable avatar URL instead of the stored image", async () => {
    const owner = await createTestUser();
    const { db } = getDatabaseClient();
    await db.update(users).set({ avatarDataUrl: "data:image/png;base64,iVBORw0KGgoA" }).where(eq(users.id, owner.id));
    await createTaskForUser(owner, { ...baseTask, title: "Z avatarem", assigneeId: owner.id, visibility: "PRIVATE" });

    const [task] = await listTasksForView(owner, "current");
    expect(task?.assigneeAvatarUrl).toMatch(new RegExp(`^/api/users/${owner.id}/avatar\\?v=\\d+$`));
  });
});

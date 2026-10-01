import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { getDatabaseClient } from "@/db/client";
import { notifications, taskCommandDrafts, tasks, users } from "@/db/schema";
import { createTestUser, setupIntegrationDatabase } from "@/test/integration";

import { processDraftAutoConfirmBatch } from "./draft-auto-confirm";
import { confirmTaskDraft } from "./draft-confirmation";
import { createTaskDraft } from "./drafts";

setupIntegrationDatabase();

async function ageDraft(draftId: string, minutes: number) {
  const { db } = getDatabaseClient();
  await db.execute(sql`
    update task_command_drafts
    set created_at = now() - make_interval(mins => ${minutes})
    where id = ${draftId}
  `);
}

describe("task draft confirmation", () => {
  it("creates exactly one task when manual and automatic confirmation race", async () => {
    const user = await createTestUser({ firstName: "Anna", lastName: "Nowak" });
    const draft = await createTaskDraft(user, {
      sourceEventId: "telegram-update-1",
      title: "Wysłać ofertę",
      visibility: "PRIVATE",
      priority: "NORMAL",
    });
    expect(draft.status).toBe("DRAFT");
    await ageDraft(draft.id, 11);

    const results = await Promise.all([
      confirmTaskDraft({ draftId: draft.id, user, mode: "MANUAL" }),
      processDraftAutoConfirmBatch(),
      confirmTaskDraft({ draftId: draft.id, user, mode: "MANUAL" }),
    ]);

    const { db } = getDatabaseClient();
    const created = await db.select().from(tasks).where(eq(tasks.authorId, user.id));
    expect(created).toHaveLength(1);
    const [stored] = await db.select().from(taskCommandDrafts).where(eq(taskCommandDrafts.id, draft.id));
    expect(stored?.status).toBe("CONFIRMED");
    expect(stored?.taskId).toBe(created[0]?.id);
    expect(results.filter((result) => "outcome" in result && result.outcome === "CONFIRMED").length
      + results[1].confirmed).toBe(1);
  });

  it("rolls back the task change and keeps the draft when the task operation is rejected", async () => {
    const author = await createTestUser({ firstName: "Anna", lastName: "Nowak" });
    const assignee = await createTestUser({ firstName: "Piotr", lastName: "Zieliński" });
    const draft = await createTaskDraft(author, {
      sourceEventId: "telegram-update-2",
      title: "Zadzwonić do klienta",
      assignee: "Piotr Zieliński",
      visibility: "PRIVATE",
      priority: "NORMAL",
    });
    const { db } = getDatabaseClient();
    await db.update(users).set({ isActive: false }).where(eq(users.id, assignee.id));

    await expect(confirmTaskDraft({ draftId: draft.id, user: author, mode: "MANUAL" })).rejects.toThrow(
      "Wybrany wykonawca nie jest aktywnym użytkownikiem.",
    );
    const [stored] = await db.select().from(taskCommandDrafts).where(eq(taskCommandDrafts.id, draft.id));
    expect(stored?.status).toBe("DRAFT");
    expect(await db.select().from(tasks)).toHaveLength(0);
  });

  it("marks an automatically rejected draft for clarification instead of leaving it processing", async () => {
    const author = await createTestUser({ firstName: "Anna", lastName: "Nowak" });
    const assignee = await createTestUser({ firstName: "Piotr", lastName: "Zieliński" });
    const draft = await createTaskDraft(author, {
      sourceEventId: "telegram-update-3",
      title: "Zadzwonić do klienta",
      assignee: "Piotr Zieliński",
      visibility: "PRIVATE",
      priority: "NORMAL",
    });
    await ageDraft(draft.id, 11);
    const { db } = getDatabaseClient();
    await db.update(users).set({ isActive: false }).where(eq(users.id, assignee.id));

    const result = await processDraftAutoConfirmBatch();
    expect(result).toMatchObject({ claimed: 1, confirmed: 0, failed: 1 });
    const [stored] = await db.select().from(taskCommandDrafts).where(eq(taskCommandDrafts.id, draft.id));
    expect(stored?.status).toBe("NEEDS_CLARIFICATION");
    expect(stored?.payload.clarification).toBe("Wybrany wykonawca nie jest aktywnym użytkownikiem.");
  });

  it("queues an auto-confirmation notice only for automatic confirmation", async () => {
    const user = await createTestUser({ firstName: "Anna", lastName: "Nowak" });
    const draft = await createTaskDraft(user, {
      sourceEventId: "telegram-update-4",
      title: "Opłacić fakturę",
      visibility: "PRIVATE",
      priority: "NORMAL",
    });
    await ageDraft(draft.id, 11);
    await processDraftAutoConfirmBatch();
    const { db } = getDatabaseClient();
    const notices = await db.select().from(notifications).where(eq(notifications.userId, user.id));
    expect(notices.map((notice) => notice.title)).toEqual(["Zadanie zatwierdzone automatycznie"]);
  });

  it("expires drafts left in processing by the previous confirmation flow", async () => {
    const user = await createTestUser({ firstName: "Anna", lastName: "Nowak" });
    const draft = await createTaskDraft(user, {
      sourceEventId: "telegram-update-5",
      title: "Stary szkic",
      visibility: "PRIVATE",
      priority: "NORMAL",
    });
    const { db } = getDatabaseClient();
    await db.execute(sql`
      update task_command_drafts
      set status = 'PROCESSING', updated_at = now() - interval '20 minutes'
      where id = ${draft.id}
    `);
    const result = await processDraftAutoConfirmBatch();
    expect(result.expired).toBe(1);
    const [stored] = await db.select().from(taskCommandDrafts).where(eq(taskCommandDrafts.id, draft.id));
    expect(stored?.status).toBe("EXPIRED");
  });
});

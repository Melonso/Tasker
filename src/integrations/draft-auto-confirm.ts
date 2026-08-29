import { eq, inArray, sql } from "drizzle-orm";

import { getDatabaseClient } from "@/db/client";
import { taskCommandDrafts } from "@/db/schema";
import { TaskInputError } from "@/tasks/service";

import { confirmClaimedTaskDraft, type ClaimedTaskDraft } from "./draft-confirmation";
import { userForId } from "./users";

export const DRAFT_AUTO_CONFIRM_DELAY_MS = 10 * 60 * 1_000;

export function draftAutoConfirmAt(createdAt: Date) {
  return new Date(createdAt.getTime() + DRAFT_AUTO_CONFIRM_DELAY_MS);
}

async function expireOldDrafts() {
  const { db } = getDatabaseClient();
  const result = await db.execute(sql`
    update task_command_drafts
    set status = 'EXPIRED', updated_at = now()
    where status in ('DRAFT', 'NEEDS_CLARIFICATION')
      and expires_at <= now()
    returning id
  `);
  return result.length;
}

async function claimDraftsForAutoConfirmation(limit: number) {
  const { db } = getDatabaseClient();
  return db.transaction(async (tx) => {
    const rows = await tx.execute(sql`
      select id
      from task_command_drafts
      where status = 'DRAFT'
        and payload->>'intent' = 'CREATE_TASK'
        and created_at <= now() - interval '10 minutes'
        and expires_at > now()
      order by created_at asc
      for update skip locked
      limit ${Math.min(Math.max(limit, 1), 50)}
    `);
    const ids = rows.map((row) => String(row.id));
    if (!ids.length) return [];
    return tx
      .update(taskCommandDrafts)
      .set({ status: "PROCESSING", updatedAt: new Date() })
      .where(inArray(taskCommandDrafts.id, ids))
      .returning();
  });
}

async function markNeedsClarification(draft: ClaimedTaskDraft, message: string) {
  const { db } = getDatabaseClient();
  await db
    .update(taskCommandDrafts)
    .set({
      status: "NEEDS_CLARIFICATION",
      payload: { ...draft.payload, clarification: message },
      updatedAt: new Date(),
    })
    .where(eq(taskCommandDrafts.id, draft.id));
}

export async function processDraftAutoConfirmBatch(limit = 25) {
  const expired = await expireOldDrafts();
  const drafts = await claimDraftsForAutoConfirmation(limit);
  let confirmed = 0;
  let failed = 0;
  for (const draft of drafts) {
    try {
      const user = await userForId(draft.userId);
      if (!user) {
        await markNeedsClarification(draft, "Autor szkicu nie jest już aktywnym użytkownikiem.");
        failed += 1;
        continue;
      }
      await confirmClaimedTaskDraft(draft, user, "AUTO");
      confirmed += 1;
    } catch (error) {
      failed += 1;
      if (error instanceof TaskInputError) {
        await markNeedsClarification(draft, error.message);
      } else {
        console.error("Automatic task draft confirmation failed", {
          draftId: draft.id,
          error: error instanceof Error ? error.message : "Nieznany błąd",
        });
      }
    }
  }
  return { claimed: drafts.length, confirmed, failed, expired };
}

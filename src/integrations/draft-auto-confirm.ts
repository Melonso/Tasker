import { and, eq, sql } from "drizzle-orm";

import { getDatabaseClient } from "@/db/client";
import { taskCommandDrafts } from "@/db/schema";
import { TaskInputError } from "@/tasks/service";

import { confirmTaskDraft, DRAFT_AUTO_CONFIRM_DELAY_MS, type StoredTaskDraft } from "./draft-confirmation";
import { userForId } from "./users";

export { DRAFT_AUTO_CONFIRM_DELAY_MS };

/** Drafts left in PROCESSING by the previous two-step confirmation flow are expired after this. */
const LEGACY_PROCESSING_TIMEOUT_MINUTES = 15;

export function draftAutoConfirmAt(createdAt: Date) {
  return new Date(createdAt.getTime() + DRAFT_AUTO_CONFIRM_DELAY_MS);
}

async function expireOldDrafts() {
  const { db } = getDatabaseClient();
  const result = await db.execute(sql`
    update task_command_drafts
    set status = 'EXPIRED', updated_at = now()
    where (status in ('DRAFT', 'NEEDS_CLARIFICATION') and expires_at <= now())
       or (status = 'PROCESSING'
           and updated_at <= now() - make_interval(mins => ${LEGACY_PROCESSING_TIMEOUT_MINUTES}))
    returning id
  `);
  return result.length;
}

async function draftsDueForAutoConfirmation(limit: number) {
  const { db } = getDatabaseClient();
  const rows = await db.execute(sql`
    select id, user_id
    from task_command_drafts
    where status = 'DRAFT'
      and payload->>'intent' = 'CREATE_TASK'
      and created_at <= now() - make_interval(secs => ${DRAFT_AUTO_CONFIRM_DELAY_MS / 1_000})
      and expires_at > now()
    order by created_at asc
    limit ${Math.min(Math.max(limit, 1), 50)}
  `);
  return rows.map((row) => ({ id: String(row.id), userId: String(row.user_id) }));
}

async function markNeedsClarification(draftId: string, message: string) {
  const { db } = getDatabaseClient();
  const [draft] = await db
    .select({ payload: taskCommandDrafts.payload })
    .from(taskCommandDrafts)
    .where(eq(taskCommandDrafts.id, draftId))
    .limit(1);
  if (!draft) return;
  await db
    .update(taskCommandDrafts)
    .set({
      status: "NEEDS_CLARIFICATION",
      payload: { ...draft.payload, clarification: message } as StoredTaskDraft["payload"],
      updatedAt: new Date(),
    })
    .where(and(eq(taskCommandDrafts.id, draftId), eq(taskCommandDrafts.status, "DRAFT")));
}

export async function processDraftAutoConfirmBatch(limit = 25) {
  const expired = await expireOldDrafts();
  const candidates = await draftsDueForAutoConfirmation(limit);
  let confirmed = 0;
  let failed = 0;
  for (const candidate of candidates) {
    try {
      const user = await userForId(candidate.userId);
      if (!user) {
        await markNeedsClarification(candidate.id, "Autor szkicu nie jest już aktywnym użytkownikiem.");
        failed += 1;
        continue;
      }
      const result = await confirmTaskDraft({ draftId: candidate.id, user, mode: "AUTO" });
      if (result.outcome === "CONFIRMED") confirmed += 1;
    } catch (error) {
      failed += 1;
      if (error instanceof TaskInputError) {
        await markNeedsClarification(candidate.id, error.message);
      } else {
        console.error("Automatic task draft confirmation failed", {
          draftId: candidate.id,
          error: error instanceof Error ? error.message : "Nieznany błąd",
        });
      }
    }
  }
  return { claimed: candidates.length, confirmed, failed, expired };
}

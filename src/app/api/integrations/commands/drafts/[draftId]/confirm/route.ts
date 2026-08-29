import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDatabaseClient } from "@/db/client";
import { taskCommandDrafts } from "@/db/schema";
import { confirmClaimedTaskDraft } from "@/integrations/draft-confirmation";
import { draftResponse } from "@/integrations/drafts";
import { authorizeIntegrationRequest } from "@/integrations/service-auth";
import { userForTelegramId } from "@/integrations/users";
import { TaskInputError } from "@/tasks/service";

const requestSchema = z.object({ telegramUserId: z.string().trim().min(1).max(80) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  if (!authorizeIntegrationRequest(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  const draftId = z.uuid().safeParse((await params).draftId);
  if (!parsed.success || !draftId.success) {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }
  const user = await userForTelegramId(parsed.data.telegramUserId);
  if (!user) return NextResponse.json({ error: "TELEGRAM_ACCOUNT_NOT_LINKED" }, { status: 404 });

  const { db } = getDatabaseClient();
  const [draft] = await db
    .select()
    .from(taskCommandDrafts)
    .where(and(eq(taskCommandDrafts.id, draftId.data), eq(taskCommandDrafts.userId, user.id)))
    .limit(1);
  if (!draft) return NextResponse.json({ error: "DRAFT_NOT_FOUND" }, { status: 404 });
  if (draft.status === "CONFIRMED") return NextResponse.json(draftResponse(draft));
  if (draft.expiresAt <= new Date()) {
    await db.update(taskCommandDrafts).set({ status: "EXPIRED", updatedAt: new Date() }).where(eq(taskCommandDrafts.id, draft.id));
    return NextResponse.json({ error: "DRAFT_EXPIRED" }, { status: 410 });
  }
  if (draft.status === "NEEDS_CLARIFICATION") {
    return NextResponse.json({ error: "DRAFT_NEEDS_CLARIFICATION", clarification: draft.payload.clarification }, { status: 409 });
  }
  const [claimed] = await db
    .update(taskCommandDrafts)
    .set({ status: "PROCESSING", updatedAt: new Date() })
    .where(and(eq(taskCommandDrafts.id, draft.id), eq(taskCommandDrafts.status, "DRAFT")))
    .returning();
  if (!claimed) return NextResponse.json({ error: "DRAFT_ALREADY_PROCESSING" }, { status: 409 });
  try {
    const confirmed = await confirmClaimedTaskDraft(claimed, user, "MANUAL");
    return NextResponse.json(draftResponse(confirmed));
  } catch (error) {
    await db.update(taskCommandDrafts).set({ status: "DRAFT", updatedAt: new Date() }).where(eq(taskCommandDrafts.id, draft.id));
    if (error instanceof TaskInputError) {
      return NextResponse.json({ error: "TASK_INPUT_REJECTED", message: error.message }, { status: 422 });
    }
    throw error;
  }
}

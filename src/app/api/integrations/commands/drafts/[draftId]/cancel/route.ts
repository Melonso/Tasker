import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDatabaseClient } from "@/db/client";
import { auditEvents, taskCommandDrafts } from "@/db/schema";
import { draftResponse } from "@/integrations/drafts";
import { authorizeIntegrationRequest } from "@/integrations/service-auth";
import { userForTelegramId } from "@/integrations/users";

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
  if (draft.status === "CANCELED") return NextResponse.json(draftResponse(draft));
  if (draft.status === "CONFIRMED") {
    return NextResponse.json({ error: "DRAFT_ALREADY_CONFIRMED", taskId: draft.taskId }, { status: 409 });
  }
  if (draft.status === "PROCESSING") {
    return NextResponse.json({ error: "DRAFT_ALREADY_PROCESSING" }, { status: 409 });
  }
  if (draft.expiresAt <= new Date() || draft.status === "EXPIRED") {
    await db
      .update(taskCommandDrafts)
      .set({ status: "EXPIRED", updatedAt: new Date() })
      .where(eq(taskCommandDrafts.id, draft.id));
    return NextResponse.json({ error: "DRAFT_EXPIRED" }, { status: 410 });
  }

  const [canceled] = await db
    .update(taskCommandDrafts)
    .set({ status: "CANCELED", updatedAt: new Date() })
    .where(
      and(
        eq(taskCommandDrafts.id, draft.id),
        inArray(taskCommandDrafts.status, ["DRAFT", "NEEDS_CLARIFICATION"]),
      ),
    )
    .returning();
  if (!canceled) return NextResponse.json({ error: "DRAFT_STATE_CHANGED" }, { status: 409 });

  await db.insert(auditEvents).values({
    actorId: user.id,
    action: "TASK_DRAFT_CANCELED",
    metadata: { draftId: draft.id, source: "TELEGRAM" },
  });
  return NextResponse.json(draftResponse(canceled));
}

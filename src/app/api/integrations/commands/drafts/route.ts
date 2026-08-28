import { NextResponse } from "next/server";
import { z } from "zod";

import { createTaskDraft, draftResponse } from "@/integrations/drafts";
import { authorizeIntegrationRequest } from "@/integrations/service-auth";
import { userForTelegramId } from "@/integrations/users";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^\d{2}:\d{2}$/);
const requestSchema = z.object({
  telegramUserId: z.string().trim().min(1).max(80),
  sourceEventId: z.string().trim().min(1).max(200),
  sourceText: z.string().trim().max(5_000).optional(),
  intent: z.literal("CREATE_TASK"),
  title: z.string().trim().min(3).max(300),
  description: z.string().trim().max(5_000).optional(),
  assignee: z.string().trim().max(320).optional(),
  dueDate: date.optional(),
  dueTime: time.optional(),
  visibility: z.enum(["PRIVATE", "COMPANY", "SHARED"]).default("PRIVATE"),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
});

export async function POST(request: Request) {
  if (!authorizeIntegrationRequest(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, { status: 400 });
  }
  const user = await userForTelegramId(parsed.data.telegramUserId);
  if (!user) return NextResponse.json({ error: "TELEGRAM_ACCOUNT_NOT_LINKED" }, { status: 404 });

  try {
    const draft = await createTaskDraft(user, parsed.data);
    return NextResponse.json(draftResponse(draft), { status: draft.status === "NEEDS_CLARIFICATION" ? 202 : 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Source event is already assigned.") {
      return NextResponse.json({ error: "SOURCE_EVENT_CONFLICT" }, { status: 409 });
    }
    throw error;
  }
}

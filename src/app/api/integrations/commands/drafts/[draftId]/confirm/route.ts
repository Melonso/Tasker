import { NextResponse } from "next/server";
import { z } from "zod";

import { confirmTaskDraft } from "@/integrations/draft-confirmation";
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

  try {
    const result = await confirmTaskDraft({ draftId: draftId.data, user, mode: "MANUAL" });
    switch (result.outcome) {
      case "CONFIRMED":
      case "ALREADY_CONFIRMED":
        return NextResponse.json(draftResponse(result.draft));
      case "EXPIRED":
        return NextResponse.json({ error: "DRAFT_EXPIRED" }, { status: 410 });
      case "NEEDS_CLARIFICATION":
        return NextResponse.json(
          { error: "DRAFT_NEEDS_CLARIFICATION", clarification: result.draft.payload.clarification },
          { status: 409 },
        );
      case "UNAVAILABLE":
        return NextResponse.json(
          { error: result.draft.status === "CANCELED" ? "DRAFT_CANCELED" : "DRAFT_ALREADY_PROCESSING" },
          { status: 409 },
        );
      default:
        return NextResponse.json({ error: "DRAFT_NOT_FOUND" }, { status: 404 });
    }
  } catch (error) {
    if (error instanceof TaskInputError) {
      return NextResponse.json({ error: "TASK_INPUT_REJECTED", message: error.message }, { status: 422 });
    }
    throw error;
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";

import { authorizeIntegrationRequest } from "@/integrations/service-auth";
import { userForTelegramId } from "@/integrations/users";
import { createNoteForUser } from "@/notes/service";

const requestSchema = z.object({
  telegramUserId: z.string().trim().min(1).max(80),
  sourceEventId: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(10_000),
  title: z.string().trim().max(160).optional(),
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
    const result = await createNoteForUser({
      userId: user.id,
      body: parsed.data.content,
      title: parsed.data.title,
      sourceEventId: parsed.data.sourceEventId,
    });
    return NextResponse.json({
      kind: "NOTE_CREATED",
      created: result.created,
      note: {
        id: result.note.id,
        title: result.note.title,
        url: `/notes#note-${result.note.id}`,
      },
    }, { status: result.created ? 201 : 200 });
  } catch (error) {
    if (error instanceof Error && error.message === "Source event is already assigned.") {
      return NextResponse.json({ error: "SOURCE_EVENT_CONFLICT" }, { status: 409 });
    }
    throw error;
  }
}

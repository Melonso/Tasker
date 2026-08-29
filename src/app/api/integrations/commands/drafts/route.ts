import { NextResponse } from "next/server";
import { z } from "zod";

import {
  createTaskActionDraft,
  createTaskDraft,
  draftResponse,
  telegramTaskSummary,
} from "@/integrations/drafts";
import { authorizeIntegrationRequest } from "@/integrations/service-auth";
import { userForTelegramId } from "@/integrations/users";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^\d{2}:\d{2}$/);
const common = {
  telegramUserId: z.string().trim().min(1).max(80),
  sourceEventId: z.string().trim().min(1).max(200),
};
const requestSchema = z.discriminatedUnion("intent", [z.object({
  ...common,
  sourceText: z.string().trim().max(5_000).optional(),
  intent: z.literal("CREATE_TASK"),
  title: z.string().trim().min(3).max(300),
  description: z.string().trim().max(5_000).optional(),
  assignee: z.string().trim().max(320).optional(),
  dueDate: date.optional(),
  dueTime: time.optional(),
  visibility: z.enum(["PRIVATE", "COMPANY", "SHARED"]).default("PRIVATE"),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
}), z.object({
  ...common,
  intent: z.enum(["COMPLETE_TASK", "RESCHEDULE_TASK"]),
  taskQuery: z.string().trim().min(1).max(300),
  dueDate: date.optional(),
  dueTime: time.optional(),
}), z.object({
  ...common,
  intent: z.enum(["LIST_TODAY", "LIST_OVERDUE"]),
})]);

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
    if (parsed.data.intent === "LIST_TODAY" || parsed.data.intent === "LIST_OVERDUE") {
      const view = parsed.data.intent === "LIST_TODAY" ? "TODAY" : "OVERDUE";
      const taskRows = await telegramTaskSummary(user, view);
      return NextResponse.json({
        kind: "SUMMARY",
        view,
        tasks: taskRows.map((task) => ({ ...task, dueAt: task.dueAt?.toISOString() ?? null })),
      });
    }
    const draft = parsed.data.intent === "CREATE_TASK"
      ? await createTaskDraft(user, parsed.data)
      : parsed.data.intent === "COMPLETE_TASK" || parsed.data.intent === "RESCHEDULE_TASK"
        ? await createTaskActionDraft(user, parsed.data)
        : null;
    if (!draft) return NextResponse.json({ error: "INVALID_INTENT" }, { status: 400 });
    return NextResponse.json(draftResponse(draft), { status: draft.status === "NEEDS_CLARIFICATION" ? 202 : 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Source event is already assigned.") {
      return NextResponse.json({ error: "SOURCE_EVENT_CONFLICT" }, { status: 409 });
    }
    throw error;
  }
}

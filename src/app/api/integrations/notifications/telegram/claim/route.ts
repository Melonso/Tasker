import { NextResponse } from "next/server";
import { z } from "zod";

import { authorizeIntegrationRequest } from "@/integrations/service-auth";
import { claimTelegramDeliveries } from "@/notifications/telegram-delivery";

const requestSchema = z.object({ limit: z.number().int().min(1).max(50).default(20) });

export async function POST(request: Request) {
  if (!authorizeIntegrationRequest(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, { status: 400 });
  }
  const deliveries = await claimTelegramDeliveries(parsed.data.limit);
  return NextResponse.json({ deliveries });
}

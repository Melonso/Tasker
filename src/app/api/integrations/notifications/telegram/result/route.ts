import { NextResponse } from "next/server";
import { z } from "zod";

import { authorizeIntegrationRequest } from "@/integrations/service-auth";
import { reportTelegramDelivery } from "@/notifications/telegram-delivery";

const requestSchema = z.object({
  deliveryId: z.uuid(),
  success: z.boolean(),
  error: z.string().max(2_000).optional(),
});

export async function POST(request: Request) {
  if (!authorizeIntegrationRequest(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, { status: 400 });
  }
  const updated = await reportTelegramDelivery(parsed.data);
  if (!updated) return NextResponse.json({ error: "DELIVERY_NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ status: parsed.data.success ? "SENT" : "FAILED" });
}

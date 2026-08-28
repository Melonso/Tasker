import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/auth/session";
import { getDatabaseClient } from "@/db/client";
import { pushSubscriptions } from "@/db/schema";

const subscriptionSchema = z.object({
  endpoint: z.url().max(4_000),
  keys: z.object({ p256dh: z.string().min(20).max(1_000), auth: z.string().min(8).max(500) }),
});

export async function POST(request: Request) {
  const user = await requireUser();
  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_SUBSCRIPTION" }, { status: 400 });
  }
  const { db } = getDatabaseClient();
  await db
    .insert(pushSubscriptions)
    .values({
      userId: user.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      userAgent: request.headers.get("user-agent"),
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId: user.id,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        userAgent: request.headers.get("user-agent"),
        updatedAt: new Date(),
      },
    });
  return NextResponse.json({ status: "CONNECTED" });
}

export async function DELETE(request: Request) {
  const user = await requireUser();
  const parsed = z.object({ endpoint: z.url().max(4_000) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_SUBSCRIPTION" }, { status: 400 });
  const { db } = getDatabaseClient();
  await db
    .delete(pushSubscriptions)
    .where(
      and(eq(pushSubscriptions.userId, user.id), eq(pushSubscriptions.endpoint, parsed.data.endpoint)),
    );
  return NextResponse.json({ status: "DISCONNECTED" });
}

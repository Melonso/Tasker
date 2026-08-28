import { and, eq, gt, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDatabaseClient } from "@/db/client";
import {
  auditEvents,
  telegramConnections,
  telegramLinkCodes,
  users,
} from "@/db/schema";
import { authorizeIntegrationRequest } from "@/integrations/service-auth";
import { hashTelegramLinkCode } from "@/integrations/telegram";

const requestSchema = z.object({
  code: z.string().trim().min(6).max(20),
  telegramUserId: z.string().trim().min(1).max(80),
  chatId: z.string().trim().min(1).max(80),
});

export async function POST(request: Request) {
  if (!authorizeIntegrationRequest(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });

  const { db } = getDatabaseClient();
  const [linkCode] = await db
    .select({
      id: telegramLinkCodes.id,
      userId: telegramLinkCodes.userId,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(telegramLinkCodes)
    .innerJoin(users, eq(telegramLinkCodes.userId, users.id))
    .where(
      and(
        eq(telegramLinkCodes.codeHash, hashTelegramLinkCode(parsed.data.code)),
        isNull(telegramLinkCodes.usedAt),
        gt(telegramLinkCodes.expiresAt, new Date()),
        eq(users.isActive, true),
      ),
    )
    .limit(1);
  if (!linkCode) return NextResponse.json({ error: "INVALID_OR_EXPIRED_CODE" }, { status: 404 });

  const [existingConnection] = await db
    .select({ userId: telegramConnections.userId })
    .from(telegramConnections)
    .where(eq(telegramConnections.telegramUserId, parsed.data.telegramUserId))
    .limit(1);
  if (existingConnection && existingConnection.userId !== linkCode.userId) {
    return NextResponse.json({ error: "TELEGRAM_ACCOUNT_ALREADY_LINKED" }, { status: 409 });
  }

  const linked = await db.transaction(async (tx) => {
    const [used] = await tx
      .update(telegramLinkCodes)
      .set({ usedAt: new Date() })
      .where(and(eq(telegramLinkCodes.id, linkCode.id), isNull(telegramLinkCodes.usedAt)))
      .returning({ id: telegramLinkCodes.id });
    if (!used) return false;
    await tx
      .insert(telegramConnections)
      .values({
        userId: linkCode.userId,
        telegramUserId: parsed.data.telegramUserId,
        chatId: parsed.data.chatId,
        status: "CONNECTED",
      })
      .onConflictDoUpdate({
        target: telegramConnections.userId,
        set: {
          telegramUserId: parsed.data.telegramUserId,
          chatId: parsed.data.chatId,
          status: "CONNECTED",
          updatedAt: new Date(),
        },
      });
    await tx.insert(auditEvents).values({
      actorId: linkCode.userId,
      action: "TELEGRAM_CONNECTED",
      metadata: { telegramUserId: parsed.data.telegramUserId },
    });
    return true;
  });
  if (!linked) return NextResponse.json({ error: "CODE_ALREADY_USED" }, { status: 409 });

  return NextResponse.json({
    linked: true,
    user: { email: linkCode.email, name: `${linkCode.firstName} ${linkCode.lastName}` },
  });
}

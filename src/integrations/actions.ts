"use server";

import { and, eq, isNull } from "drizzle-orm";

import { requireUser } from "@/auth/session";
import { getDatabaseClient } from "@/db/client";
import { auditEvents, telegramLinkCodes } from "@/db/schema";

import {
  createTelegramLinkCode,
  hashTelegramLinkCode,
  telegramLinkCodeExpiresAt,
} from "./telegram";

export interface TelegramLinkState {
  error?: string;
  code?: string;
  expiresAt?: string;
}

export async function createTelegramLinkCodeAction(
  _state: TelegramLinkState,
  _formData: FormData,
): Promise<TelegramLinkState> {
  void _state;
  void _formData;
  const user = await requireUser();
  const code = createTelegramLinkCode();
  const expiresAt = telegramLinkCodeExpiresAt();
  const { db } = getDatabaseClient();
  await db.transaction(async (tx) => {
    await tx
      .delete(telegramLinkCodes)
      .where(and(eq(telegramLinkCodes.userId, user.id), isNull(telegramLinkCodes.usedAt)));
    await tx.insert(telegramLinkCodes).values({
      userId: user.id,
      codeHash: hashTelegramLinkCode(code),
      expiresAt,
    });
    await tx.insert(auditEvents).values({
      actorId: user.id,
      action: "TELEGRAM_LINK_CODE_CREATED",
      metadata: { expiresAt: expiresAt.toISOString() },
    });
  });
  return { code, expiresAt: expiresAt.toISOString() };
}

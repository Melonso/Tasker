import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { getServerEnv } from "@/lib/env";

const stateSchema = z.object({
  userId: z.uuid(),
  expiresAt: z.number().int().positive(),
  nonce: z.string().min(20),
});

function signature(payload: string) {
  return createHmac("sha256", getServerEnv().SESSION_SECRET).update(payload).digest("base64url");
}

export function createGoogleOAuthState(userId: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({
    userId,
    expiresAt: now + 10 * 60 * 1_000,
    nonce: randomBytes(18).toString("base64url"),
  })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function verifyGoogleOAuthState(value: string, now = Date.now()) {
  const [payload, receivedSignature] = value.split(".");
  if (!payload || !receivedSignature) throw new Error("Nieprawidłowy stan OAuth.");
  const expected = Buffer.from(signature(payload));
  const received = Buffer.from(receivedSignature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw new Error("Nieprawidłowy podpis stanu OAuth.");
  }
  const parsed = stateSchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
  if (parsed.expiresAt < now) throw new Error("Połączenie OAuth wygasło. Spróbuj ponownie.");
  return parsed;
}

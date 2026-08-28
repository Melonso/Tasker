import { createHash, randomBytes } from "node:crypto";

export const TELEGRAM_LINK_CODE_DURATION_MS = 10 * 60 * 1000;
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function createTelegramLinkCode() {
  const random = randomBytes(8);
  return Array.from(random, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}

export function hashTelegramLinkCode(code: string) {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

export function telegramLinkCodeExpiresAt(now = new Date()) {
  return new Date(now.getTime() + TELEGRAM_LINK_CODE_DURATION_MS);
}

import { describe, expect, it } from "vitest";

import {
  TELEGRAM_LINK_CODE_DURATION_MS,
  createTelegramLinkCode,
  hashTelegramLinkCode,
  telegramLinkCodeExpiresAt,
} from "./telegram";

describe("Telegram linking codes", () => {
  it("creates human-friendly eight-character codes", () => {
    const code = createTelegramLinkCode();
    expect(code).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/);
  });

  it("normalizes codes before hashing", () => {
    expect(hashTelegramLinkCode("abcd2345")).toBe(hashTelegramLinkCode(" ABCD2345 "));
  });

  it("expires after ten minutes", () => {
    const now = new Date("2026-08-28T10:00:00.000Z");
    expect(telegramLinkCodeExpiresAt(now).getTime() - now.getTime()).toBe(TELEGRAM_LINK_CODE_DURATION_MS);
  });
});

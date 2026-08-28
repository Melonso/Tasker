import { describe, expect, it } from "vitest";

import { DRAFT_AUTO_CONFIRM_DELAY_MS, draftAutoConfirmAt } from "./draft-auto-confirm";

describe("automatic Telegram draft confirmation", () => {
  it("becomes due ten minutes after creation", () => {
    const createdAt = new Date("2026-08-29T08:00:00.000Z");
    expect(draftAutoConfirmAt(createdAt).toISOString()).toBe("2026-08-29T08:10:00.000Z");
    expect(DRAFT_AUTO_CONFIRM_DELAY_MS).toBe(10 * 60 * 1_000);
  });
});

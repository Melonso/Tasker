import { describe, expect, it } from "vitest";

import { nextRecurringDueAt } from "./recurrence";
import { zonedDateTimeToUtc } from "./reminders";

const zone = "Europe/Warsaw";

describe("nextRecurringDueAt", () => {
  it("keeps the local hour across the daylight-saving transition", () => {
    const current = zonedDateTimeToUtc({ year: 2026, month: 3, day: 28, hour: 14 }, zone);
    const next = nextRecurringDueAt(current, { frequency: "DAILY", interval: 1 }, zone);
    expect(next.toISOString()).toBe("2026-03-29T12:00:00.000Z");
  });

  it("adds whole calendar weeks", () => {
    const current = zonedDateTimeToUtc({ year: 2026, month: 8, day: 29, hour: 9 }, zone);
    const next = nextRecurringDueAt(current, { frequency: "WEEKLY", interval: 2 }, zone);
    expect(next.toISOString()).toBe("2026-09-12T07:00:00.000Z");
  });

  it("clamps a monthly recurrence to the last day of a shorter month", () => {
    const current = zonedDateTimeToUtc({ year: 2027, month: 1, day: 31, hour: 14 }, zone);
    const next = nextRecurringDueAt(current, { frequency: "MONTHLY", interval: 1 }, zone);
    expect(next.toISOString()).toBe("2027-02-28T13:00:00.000Z");
  });
});

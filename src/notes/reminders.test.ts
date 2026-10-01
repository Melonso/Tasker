import { describe, expect, it } from "vitest";

import { nextNoteReminderAt } from "./reminders";

describe("note reminder schedule", () => {
  it("schedules the next daily local time", () => {
    expect(nextNoteReminderAt({
      now: new Date("2026-09-02T06:00:00.000Z"),
      timeZone: "Europe/Warsaw",
      frequency: "DAILY",
      weekday: null,
      hour: 9,
      minute: 15,
    }).toISOString()).toBe("2026-09-02T07:15:00.000Z");
  });

  it("moves a passed daily time to tomorrow", () => {
    expect(nextNoteReminderAt({
      now: new Date("2026-09-02T08:00:00.000Z"),
      timeZone: "Europe/Warsaw",
      frequency: "DAILY",
      weekday: null,
      hour: 9,
      minute: 15,
    }).toISOString()).toBe("2026-09-03T07:15:00.000Z");
  });

  it("schedules a weekly reminder on the selected weekday", () => {
    expect(nextNoteReminderAt({
      now: new Date("2026-09-02T08:00:00.000Z"),
      timeZone: "Europe/Warsaw",
      frequency: "WEEKLY",
      weekday: 5,
      hour: 18,
      minute: 30,
    }).toISOString()).toBe("2026-09-04T16:30:00.000Z");
  });
});

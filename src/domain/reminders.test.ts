import { describe, expect, it } from "vitest";

import { buildReminderSchedule, nextDailyReminder } from "./reminders";

describe("buildReminderSchedule", () => {
  it("creates all three pre-due reminders and the first overdue check", () => {
    const now = new Date("2026-08-01T10:00:00.000Z");
    const dueAt = new Date("2026-08-15T12:00:00.000Z");

    const schedule = buildReminderSchedule({ dueAt, now, timeZone: "Europe/Warsaw" });

    expect(schedule.map((reminder) => reminder.kind)).toEqual([
      "SEVEN_DAYS_BEFORE",
      "ONE_DAY_BEFORE",
      "ONE_HOUR_BEFORE",
      "OVERDUE_DAILY",
    ]);
    expect(schedule.at(-1)?.scheduledAt.toISOString()).toBe("2026-08-16T07:00:00.000Z");
  });

  it("skips elapsed pre-due reminders but keeps the first overdue check", () => {
    const now = new Date("2026-08-15T11:30:00.000Z");
    const dueAt = new Date("2026-08-15T12:00:00.000Z");

    expect(buildReminderSchedule({ dueAt, now, timeZone: "Europe/Warsaw" })).toEqual([
      {
        kind: "OVERDUE_DAILY",
        scheduledAt: new Date("2026-08-16T07:00:00.000Z"),
      },
    ]);
  });

  it("creates the next overdue reminder at 09:00 local time", () => {
    const now = new Date("2026-08-15T08:15:00.000Z"); // 10:15 in Warsaw
    const dueAt = new Date("2026-08-14T12:00:00.000Z");

    const [reminder] = buildReminderSchedule({ dueAt, now, timeZone: "Europe/Warsaw" });

    expect(reminder.kind).toBe("OVERDUE_DAILY");
    expect(reminder.scheduledAt.toISOString()).toBe("2026-08-16T07:00:00.000Z");
  });
});

describe("nextDailyReminder", () => {
  it("respects the winter UTC offset in Warsaw", () => {
    const reminder = nextDailyReminder(new Date("2026-12-01T06:00:00.000Z"), "Europe/Warsaw", 9);
    expect(reminder.toISOString()).toBe("2026-12-01T08:00:00.000Z");
  });
});

import { describe, expect, it } from "vitest";

import {
  reminderContent,
  reminderMatchesCurrentTask,
  reminderRecipientIds,
} from "./reminder-content";

describe("reminder recipients", () => {
  it("notifies only the assignee before the due date", () => {
    expect(reminderRecipientIds("ONE_DAY_BEFORE", "author", "assignee")).toEqual(["assignee"]);
  });

  it("notifies assignee and delegator after the due date", () => {
    expect(reminderRecipientIds("OVERDUE_DAILY", "author", "assignee")).toEqual([
      "assignee",
      "author",
    ]);
  });

  it("does not duplicate a self-assigned recipient", () => {
    expect(reminderRecipientIds("OVERDUE_DAILY", "same", "same")).toEqual(["same"]);
  });
});

describe("reminder content and freshness", () => {
  const dueAt = new Date("2026-09-01T13:00:00.000Z");

  it("creates Polish notification copy", () => {
    expect(
      reminderContent({
        kind: "ONE_HOUR_BEFORE",
        taskTitle: "Oddzwonić",
        dueAt,
        timeZone: "Europe/Warsaw",
      }),
    ).toEqual({ title: "Termin za godzinę", body: "Oddzwonić · termin 01.09.2026, 15:00" });
  });

  it("rejects a pre-due reminder left from an old deadline", () => {
    expect(
      reminderMatchesCurrentTask({
        kind: "ONE_HOUR_BEFORE",
        scheduledAt: new Date("2026-09-01T11:00:00.000Z"),
        dueAt,
        now: new Date("2026-09-01T11:00:00.000Z"),
      }),
    ).toBe(false);
  });
});

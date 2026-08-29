import { describe, expect, it } from "vitest";

import { groupTodayTasks, localDateKey, localDateKeyAfterDays, localTimeKey, todayTaskSection } from "./presentation";

describe("today task presentation", () => {
  it("always places overdue work in the overdue section", () => {
    expect(todayTaskSection({ isOverdue: true, plannedForDate: "2026-08-29" }, "2026-08-29"))
      .toBe("overdue");
  });

  it("places explicitly planned work before other tasks due today", () => {
    expect(todayTaskSection({ isOverdue: false, plannedForDate: "2026-08-29" }, "2026-08-29"))
      .toBe("planned");
    expect(todayTaskSection({ isOverdue: false, plannedForDate: null }, "2026-08-29"))
      .toBe("dueToday");
  });

  it("groups every task into exactly one section", () => {
    const groups = groupTodayTasks([
      { id: "late", isOverdue: true, plannedForDate: null },
      { id: "focus", isOverdue: false, plannedForDate: "2026-08-29" },
      { id: "due", isOverdue: false, plannedForDate: null },
    ], "2026-08-29");

    expect(groups.overdue.map((task) => task.id)).toEqual(["late"]);
    expect(groups.planned.map((task) => task.id)).toEqual(["focus"]);
    expect(groups.dueToday.map((task) => task.id)).toEqual(["due"]);
  });

  it("uses the user's timezone when deriving a local date", () => {
    const instant = new Date("2026-08-29T22:30:00.000Z");
    expect(localDateKey(instant, "Europe/Warsaw")).toBe("2026-08-30");
    expect(localDateKey(instant, "America/New_York")).toBe("2026-08-29");
  });

  it("builds quick reschedule values in local time", () => {
    const instant = new Date("2026-10-24T22:30:00.000Z");
    expect(localDateKeyAfterDays(instant, "Europe/Warsaw", 1)).toBe("2026-10-26");
    expect(localTimeKey(new Date("2026-08-29T08:15:00.000Z"), "Europe/Warsaw")).toBe("10:15");
  });
});

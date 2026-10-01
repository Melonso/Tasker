import { describe, expect, it } from "vitest";

import { isCalendarDateKey, isClockTimeKey } from "./dates";

describe("date and time keys", () => {
  it("accepts real calendar dates only", () => {
    expect(isCalendarDateKey("2026-10-01")).toBe(true);
    expect(isCalendarDateKey("2028-02-29")).toBe(true);
    expect(isCalendarDateKey("2026-02-29")).toBe(false);
    expect(isCalendarDateKey("2026-02-31")).toBe(false);
    expect(isCalendarDateKey("2026-13-01")).toBe(false);
    expect(isCalendarDateKey("2026-1-5")).toBe(false);
  });

  it("accepts 24-hour clock times only", () => {
    expect(isClockTimeKey("00:00")).toBe(true);
    expect(isClockTimeKey("23:59")).toBe(true);
    expect(isClockTimeKey("24:00")).toBe(false);
    expect(isClockTimeKey("25:99")).toBe(false);
    expect(isClockTimeKey("9:30")).toBe(false);
  });
});

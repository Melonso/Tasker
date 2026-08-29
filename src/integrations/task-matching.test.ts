import { describe, expect, it } from "vitest";

import { matchTaskByQuery, normalizeTaskText, scoreTaskTitle } from "./task-matching";

const websiteTask = {
  id: "website",
  title: "Wysłać stronę www.helpyouprawo.pl panu Pawłowi",
};

describe("Telegram task matching", () => {
  it("normalizes Polish characters, punctuation and URLs", () => {
    expect(normalizeTaskText("  WYSŁAĆ: https://www.helpyouprawo.pl!  "))
      .toBe("wyslac www helpyouprawo pl");
  });

  it("matches a remembered fragment instead of requiring the exact title", () => {
    const result = matchTaskByQuery([websiteTask], "wysłać stronę helpyou");
    expect(result.task?.id).toBe("website");
    expect(result.ambiguous).toBe(false);
    expect(result.ranked[0]?.score).toBeGreaterThan(0.9);
  });

  it("tolerates an inflected verb and a small typo", () => {
    expect(scoreTaskTitle(websiteTask.title, "wyślij stronę helpyoupawo").score).toBeGreaterThan(0.7);
  });

  it("does not guess when two candidates are similarly plausible", () => {
    const result = matchTaskByQuery([
      websiteTask,
      { id: "second", title: "Wysłać stronę helpyouzdrowie.pl panu Pawłowi" },
    ], "wyślij stronę helpyou");
    expect(result.task).toBeNull();
    expect(result.ambiguous).toBe(true);
    expect(result.ranked).toHaveLength(2);
  });

  it("rejects an unrelated command", () => {
    const result = matchTaskByQuery([websiteTask], "zadzwonić do księgowej");
    expect(result.task).toBeNull();
    expect(result.ranked).toHaveLength(0);
  });
});

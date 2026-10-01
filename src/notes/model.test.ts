import { describe, expect, it } from "vitest";

import { noteTitleFromBody } from "./model";

describe("note title", () => {
  it("uses the first sentence as a generated title", () => {
    expect(noteTitleFromBody("Kupić papier do drukarki. Sprawdzić zapas tonerów."))
      .toBe("Kupić papier do drukarki.");
  });

  it("normalizes whitespace and limits long titles", () => {
    const title = noteTitleFromBody(`  ${"bardzo długa treść ".repeat(8)}  `);
    expect(title.length).toBeLessThanOrEqual(80);
    expect(title.endsWith("…")).toBe(true);
  });
});

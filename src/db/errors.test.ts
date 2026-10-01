import { describe, expect, it } from "vitest";

import { isUniqueViolation } from "./errors";

describe("isUniqueViolation", () => {
  it("recognizes direct and wrapped unique violations", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation(new Error("Failed query", { cause: { code: "23505" } }))).toBe(true);
  });

  it("ignores other errors", () => {
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
    expect(isUniqueViolation(new Error("boom"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});

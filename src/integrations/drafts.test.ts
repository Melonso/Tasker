import { describe, expect, it } from "vitest";

import { commandAssignsAuthor, TASK_DRAFT_DURATION_MS, taskDraftExpiresAt } from "./drafts";

describe("task command drafts", () => {
  it("expires after thirty minutes", () => {
    const now = new Date("2026-08-28T10:00:00.000Z");
    expect(taskDraftExpiresAt(now).getTime() - now.getTime()).toBe(TASK_DRAFT_DURATION_MS);
  });
});

describe("Telegram assignment language", () => {
  it("recognizes an explicit first-person performer", () => {
    expect(commandAssignsAuthor("Przypomnij mi jutro, żebym wysłał stronę panu Pawłowi")).toBe(true);
    expect(commandAssignsAuthor("Dodaj mi zadanie, abym zadzwoniła do Michała")).toBe(true);
  });

  it("does not treat a named third-person performer as the author", () => {
    expect(commandAssignsAuthor("Przypomnij Pawłowi, żeby wysłał stronę")).toBe(false);
    expect(commandAssignsAuthor("Paweł ma wysłać stronę Michałowi")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import {
  commandAssignsAuthor,
  matchAssignablePerson,
  TASK_DRAFT_DURATION_MS,
  taskDraftExpiresAt,
  telegramSummaryBounds,
} from "./drafts";

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

describe("Telegram person matching", () => {
  const people = [
    { id: "michal", firstName: "Michał", lastName: "Murawski", email: "michal@example.com" },
    { id: "mateusz", firstName: "Mateusz", lastName: "Meloch", email: "mateusz@example.com" },
  ];

  it("matches a unique first name for sharing or reassignment", () => {
    expect(matchAssignablePerson(people, "Michał").person?.id).toBe("michal");
  });

  it("matches a full name and email", () => {
    expect(matchAssignablePerson(people, "Michał Murawski").person?.id).toBe("michal");
    expect(matchAssignablePerson(people, "mateusz@example.com").person?.id).toBe("mateusz");
  });

  it("requires clarification when the person is unknown", () => {
    expect(matchAssignablePerson(people, "Paweł").person).toBeNull();
    expect(matchAssignablePerson(people, "Paweł").clarification).toContain("Nie znaleziono osoby");
  });
});

describe("Telegram list date ranges", () => {
  it("builds tomorrow in the user's time zone", () => {
    const bounds = telegramSummaryBounds(
      new Date("2026-08-30T21:30:00.000Z"),
      "Europe/Warsaw",
      "TOMORROW",
    );
    expect(bounds.start.toISOString()).toBe("2026-08-30T22:00:00.000Z");
    expect(bounds.end.toISOString()).toBe("2026-08-31T22:00:00.000Z");
  });

  it("keeps the correct day length across the autumn DST change", () => {
    const bounds = telegramSummaryBounds(
      new Date("2026-10-24T10:00:00.000Z"),
      "Europe/Warsaw",
      "TOMORROW",
    );
    expect(bounds.start.toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(bounds.end.toISOString()).toBe("2026-10-25T23:00:00.000Z");
  });
});

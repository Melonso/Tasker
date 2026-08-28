import { describe, expect, it } from "vitest";

import { canAccessTask } from "./policy";

const privateTask = {
  authorId: "pawel",
  assigneeId: "pawel",
  visibility: "PRIVATE" as const,
};

describe("task access policy", () => {
  it("does not let an application administrator read another user's private task", () => {
    expect(canAccessTask({ userId: "mateusz", roles: ["APP_ADMIN", "COMPANY_MEMBER"] }, privateTask)).toBe(false);
  });

  it("lets a company member read a company task", () => {
    expect(
      canAccessTask(
        { userId: "michal", roles: ["COMPANY_MEMBER"] },
        { ...privateTask, visibility: "COMPANY" },
      ),
    ).toBe(true);
  });

  it("does not expose a company task to an external user", () => {
    expect(
      canAccessTask(
        { userId: "nadia", roles: ["EXTERNAL"] },
        { ...privateTask, visibility: "COMPANY" },
      ),
    ).toBe(false);
  });

  it("lets a directly shared external user read a shared task", () => {
    expect(
      canAccessTask(
        { userId: "nadia", roles: ["EXTERNAL"] },
        { ...privateTask, visibility: "SHARED", sharedUserIds: ["nadia"] },
      ),
    ).toBe(true);
  });
});

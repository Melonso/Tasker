import { describe, expect, it } from "vitest";

import { notificationTargetUrl } from "./target";

describe("notification target URL", () => {
  it("prefers an explicit module target", () => {
    expect(notificationTargetUrl({
      baseUrl: "https://tasker.dpkomis.pl/",
      targetPath: "/notes",
      taskId: null,
    })).toBe("https://tasker.dpkomis.pl/notes");
  });

  it("keeps task notifications linked to their task", () => {
    expect(notificationTargetUrl({
      baseUrl: "https://tasker.dpkomis.pl",
      targetPath: null,
      taskId: "task-1",
    })).toBe("https://tasker.dpkomis.pl/tasks/task-1");
  });
});

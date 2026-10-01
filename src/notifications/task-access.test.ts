import { describe, expect, it } from "vitest";

import { taskAccessDeliveryStatus, taskAccessNotificationContent } from "./task-access";

describe("task access notifications", () => {
  it("describes a newly delegated task", () => {
    expect(taskAccessNotificationContent({
      kind: "ASSIGNED",
      taskTitle: "Wysłać ofertę",
      actorName: "Nadia Kowalska",
    })).toEqual({
      title: "Nowe zadanie dla Ciebie",
      body: "Masz nowe zadanie „Wysłać ofertę”. Autor: Nadia Kowalska.",
    });
  });

  it("describes a newly shared task", () => {
    expect(taskAccessNotificationContent({
      kind: "SHARED",
      taskTitle: "Sprawdzić umowę",
      actorName: "Paweł Kurek",
    })).toEqual({
      title: "Udostępniono Ci zadanie",
      body: "Masz dostęp do zadania „Sprawdzić umowę”. Udostępnia: Paweł Kurek.",
    });
  });

  it("queues an external channel only when it is enabled and connected", () => {
    expect(taskAccessDeliveryStatus({ channelEnabled: true, channelAvailable: true })).toBe("PENDING");
    expect(taskAccessDeliveryStatus({ channelEnabled: false, channelAvailable: true })).toBe("SKIPPED");
    expect(taskAccessDeliveryStatus({ channelEnabled: true, channelAvailable: false })).toBe("SKIPPED");
  });
});

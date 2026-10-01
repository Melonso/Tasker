import { describe, expect, it, vi } from "vitest";

import { runWorkerScan } from "./scan";

describe("worker scan", () => {
  it("runs every step and records a degraded heartbeat when one step fails", async () => {
    const recordHeartbeat = vi.fn().mockResolvedValue(undefined);
    const reminders = vi.fn().mockResolvedValue({ processed: 2 });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const scan = await runWorkerScan(
      [
        { name: "draftAutoConfirm", run: () => Promise.reject(new Error("database timeout")) },
        { name: "reminders", run: reminders },
      ],
      recordHeartbeat,
    );

    expect(reminders).toHaveBeenCalledOnce();
    expect(scan.healthy).toBe(false);
    expect(recordHeartbeat).toHaveBeenCalledWith(
      {
        draftAutoConfirm: { ok: false, error: "database timeout" },
        reminders: { ok: true, result: { processed: 2 } },
      },
      "DEGRADED",
    );
  });

  it("records a healthy heartbeat when all steps succeed", async () => {
    const recordHeartbeat = vi.fn().mockResolvedValue(undefined);
    const scan = await runWorkerScan([{ name: "reminders", run: () => Promise.resolve({}) }], recordHeartbeat);
    expect(scan.healthy).toBe(true);
    expect(recordHeartbeat).toHaveBeenCalledWith({ reminders: { ok: true, result: {} } }, "HEALTHY");
  });
});

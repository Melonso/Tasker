import { processDraftAutoConfirmBatch } from "../integrations/draft-auto-confirm";
import { processGoogleCalendarBatch } from "../integrations/google/calendar-sync";
import { processDueReminderBatch, updateWorkerHeartbeat } from "../notifications/processor";
import { processWebPushBatch } from "../notifications/web-push-delivery";
import { processHousekeeping } from "./housekeeping";

type StepResult = { ok: true; result: unknown } | { ok: false; error: string };

export interface WorkerScanStep {
  name: string;
  run: () => Promise<unknown>;
}

export const defaultScanSteps: WorkerScanStep[] = [
  { name: "draftAutoConfirm", run: () => processDraftAutoConfirmBatch() },
  { name: "reminders", run: () => processDueReminderBatch() },
  { name: "webPush", run: () => processWebPushBatch() },
  { name: "googleCalendar", run: () => processGoogleCalendarBatch() },
  { name: "housekeeping", run: () => processHousekeeping() },
];

/**
 * Runs every step even when an earlier one fails, then records the heartbeat with the outcome of
 * each step. A failing integration therefore never stops reminders or hides the worker's pulse.
 */
export async function runWorkerScan(
  steps: WorkerScanStep[] = defaultScanSteps,
  recordHeartbeat: typeof updateWorkerHeartbeat = updateWorkerHeartbeat,
) {
  const results: Record<string, StepResult> = {};
  for (const step of steps) {
    try {
      results[step.name] = { ok: true, result: await step.run() };
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : "Nieznany błąd";
      console.error("Worker step failed", { step: step.name, error: message });
      results[step.name] = { ok: false, error: message };
    }
  }
  const healthy = Object.values(results).every((result) => result.ok);
  await recordHeartbeat(results, healthy ? "HEALTHY" : "DEGRADED");
  return { healthy, results };
}

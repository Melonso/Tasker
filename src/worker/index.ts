import { PgBoss } from "pg-boss";

import { getServerEnv } from "../lib/env";
import { updateWorkerHeartbeat } from "../notifications/processor";
import { runWorkerScan } from "./scan";

const REMINDER_QUEUE = "tasker-reminders-dispatch";
const env = getServerEnv();
const boss = new PgBoss({
  connectionString: env.DATABASE_URL,
  application_name: "tasker-worker",
});

boss.on("error", (error) => {
  console.error("Worker queue error", error);
});

async function shutdown(signal: string) {
  console.info(`Received ${signal}; stopping Tasker worker.`);
  await boss.stop({ graceful: true, timeout: 30_000 });
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await boss.start();
await boss.createQueue(REMINDER_QUEUE);
await boss.schedule(REMINDER_QUEUE, "* * * * *", {}, {
  tz: "UTC",
  retryLimit: 3,
  retryDelay: 30,
  retryBackoff: true,
});
await boss.work(
  REMINDER_QUEUE,
  { batchSize: env.WORKER_CONCURRENCY },
  async (jobs) => {
    // Several queued jobs mean the same thing: scan now. One scan covers all of them.
    const scan = await runWorkerScan();
    console.info("Reminder scan completed", { jobIds: jobs.map((job) => job.id), ...scan });
  },
);

await updateWorkerHeartbeat({ state: "STARTED" });
await boss.send(REMINDER_QUEUE, { reason: "startup" }, {
  singletonKey: "startup-scan",
  singletonSeconds: 60,
  retryLimit: 3,
  retryDelay: 30,
});

console.info("Tasker worker started", {
  queue: REMINDER_QUEUE,
  concurrency: env.WORKER_CONCURRENCY,
});

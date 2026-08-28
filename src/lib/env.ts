import { z } from "zod";

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_BASE_URL: z.url().default("http://localhost:3001"),
  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgres://tasker:tasker@localhost:5433/tasker"),
  SESSION_SECRET: z.string().min(32).default("local-development-session-secret-change-me"),
  INTEGRATION_ENCRYPTION_KEY: z
    .string()
    .min(32)
    .default("bG9jYWwtZGV2ZWxvcG1lbnQta2V5LWNoYW5nZS1tZQ=="),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(5),
  DEFAULT_TIME_ZONE: z.string().default("Europe/Warsaw"),
  DEFAULT_TASK_HOUR: z.coerce.number().int().min(0).max(23).default(14),
  OVERDUE_REMINDER_HOUR: z.coerce.number().int().min(0).max(23).default(9),
  SEED_PILOT_PASSWORD: z.string().min(12).optional(),
  N8N_SERVICE_SECRET: z.string().min(32).optional(),
  VAPID_PUBLIC_KEY: z.string().min(40).optional(),
  VAPID_PRIVATE_KEY: z.string().min(20).optional(),
  VAPID_SUBJECT: z.string().default("mailto:admin@dpkomis.pl"),
  GOOGLE_CLIENT_ID: z.string().min(20).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(8).optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  cachedEnv ??= serverEnvSchema.parse(process.env);
  return cachedEnv;
}

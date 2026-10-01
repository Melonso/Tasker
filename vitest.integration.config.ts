import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://tasker:tasker@localhost:5433/tasker_test";
process.env.DATABASE_URL = testDatabaseUrl;

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    globalSetup: ["src/test/integration-global-setup.ts"],
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 30_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: testDatabaseUrl,
      N8N_SERVICE_SECRET: "integration-test-service-secret-0123456789",
    },
  },
});

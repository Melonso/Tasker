import { migrate } from "drizzle-orm/postgres-js/migrator";

import { createDatabaseClient } from "./client";

const { db, sql } = createDatabaseClient(1);

try {
  await migrate(db, { migrationsFolder: "drizzle" });
  console.info("Database migrations completed.");
} finally {
  await sql.end();
}

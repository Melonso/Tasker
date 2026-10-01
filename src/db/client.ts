import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { getServerEnv } from "@/lib/env";

export function createDatabaseClient(maxConnections = 10) {
  const sql = postgres(getServerEnv().DATABASE_URL, {
    max: maxConnections,
  });

  return {
    db: drizzle(sql),
    sql,
  };
}

let sharedClient: ReturnType<typeof createDatabaseClient> | undefined;

export function getDatabaseClient() {
  sharedClient ??= createDatabaseClient();
  return sharedClient;
}

export type Database = ReturnType<typeof createDatabaseClient>["db"];
export type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

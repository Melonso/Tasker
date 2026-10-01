import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

export function assertTestDatabase(url: string | undefined) {
  if (!url) throw new Error("DATABASE_URL is required for integration tests.");
  const databaseName = new URL(url).pathname.slice(1);
  if (!/test/i.test(databaseName)) {
    throw new Error(`Refusing to run integration tests against non-test database "${databaseName}".`);
  }
  return { url, databaseName };
}

export default async function setup() {
  const { url, databaseName } = assertTestDatabase(process.env.DATABASE_URL);
  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => undefined });
  try {
    const [existing] = await admin`select 1 from pg_database where datname = ${databaseName}`;
    if (!existing) await admin.unsafe(`create database "${databaseName.replace(/"/g, '""')}"`);
  } finally {
    await admin.end();
  }

  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
  } finally {
    await sql.end();
  }
}

import { NextResponse } from "next/server";
import postgres from "postgres";

import { getServerEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const sql = postgres(getServerEnv().DATABASE_URL, { max: 1, connect_timeout: 3 });

  try {
    await sql`select 1 as ready`;
    return NextResponse.json({ status: "ready", database: "ok" });
  } catch (error) {
    console.error("Readiness check failed", error);
    return NextResponse.json({ status: "not_ready", database: "error" }, { status: 503 });
  } finally {
    await sql.end({ timeout: 1 });
  }
}

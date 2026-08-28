import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireUser } from "@/auth/session";
import { getDatabaseClient } from "@/db/client";
import { googleConnections } from "@/db/schema";
import { removeGoogleCalendarConnection } from "@/integrations/google/calendar-sync";

export async function POST() {
  const user = await requireUser();
  const { db } = getDatabaseClient();
  const [connection] = await db
    .select()
    .from(googleConnections)
    .where(eq(googleConnections.userId, user.id))
    .limit(1);
  if (connection) await removeGoogleCalendarConnection(connection);
  return NextResponse.json({ status: "DISCONNECTED" });
}

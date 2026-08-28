import { NextResponse } from "next/server";

import { requireUser } from "@/auth/session";
import { getServerEnv } from "@/lib/env";

export async function GET() {
  await requireUser();
  const publicKey = getServerEnv().VAPID_PUBLIC_KEY;
  if (!publicKey) return NextResponse.json({ error: "PUSH_NOT_CONFIGURED" }, { status: 503 });
  return NextResponse.json({ publicKey });
}

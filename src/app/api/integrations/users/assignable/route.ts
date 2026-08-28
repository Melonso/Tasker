import { NextResponse } from "next/server";
import { z } from "zod";

import { authorizeIntegrationRequest } from "@/integrations/service-auth";
import { userForTelegramId } from "@/integrations/users";
import { listAssignableUsers } from "@/tasks/queries";

export async function GET(request: Request) {
  if (!authorizeIntegrationRequest(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const telegramUserId = z.string().trim().min(1).max(80).safeParse(
    new URL(request.url).searchParams.get("telegramUserId"),
  );
  if (!telegramUserId.success) {
    return NextResponse.json({ error: "INVALID_TELEGRAM_USER_ID" }, { status: 400 });
  }
  const user = await userForTelegramId(telegramUserId.data);
  if (!user) return NextResponse.json({ error: "TELEGRAM_ACCOUNT_NOT_LINKED" }, { status: 404 });
  const assignableUsers = await listAssignableUsers(user);
  return NextResponse.json({
    author: { name: `${user.firstName} ${user.lastName}` },
    users: assignableUsers.map((person) => ({ name: `${person.firstName} ${person.lastName}` })),
  });
}

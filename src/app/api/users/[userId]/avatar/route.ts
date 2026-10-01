import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/auth/session";
import { getDatabaseClient } from "@/db/client";
import { users } from "@/db/schema";
import { parseAvatarDataUrl } from "@/settings/avatar";

export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  if (!(await getCurrentUser())) return new NextResponse(null, { status: 401 });
  const userId = z.uuid().safeParse((await params).userId);
  if (!userId.success) return new NextResponse(null, { status: 404 });

  const { db } = getDatabaseClient();
  const [user] = await db
    .select({ avatarDataUrl: users.avatarDataUrl })
    .from(users)
    .where(eq(users.id, userId.data))
    .limit(1);
  const avatar = user?.avatarDataUrl ? parseAvatarDataUrl(user.avatarDataUrl) : null;
  if (!avatar) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(avatar.bytes), {
    headers: {
      "Content-Type": avatar.mimeType,
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Security-Policy": "default-src 'none'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

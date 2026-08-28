import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/auth/session";
import { getDatabaseClient } from "@/db/client";
import { googleConnections } from "@/db/schema";
import { createGoogleOAuthClient } from "@/integrations/google/client";
import { syncGoogleCalendarConnection } from "@/integrations/google/calendar-sync";
import { verifyGoogleOAuthState } from "@/integrations/google/oauth-state";
import { encryptIntegrationSecret } from "@/integrations/google/secrets";
import { getServerEnv } from "@/lib/env";

const callbackSchema = z.object({
  code: z.string().min(10),
  state: z.string().min(20),
});

function settingsRedirect(status: string) {
  return new URL(`/settings?google=${encodeURIComponent(status)}`, getServerEnv().APP_BASE_URL);
}

export async function GET(request: Request) {
  const user = await requireUser();
  const url = new URL(request.url);
  if (url.searchParams.get("error")) return NextResponse.redirect(settingsRedirect("denied"));
  const parsed = callbackSchema.safeParse({
    code: url.searchParams.get("code"),
    state: url.searchParams.get("state"),
  });
  if (!parsed.success) return NextResponse.redirect(settingsRedirect("invalid-response"));

  try {
    const state = verifyGoogleOAuthState(parsed.data.state);
    if (state.userId !== user.id) return NextResponse.redirect(settingsRedirect("invalid-state"));

    const oauth = createGoogleOAuthClient();
    const { tokens } = await oauth.getToken(parsed.data.code);
    if (!tokens.access_token) throw new Error("Google nie zwrócił tokenu dostępu.");
    const { db } = getDatabaseClient();
    const [existing] = await db
      .select()
      .from(googleConnections)
      .where(eq(googleConnections.userId, user.id))
      .limit(1);
    const encryptedRefreshToken = tokens.refresh_token
      ? encryptIntegrationSecret(tokens.refresh_token)
      : existing?.encryptedRefreshToken;
    if (!encryptedRefreshToken) throw new Error("Google nie zwrócił tokenu odświeżania.");

    const [connection] = await db
      .insert(googleConnections)
      .values({
        userId: user.id,
        status: "CONNECTED",
        encryptedAccessToken: encryptIntegrationSecret(tokens.access_token),
        encryptedRefreshToken,
        tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        calendarId: existing?.calendarId || "primary",
      })
      .onConflictDoUpdate({
        target: googleConnections.userId,
        set: {
          status: "CONNECTED",
          encryptedAccessToken: encryptIntegrationSecret(tokens.access_token),
          encryptedRefreshToken,
          tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!connection) throw new Error("Nie udało się zapisać połączenia Google.");
    await syncGoogleCalendarConnection(connection);
    return NextResponse.redirect(settingsRedirect("connected"));
  } catch (error) {
    console.error("Google OAuth callback failed", error instanceof Error ? error.message : "Nieznany błąd");
    return NextResponse.redirect(settingsRedirect("error"));
  }
}

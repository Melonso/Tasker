import { NextResponse } from "next/server";

import { requireUser } from "@/auth/session";
import {
  createGoogleOAuthClient,
  GOOGLE_CALENDAR_SCOPE,
  googleOAuthConfigured,
} from "@/integrations/google/client";
import { createGoogleOAuthState } from "@/integrations/google/oauth-state";
import { getServerEnv } from "@/lib/env";

export async function GET() {
  const user = await requireUser();
  if (!googleOAuthConfigured()) {
    return NextResponse.redirect(new URL("/settings?google=not-configured", getServerEnv().APP_BASE_URL));
  }
  const oauth = createGoogleOAuthClient();
  const url = oauth.generateAuthUrl({
    access_type: "offline",
    include_granted_scopes: true,
    prompt: "consent",
    scope: [GOOGLE_CALENDAR_SCOPE],
    state: createGoogleOAuthState(user.id),
  });
  return NextResponse.redirect(url);
}

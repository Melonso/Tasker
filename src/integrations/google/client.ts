import { eq } from "drizzle-orm";
import { google } from "googleapis";

import { getDatabaseClient } from "@/db/client";
import { googleConnections } from "@/db/schema";
import { getServerEnv } from "@/lib/env";

import { decryptIntegrationSecret, encryptIntegrationSecret } from "./secrets";

export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export function googleOAuthConfigured() {
  const env = getServerEnv();
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export function googleCallbackUrl() {
  return `${getServerEnv().APP_BASE_URL.replace(/\/$/, "")}/api/integrations/google/callback`;
}

export function createGoogleOAuthClient() {
  const env = getServerEnv();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new Error("Integracja Google Calendar nie jest jeszcze skonfigurowana.");
  }
  return new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, googleCallbackUrl());
}

export type GoogleConnection = typeof googleConnections.$inferSelect;

export async function authorizedGoogleClient(connection: GoogleConnection) {
  const oauth = createGoogleOAuthClient();
  oauth.setCredentials({
    access_token: decryptIntegrationSecret(connection.encryptedAccessToken),
    refresh_token: connection.encryptedRefreshToken
      ? decryptIntegrationSecret(connection.encryptedRefreshToken)
      : undefined,
    expiry_date: connection.tokenExpiresAt?.getTime(),
  });

  try {
    const accessToken = await oauth.getAccessToken();
    if (!accessToken.token) throw new Error("Google nie zwrócił aktywnego tokenu dostępu.");
    const credentials = oauth.credentials;
    const nextExpiry = credentials.expiry_date ? new Date(credentials.expiry_date) : connection.tokenExpiresAt;
    if (
      credentials.access_token &&
      (credentials.access_token !== decryptIntegrationSecret(connection.encryptedAccessToken) ||
        nextExpiry?.getTime() !== connection.tokenExpiresAt?.getTime())
    ) {
      const { db } = getDatabaseClient();
      await db
        .update(googleConnections)
        .set({
          encryptedAccessToken: encryptIntegrationSecret(credentials.access_token),
          encryptedRefreshToken: credentials.refresh_token
            ? encryptIntegrationSecret(credentials.refresh_token)
            : connection.encryptedRefreshToken,
          tokenExpiresAt: nextExpiry,
          status: "CONNECTED",
          updatedAt: new Date(),
        })
        .where(eq(googleConnections.userId, connection.userId));
    }
    return oauth;
  } catch (error) {
    const { db } = getDatabaseClient();
    await db
      .update(googleConnections)
      .set({ status: "NEEDS_ATTENTION", updatedAt: new Date() })
      .where(eq(googleConnections.userId, connection.userId));
    throw error;
  }
}

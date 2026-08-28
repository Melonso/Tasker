import { createHash, randomBytes } from "node:crypto";

export const INVITATION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export function createInvitationToken() {
  return randomBytes(32).toString("base64url");
}

export function hashInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function invitationExpiresAt(now = new Date()) {
  return new Date(now.getTime() + INVITATION_DURATION_MS);
}

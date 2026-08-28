import { describe, expect, it } from "vitest";

import {
  INVITATION_DURATION_MS,
  createInvitationToken,
  hashInvitationToken,
  invitationExpiresAt,
} from "./invitations";

describe("invitation tokens", () => {
  it("generates opaque unique tokens and stable hashes", () => {
    const first = createInvitationToken();
    const second = createInvitationToken();

    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(40);
    expect(hashInvitationToken(first)).toBe(hashInvitationToken(first));
    expect(hashInvitationToken(first)).not.toBe(hashInvitationToken(second));
  });

  it("expires invitations after seven days", () => {
    const now = new Date("2026-08-28T10:00:00.000Z");
    expect(invitationExpiresAt(now).getTime() - now.getTime()).toBe(INVITATION_DURATION_MS);
  });
});

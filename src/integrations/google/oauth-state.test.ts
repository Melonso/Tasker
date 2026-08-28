import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  getServerEnv: () => ({ SESSION_SECRET: "test-session-secret-at-least-thirty-two-characters" }),
}));

import { createGoogleOAuthState, verifyGoogleOAuthState } from "./oauth-state";

describe("Google OAuth state", () => {
  it("round-trips a signed state", () => {
    const state = createGoogleOAuthState("11111111-1111-4111-8111-111111111111", 1_000);
    expect(verifyGoogleOAuthState(state, 2_000).userId).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("rejects tampering and expiration", () => {
    const state = createGoogleOAuthState("11111111-1111-4111-8111-111111111111", 1_000);
    expect(() => verifyGoogleOAuthState(`${state}x`, 2_000)).toThrow();
    expect(() => verifyGoogleOAuthState(state, 1_000 + 11 * 60 * 1_000)).toThrow(/wygasło/);
  });
});

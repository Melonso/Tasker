import { describe, expect, it } from "vitest";

import { isPermanentGoogleAuthError } from "./client";

describe("Google authorization errors", () => {
  it("treats a revoked or invalid grant as permanent", () => {
    expect(isPermanentGoogleAuthError({ response: { status: 400, data: { error: "invalid_grant" } } })).toBe(true);
    expect(isPermanentGoogleAuthError({ response: { status: 401, data: {} } })).toBe(true);
    expect(isPermanentGoogleAuthError(new Error("invalid_grant: Token has been expired or revoked."))).toBe(true);
  });

  it("treats network failures and server errors as transient", () => {
    expect(isPermanentGoogleAuthError(new Error("getaddrinfo EAI_AGAIN oauth2.googleapis.com"))).toBe(false);
    expect(isPermanentGoogleAuthError({ response: { status: 503, data: { error: "backendError" } } })).toBe(false);
    expect(isPermanentGoogleAuthError(null)).toBe(false);
  });
});

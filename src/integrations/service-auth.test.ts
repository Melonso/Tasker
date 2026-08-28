import { describe, expect, it } from "vitest";

import { isServiceTokenValid } from "./service-auth";

describe("integration service authentication", () => {
  const secret = "a-secure-test-secret-with-at-least-32-characters";

  it("accepts only the exact bearer token", () => {
    expect(isServiceTokenValid(`Bearer ${secret}`, secret)).toBe(true);
    expect(isServiceTokenValid("Bearer wrong", secret)).toBe(false);
  });

  it("fails closed when configuration or header is missing", () => {
    expect(isServiceTokenValid(null, secret)).toBe(false);
    expect(isServiceTokenValid(`Bearer ${secret}`, undefined)).toBe(false);
    expect(isServiceTokenValid(secret, secret)).toBe(false);
  });
});

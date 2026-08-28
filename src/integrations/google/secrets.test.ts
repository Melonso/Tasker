import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  getServerEnv: () => ({ INTEGRATION_ENCRYPTION_KEY: "test-encryption-key-at-least-thirty-two-characters" }),
}));

import { decryptIntegrationSecret, encryptIntegrationSecret } from "./secrets";

describe("integration secret encryption", () => {
  it("encrypts with a random nonce and decrypts", () => {
    const first = encryptIntegrationSecret("refresh-token");
    const second = encryptIntegrationSecret("refresh-token");
    expect(first).not.toBe(second);
    expect(decryptIntegrationSecret(first)).toBe("refresh-token");
  });

  it("rejects modified ciphertext", () => {
    const encrypted = encryptIntegrationSecret("refresh-token");
    expect(() => decryptIntegrationSecret(`${encrypted}x`)).toThrow();
  });
});

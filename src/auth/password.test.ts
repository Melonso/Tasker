import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies the correct password and rejects a different one", async () => {
    const hash = await hashPassword("bardzo-bezpieczne-haslo");

    await expect(verifyPassword("bardzo-bezpieczne-haslo", hash)).resolves.toBe(true);
    await expect(verifyPassword("zupelnie-inne-haslo", hash)).resolves.toBe(false);
  });

  it("uses a unique salt for every password", async () => {
    const first = await hashPassword("bardzo-bezpieczne-haslo");
    const second = await hashPassword("bardzo-bezpieczne-haslo");
    expect(first).not.toBe(second);
  });
});

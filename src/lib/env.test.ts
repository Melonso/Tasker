import { describe, expect, it } from "vitest";

import { parseServerEnv } from "./env";

const productionSecrets = {
  SESSION_SECRET: "production-session-secret-0123456789abcdef",
  INTEGRATION_ENCRYPTION_KEY: "cHJvZHVjdGlvbi1lbmNyeXB0aW9uLWtleS0wMTIzNDU2Nzg5",
};

describe("server environment", () => {
  it("falls back to development secrets outside production", () => {
    expect(() => parseServerEnv({ NODE_ENV: "development" })).not.toThrow();
  });

  it("refuses to start production without explicit secrets", () => {
    expect(() => parseServerEnv({ NODE_ENV: "production" })).toThrow(/SESSION_SECRET/);
    expect(() =>
      parseServerEnv({ NODE_ENV: "production", SESSION_SECRET: productionSecrets.SESSION_SECRET }),
    ).toThrow(/INTEGRATION_ENCRYPTION_KEY/);
  });

  it("accepts production with explicit secrets", () => {
    expect(() => parseServerEnv({ NODE_ENV: "production", ...productionSecrets })).not.toThrow();
  });
});

import { describe, expect, it } from "vitest";

import { isCompanyUser } from "./policy";

describe("company membership", () => {
  it("treats business owners and company members as company users", () => {
    expect(isCompanyUser(["BUSINESS_OWNER"])).toBe(true);
    expect(isCompanyUser(["APP_ADMIN", "COMPANY_MEMBER"])).toBe(true);
  });

  it("does not treat external users or administrators alone as company users", () => {
    expect(isCompanyUser(["EXTERNAL"])).toBe(false);
    expect(isCompanyUser(["APP_ADMIN"])).toBe(false);
  });
});

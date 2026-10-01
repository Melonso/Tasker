/** Business owners and company members see company tasks; external users never do. */
export function isCompanyUser(roles: string[]) {
  return roles.some((role) =>
    ["BUSINESS_OWNER", "COMPANY_MEMBER"].includes(role),
  );
}

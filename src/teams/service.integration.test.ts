import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { getDatabaseClient } from "@/db/client";
import { teamMembers, teams } from "@/db/schema";
import { createTestUser, setupIntegrationDatabase } from "@/test/integration";

import { addTeamMemberForUser } from "./service";

setupIntegrationDatabase();

describe("team membership", () => {
  it("rejects an external user in a company team but accepts them in an external team", async () => {
    const owner = await createTestUser({ roles: ["BUSINESS_OWNER", "COMPANY_MEMBER"] });
    const external = await createTestUser({ roles: ["EXTERNAL"] });
    const colleague = await createTestUser();
    const { db } = getDatabaseClient();
    const [companyTeam] = await db.insert(teams).values({ name: "Firma", createdById: owner.id }).returning();
    const [externalTeam] = await db
      .insert(teams)
      .values({ name: "Partnerzy", createdById: owner.id, isExternal: true })
      .returning();

    await expect(addTeamMemberForUser(owner, companyTeam!.id, external.id)).rejects.toThrow(
      "Do zespołu firmowego nie można dodać osoby zewnętrznej.",
    );
    await addTeamMemberForUser(owner, companyTeam!.id, colleague.id);
    await addTeamMemberForUser(owner, externalTeam!.id, external.id);

    const companyMembers = await db.select().from(teamMembers).where(eq(teamMembers.teamId, companyTeam!.id));
    const externalMembers = await db.select().from(teamMembers).where(eq(teamMembers.teamId, externalTeam!.id));
    expect(companyMembers.map((member) => member.userId)).toEqual([colleague.id]);
    expect(externalMembers.map((member) => member.userId)).toEqual([external.id]);
  });

  it("does not let an owner change another owner's team", async () => {
    const owner = await createTestUser({ roles: ["BUSINESS_OWNER"] });
    const otherOwner = await createTestUser({ roles: ["BUSINESS_OWNER"] });
    const colleague = await createTestUser();
    const { db } = getDatabaseClient();
    const [team] = await db.insert(teams).values({ name: "Cudzy", createdById: otherOwner.id }).returning();
    await expect(addTeamMemberForUser(owner, team!.id, colleague.id)).rejects.toThrow("Nie znaleziono zespołu");
  });
});

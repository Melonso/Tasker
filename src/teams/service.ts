import { and, eq } from "drizzle-orm";

import type { AuthenticatedUser } from "@/auth/session";
import { getDatabaseClient } from "@/db/client";
import { auditEvents, roles, teamMembers, teams, userRoles, users } from "@/db/schema";
import { UserInputError } from "@/lib/errors";

/**
 * Adds an active user to a team owned by the business owner. Only teams created with the
 * "may contain external people" flag accept external users.
 */
export async function addTeamMemberForUser(owner: AuthenticatedUser, teamId: string, memberId: string) {
  const { db } = getDatabaseClient();
  const [team] = await db
    .select({ id: teams.id, isExternal: teams.isExternal })
    .from(teams)
    .where(and(eq(teams.id, teamId), eq(teams.createdById, owner.id)))
    .limit(1);
  if (!team) throw new UserInputError("Nie znaleziono zespołu lub nie masz do niego uprawnień.");

  const memberRows = await db
    .select({ id: users.id, role: roles.key })
    .from(users)
    .leftJoin(userRoles, eq(userRoles.userId, users.id))
    .leftJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(users.id, memberId), eq(users.isActive, true)));
  if (!memberRows.length) throw new UserInputError("Wybrany użytkownik nie jest aktywny.");
  if (!team.isExternal && memberRows.some((row) => row.role === "EXTERNAL")) {
    throw new UserInputError(
      "Do zespołu firmowego nie można dodać osoby zewnętrznej. Utwórz zespół z opcją osób zewnętrznych.",
    );
  }

  await db.transaction(async (tx) => {
    await tx.insert(teamMembers).values({ teamId, userId: memberId }).onConflictDoNothing();
    await tx.insert(auditEvents).values({
      actorId: owner.id,
      action: "TEAM_MEMBER_ADDED",
      metadata: { teamId, memberId },
    });
  });
}

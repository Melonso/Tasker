"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/auth/session";
import { getDatabaseClient } from "@/db/client";
import { auditEvents, teamMembers, teams, users } from "@/db/schema";

const teamIdSchema = z.uuid();

async function ownedTeam(teamId: string, userId: string) {
  const { db } = getDatabaseClient();
  const [team] = await db
    .select()
    .from(teams)
    .where(and(eq(teams.id, teamId), eq(teams.createdById, userId)))
    .limit(1);
  if (!team) throw new Error("Nie znaleziono zespołu lub nie masz do niego uprawnień.");
  return team;
}

export async function createTeamAction(formData: FormData) {
  const user = await requireRole("BUSINESS_OWNER");
  const name = z.string().trim().min(2).max(160).parse(formData.get("name"));
  const isExternal = formData.get("isExternal") === "on";
  const { db } = getDatabaseClient();
  await db.transaction(async (tx) => {
    const [team] = await tx
      .insert(teams)
      .values({ name, isExternal, createdById: user.id })
      .onConflictDoNothing()
      .returning({ id: teams.id });
    if (!team) throw new Error("Zespół o tej nazwie już istnieje.");
    await tx.insert(teamMembers).values({ teamId: team.id, userId: user.id });
    await tx.insert(auditEvents).values({
      actorId: user.id,
      action: "TEAM_CREATED",
      metadata: { teamId: team.id, name, isExternal },
    });
  });
  revalidatePath("/teams");
}

export async function addTeamMemberAction(formData: FormData) {
  const user = await requireRole("BUSINESS_OWNER");
  const teamId = teamIdSchema.parse(formData.get("teamId"));
  const memberId = z.uuid().parse(formData.get("userId"));
  await ownedTeam(teamId, user.id);
  const { db } = getDatabaseClient();
  const [member] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, memberId), eq(users.isActive, true)))
    .limit(1);
  if (!member) throw new Error("Wybrany użytkownik nie jest aktywny.");
  await db.transaction(async (tx) => {
    await tx.insert(teamMembers).values({ teamId, userId: memberId }).onConflictDoNothing();
    await tx.insert(auditEvents).values({
      actorId: user.id,
      action: "TEAM_MEMBER_ADDED",
      metadata: { teamId, memberId },
    });
  });
  revalidatePath("/teams");
}

export async function removeTeamMemberAction(formData: FormData) {
  const user = await requireRole("BUSINESS_OWNER");
  const teamId = teamIdSchema.parse(formData.get("teamId"));
  const memberId = z.uuid().parse(formData.get("userId"));
  await ownedTeam(teamId, user.id);
  if (memberId === user.id) throw new Error("Właściciel nie może usunąć siebie z zespołu.");
  const { db } = getDatabaseClient();
  await db.transaction(async (tx) => {
    await tx
      .delete(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, memberId)));
    await tx.insert(auditEvents).values({
      actorId: user.id,
      action: "TEAM_MEMBER_REMOVED",
      metadata: { teamId, memberId },
    });
  });
  revalidatePath("/teams");
}

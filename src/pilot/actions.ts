"use server";

import { and, eq, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireRole } from "@/auth/session";
import { getDatabaseClient } from "@/db/client";
import { auditEvents, pilotParticipants, pilotPrograms, users } from "@/db/schema";

const PILOT_PEOPLE = [
  ["Paweł", "Kurek"],
  ["Mateusz", "Meloch"],
  ["Michał", "Murawski"],
  ["Nadia", "Kamieniecka-Nowak"],
] as const;

export async function startPilotAction() {
  const admin = await requireRole("APP_ADMIN");
  const { db } = getDatabaseClient();
  const participants = await db
    .select({ id: users.id })
    .from(users)
    .where(and(
      eq(users.isActive, true),
      or(...PILOT_PEOPLE.map(([firstName, lastName]) => and(eq(users.firstName, firstName), eq(users.lastName, lastName))))!,
    ));
  if (participants.length !== PILOT_PEOPLE.length) {
    throw new Error("Pilotaż wymaga czterech aktywnych kont początkowych.");
  }
  await db.transaction(async (tx) => {
    const [active] = await tx
      .select({ id: pilotPrograms.id })
      .from(pilotPrograms)
      .where(eq(pilotPrograms.status, "ACTIVE"))
      .limit(1);
    if (active) return;
    const startedAt = new Date();
    const endsAt = new Date(startedAt.getTime() + 14 * 24 * 60 * 60 * 1_000);
    const [pilot] = await tx
      .insert(pilotPrograms)
      .values({ createdById: admin.id, startedAt, endsAt })
      .returning({ id: pilotPrograms.id });
    if (!pilot) throw new Error("Nie udało się uruchomić pilotażu.");
    await tx.insert(pilotParticipants).values(participants.map((participant) => ({ pilotId: pilot.id, userId: participant.id })));
    await tx.insert(auditEvents).values({
      actorId: admin.id,
      action: "PILOT_STARTED",
      metadata: { pilotId: pilot.id, participantCount: participants.length, endsAt: endsAt.toISOString() },
    });
  });
  revalidatePath("/admin");
}

export async function finishPilotAction() {
  const admin = await requireRole("APP_ADMIN");
  const { db } = getDatabaseClient();
  const [pilot] = await db
    .update(pilotPrograms)
    .set({ status: "COMPLETED", completedAt: new Date(), updatedAt: new Date() })
    .where(eq(pilotPrograms.status, "ACTIVE"))
    .returning({ id: pilotPrograms.id });
  if (pilot) {
    await db.insert(auditEvents).values({ actorId: admin.id, action: "PILOT_COMPLETED", metadata: { pilotId: pilot.id } });
  }
  revalidatePath("/admin");
}

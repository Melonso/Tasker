"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireRole } from "@/auth/session";
import { getDatabaseClient } from "@/db/client";
import { auditEvents, pilotParticipants, pilotPrograms, users } from "@/db/schema";
import { UserInputError } from "@/lib/errors";
import { runFormAction } from "@/lib/flash";
import { pilotUsers } from "@/lib/pilot-users";

const PILOT_EMAILS = pilotUsers.map((pilotUser) => pilotUser.email);

export async function startPilotAction() {
  await runFormAction(async () => {
    const admin = await requireRole("APP_ADMIN");
    const { db } = getDatabaseClient();
    const participants = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.isActive, true), inArray(users.email, PILOT_EMAILS)));
    if (participants.length !== PILOT_EMAILS.length) {
      throw new UserInputError("Pilotaż wymaga czterech aktywnych kont początkowych.");
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
      if (!pilot) throw new UserInputError("Nie udało się uruchomić pilotażu.");
      await tx.insert(pilotParticipants).values(participants.map((participant) => ({ pilotId: pilot.id, userId: participant.id })));
      await tx.insert(auditEvents).values({
        actorId: admin.id,
        action: "PILOT_STARTED",
        metadata: { pilotId: pilot.id, participantCount: participants.length, endsAt: endsAt.toISOString() },
      });
    });
    revalidatePath("/admin");
  });
}

export async function finishPilotAction() {
  await runFormAction(async () => {
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
  });
}

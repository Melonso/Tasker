"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/auth/session";
import { getDatabaseClient } from "@/db/client";
import { auditEvents, noteReminderSchedules } from "@/db/schema";
import { nextNoteReminderAt } from "@/notes/reminders";

const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

export async function createNoteReminderScheduleAction(formData: FormData) {
  const user = await requireUser();
  const frequency = z.enum(["DAILY", "WEEKLY"]).parse(formData.get("frequency"));
  const weekday = frequency === "WEEKLY"
    ? z.coerce.number().int().min(0).max(6).parse(formData.get("weekday"))
    : null;
  const time = timeSchema.parse(formData.get("time"));
  const hour = Number(time.slice(0, 2));
  const minute = Number(time.slice(3, 5));
  const nextReminderAt = nextNoteReminderAt({
    now: new Date(),
    timeZone: user.timeZone,
    frequency,
    weekday,
    hour,
    minute,
  });
  const { db } = getDatabaseClient();
  await db.transaction(async (tx) => {
    const [schedule] = await tx
      .insert(noteReminderSchedules)
      .values({ userId: user.id, frequency, weekday, hour, minute, nextReminderAt })
      .returning({ id: noteReminderSchedules.id });
    if (!schedule) throw new Error("Nie udało się dodać przypomnienia.");
    await tx.insert(auditEvents).values({
      actorId: user.id,
      action: "NOTE_REMINDER_CREATED",
      metadata: { scheduleId: schedule.id, frequency, weekday, hour, minute },
    });
  });
  revalidatePath("/settings");
}

export async function toggleNoteReminderScheduleAction(formData: FormData) {
  const user = await requireUser();
  const scheduleId = z.uuid().parse(formData.get("scheduleId"));
  const enabled = z.enum(["true", "false"]).parse(formData.get("enabled")) === "true";
  const { db } = getDatabaseClient();
  const [schedule] = await db
    .select()
    .from(noteReminderSchedules)
    .where(and(eq(noteReminderSchedules.id, scheduleId), eq(noteReminderSchedules.userId, user.id)))
    .limit(1);
  if (!schedule) throw new Error("Nie znaleziono harmonogramu.");
  await db.transaction(async (tx) => {
    await tx
      .update(noteReminderSchedules)
      .set({
        enabled,
        nextReminderAt: enabled
          ? nextNoteReminderAt({
              now: new Date(),
              timeZone: user.timeZone,
              frequency: schedule.frequency,
              weekday: schedule.weekday,
              hour: schedule.hour,
              minute: schedule.minute,
            })
          : schedule.nextReminderAt,
        updatedAt: new Date(),
      })
      .where(eq(noteReminderSchedules.id, schedule.id));
    await tx.insert(auditEvents).values({
      actorId: user.id,
      action: enabled ? "NOTE_REMINDER_ENABLED" : "NOTE_REMINDER_DISABLED",
      metadata: { scheduleId },
    });
  });
  revalidatePath("/settings");
}

export async function deleteNoteReminderScheduleAction(formData: FormData) {
  const user = await requireUser();
  const scheduleId = z.uuid().parse(formData.get("scheduleId"));
  const { db } = getDatabaseClient();
  await db.transaction(async (tx) => {
    const [removed] = await tx
      .delete(noteReminderSchedules)
      .where(and(eq(noteReminderSchedules.id, scheduleId), eq(noteReminderSchedules.userId, user.id)))
      .returning({ id: noteReminderSchedules.id });
    if (!removed) throw new Error("Nie znaleziono harmonogramu.");
    await tx.insert(auditEvents).values({
      actorId: user.id,
      action: "NOTE_REMINDER_DELETED",
      metadata: { scheduleId },
    });
  });
  revalidatePath("/settings");
}

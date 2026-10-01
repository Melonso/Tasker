import { count, desc, eq } from "drizzle-orm";

import { getDatabaseClient } from "@/db/client";
import { noteReminderSchedules, notes } from "@/db/schema";

export async function listNotes(userId: string) {
  const { db } = getDatabaseClient();
  return db.select().from(notes).where(eq(notes.userId, userId)).orderBy(desc(notes.updatedAt));
}

export async function countNotes(userId: string) {
  const { db } = getDatabaseClient();
  const [row] = await db.select({ value: count() }).from(notes).where(eq(notes.userId, userId));
  return Number(row?.value ?? 0);
}

export async function listNoteReminderSchedules(userId: string) {
  const { db } = getDatabaseClient();
  return db
    .select()
    .from(noteReminderSchedules)
    .where(eq(noteReminderSchedules.userId, userId))
    .orderBy(noteReminderSchedules.hour, noteReminderSchedules.minute, noteReminderSchedules.weekday);
}

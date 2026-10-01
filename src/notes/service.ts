import { eq } from "drizzle-orm";

import { getDatabaseClient } from "@/db/client";
import { auditEvents, notes } from "@/db/schema";
import { noteTitleFromBody, type NoteColor } from "@/notes/model";

export async function createNoteForUser({
  userId,
  title,
  body,
  color = "NEUTRAL",
  sourceEventId,
}: {
  userId: string;
  title?: string | null;
  body: string;
  color?: NoteColor;
  sourceEventId?: string | null;
}) {
  const normalizedBody = body.trim();
  const normalizedTitle = title?.trim() || noteTitleFromBody(normalizedBody);
  const { db } = getDatabaseClient();

  return db.transaction(async (tx) => {
    if (sourceEventId) {
      const [existing] = await tx.select().from(notes).where(eq(notes.sourceEventId, sourceEventId)).limit(1);
      if (existing) {
        if (existing.userId !== userId) throw new Error("Source event is already assigned.");
        return { note: existing, created: false };
      }
    }

    const [note] = await tx
      .insert(notes)
      .values({ userId, title: normalizedTitle, body: normalizedBody, color, sourceEventId })
      .returning();
    if (!note) throw new Error("Nie udało się zapisać notatki.");
    await tx.insert(auditEvents).values({
      actorId: userId,
      action: "NOTE_CREATED",
      metadata: { noteId: note.id, source: sourceEventId ? "TELEGRAM" : "WEB" },
    });
    return { note, created: true };
  });
}

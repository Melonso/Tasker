"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/auth/session";
import { getDatabaseClient } from "@/db/client";
import { auditEvents, notes } from "@/db/schema";
import { noteColors, noteTitleFromBody } from "@/notes/model";
import { createNoteForUser } from "@/notes/service";

const noteInputSchema = z.object({
  title: z.string().trim().max(160).optional(),
  body: z.string().trim().min(1, "Treść notatki nie może być pusta.").max(10_000),
  color: z.enum(noteColors),
});

export interface NoteFormState {
  error?: string;
  success?: string;
}

export async function createNoteAction(
  _state: NoteFormState,
  formData: FormData,
): Promise<NoteFormState> {
  const user = await requireUser();
  const parsed = noteInputSchema.safeParse({
    title: formData.get("title") || undefined,
    body: formData.get("body"),
    color: formData.get("color") || "NEUTRAL",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Sprawdź notatkę." };
  await createNoteForUser({ userId: user.id, ...parsed.data });
  revalidatePath("/notes");
  return { success: "Notatka została zapisana." };
}

export async function updateNoteAction(
  _state: NoteFormState,
  formData: FormData,
): Promise<NoteFormState> {
  const user = await requireUser();
  const noteId = z.uuid().parse(formData.get("noteId"));
  const parsed = noteInputSchema.safeParse({
    title: formData.get("title") || undefined,
    body: formData.get("body"),
    color: formData.get("color") || "NEUTRAL",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Sprawdź notatkę." };
  const { db } = getDatabaseClient();
  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(notes)
      .set({ ...parsed.data, title: parsed.data.title || noteTitleFromBody(parsed.data.body), updatedAt: new Date() })
      .where(and(eq(notes.id, noteId), eq(notes.userId, user.id)))
      .returning({ id: notes.id });
    if (!updated) throw new Error("Nie znaleziono notatki lub nie masz do niej dostępu.");
    await tx.insert(auditEvents).values({
      actorId: user.id,
      action: "NOTE_UPDATED",
      metadata: { noteId, color: parsed.data.color },
    });
  });
  revalidatePath("/notes");
  return { success: "Zmiany zostały zapisane." };
}

export async function deleteNoteAction(formData: FormData) {
  const user = await requireUser();
  const noteId = z.uuid().parse(formData.get("noteId"));
  const { db } = getDatabaseClient();
  await db.transaction(async (tx) => {
    const [removed] = await tx
      .delete(notes)
      .where(and(eq(notes.id, noteId), eq(notes.userId, user.id)))
      .returning({ id: notes.id });
    if (!removed) throw new Error("Nie znaleziono notatki lub nie masz do niej dostępu.");
    await tx.insert(auditEvents).values({
      actorId: user.id,
      action: "NOTE_DELETED",
      metadata: { noteId },
    });
  });
  revalidatePath("/notes");
}

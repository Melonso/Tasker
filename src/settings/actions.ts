"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/auth/session";
import { getDatabaseClient } from "@/db/client";
import { auditEvents, users } from "@/db/schema";
import { AvatarInputError, avatarDataUrlFromUpload } from "@/settings/avatar";

const fullHour = z.string().regex(/^(?:[01]\d|2[0-3]):00$/);
const settingsSchema = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(160),
  defaultTaskTime: fullHour,
  overdueReminderTime: fullHour,
  timeZone: z.literal("Europe/Warsaw"),
  language: z.literal("pl"),
});

export interface SettingsState {
  error?: string;
  success?: string;
}

export async function updateUserSettingsAction(
  _state: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await requireUser();
  const parsed = settingsSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    defaultTaskTime: formData.get("defaultTaskTime"),
    overdueReminderTime: formData.get("overdueReminderTime"),
    timeZone: formData.get("timeZone"),
    language: formData.get("language"),
  });
  if (!parsed.success) return { error: "Sprawdź profil oraz godziny. Obsługiwane są pełne godziny." };

  const avatarUpload = formData.get("avatar");
  let avatarDataUrl: string | undefined;
  try {
    if (avatarUpload instanceof File) {
      avatarDataUrl = (await avatarDataUrlFromUpload(avatarUpload)) ?? undefined;
    }
  } catch (error) {
    if (error instanceof AvatarInputError) return { error: error.message };
    throw error;
  }

  const defaultTaskHour = Number(parsed.data.defaultTaskTime.slice(0, 2));
  const overdueReminderHour = Number(parsed.data.overdueReminderTime.slice(0, 2));
  const { db } = getDatabaseClient();
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        defaultTaskHour,
        overdueReminderHour,
        timeZone: parsed.data.timeZone,
        language: parsed.data.language,
        ...(avatarDataUrl ? { avatarDataUrl } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));
    await tx.insert(auditEvents).values({
      actorId: user.id,
      action: "USER_SETTINGS_UPDATED",
      metadata: {
        defaultTaskHour,
        overdueReminderHour,
        timeZone: parsed.data.timeZone,
        avatarUpdated: Boolean(avatarDataUrl),
      },
    });
  });

  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { success: "Ustawienia zostały zapisane." };
}

export async function removeAvatarAction() {
  const user = await requireUser();
  const { db } = getDatabaseClient();
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ avatarDataUrl: null, updatedAt: new Date() })
      .where(eq(users.id, user.id));
    await tx.insert(auditEvents).values({
      actorId: user.id,
      action: "USER_AVATAR_REMOVED",
    });
  });
  revalidatePath("/settings");
  revalidatePath("/", "layout");
}

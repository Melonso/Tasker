"use server";

import { and, eq, gt, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDatabaseClient } from "@/db/client";
import { auditEvents, invitations, sessions, users } from "@/db/schema";
import { getServerEnv } from "@/lib/env";

import { createInvitationToken, hashInvitationToken, invitationExpiresAt } from "./invitations";
import { hashPassword } from "./password";
import { createSession, requireRole } from "./session";

const activationSchema = z
  .object({
    token: z.string().min(32),
    password: z.string().min(12, "Hasło musi mieć co najmniej 12 znaków."),
    passwordConfirmation: z.string(),
  })
  .refine((value) => value.password === value.passwordConfirmation, {
    message: "Hasła nie są identyczne.",
    path: ["passwordConfirmation"],
  });

const invitationSchema = z.object({ userId: z.uuid() });

export interface ActivationState {
  error?: string;
}

export interface InvitationState {
  error?: string;
  invitationUrl?: string;
  invitedName?: string;
}

export async function activateAccountAction(
  _state: ActivationState,
  formData: FormData,
): Promise<ActivationState> {
  const parsed = activationSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    passwordConfirmation: formData.get("passwordConfirmation"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Nieprawidłowe dane aktywacji." };
  }

  const tokenHash = hashInvitationToken(parsed.data.token);
  const passwordHash = await hashPassword(parsed.data.password);
  const { db } = getDatabaseClient();
  const [invitation] = await db
    .select()
    .from(invitations)
    .where(
      and(
        eq(invitations.tokenHash, tokenHash),
        isNull(invitations.acceptedAt),
        gt(invitations.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!invitation) return { error: "Link aktywacyjny jest nieprawidłowy, wygasł lub został już użyty." };

  const userId = await db.transaction(async (tx) => {
    const [accepted] = await tx
      .update(invitations)
      .set({ acceptedAt: new Date() })
      .where(and(eq(invitations.id, invitation.id), isNull(invitations.acceptedAt)))
      .returning({ id: invitations.id });
    if (!accepted) return null;

    const [user] = await tx
      .update(users)
      .set({ passwordHash, isActive: true, updatedAt: new Date() })
      .where(eq(users.email, invitation.email))
      .returning({ id: users.id });
    if (!user) throw new Error("Zaproszenie nie jest powiązane z kontem użytkownika.");

    await tx.delete(sessions).where(eq(sessions.userId, user.id));
    await tx.insert(auditEvents).values({
      actorId: user.id,
      action: "ACCOUNT_ACTIVATED",
      metadata: { invitationId: invitation.id },
    });
    return user.id;
  });

  if (!userId) return { error: "Link aktywacyjny został już użyty." };
  await createSession(userId);
  redirect("/");
}

export async function createInvitationAction(
  _state: InvitationState,
  formData: FormData,
): Promise<InvitationState> {
  const administrator = await requireRole("APP_ADMIN");
  const parsed = invitationSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) return { error: "Wybierz użytkownika." };

  const { db } = getDatabaseClient();
  const [invitedUser] = await db
    .select({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(eq(users.id, parsed.data.userId))
    .limit(1);
  if (!invitedUser) return { error: "Nie znaleziono użytkownika." };

  const token = createInvitationToken();
  await db.transaction(async (tx) => {
    await tx
      .delete(invitations)
      .where(and(eq(invitations.email, invitedUser.email), isNull(invitations.acceptedAt)));
    const [invitation] = await tx
      .insert(invitations)
      .values({
        email: invitedUser.email,
        tokenHash: hashInvitationToken(token),
        invitedById: administrator.id,
        expiresAt: invitationExpiresAt(),
      })
      .returning({ id: invitations.id });
    await tx.insert(auditEvents).values({
      actorId: administrator.id,
      action: "INVITATION_CREATED",
      metadata: { invitationId: invitation?.id, invitedUserId: invitedUser.id },
    });
  });

  return {
    invitationUrl: `${getServerEnv().APP_BASE_URL}/activate?token=${encodeURIComponent(token)}`,
    invitedName: `${invitedUser.firstName} ${invitedUser.lastName}`,
  };
}

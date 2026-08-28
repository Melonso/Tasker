"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createDatabaseClient } from "@/db/client";
import { users } from "@/db/schema";

import { verifyPassword } from "./password";
import { createSession, deleteCurrentSession } from "./session";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export interface LoginState {
  error?: string;
}

export async function loginAction(_state: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Wpisz poprawny adres e-mail i hasło." };

  const { db, sql } = createDatabaseClient(1);
  try {
    const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
    const valid = Boolean(
      user?.isActive &&
        user.passwordHash &&
        (await verifyPassword(parsed.data.password, user.passwordHash)),
    );
    if (!user || !valid) return { error: "Nieprawidłowy e-mail lub hasło." };
    await createSession(user.id);
  } finally {
    await sql.end();
  }

  redirect("/");
}

export async function logoutAction() {
  await deleteCurrentSession();
  redirect("/login");
}

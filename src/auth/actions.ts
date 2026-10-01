"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { authenticateWithPassword, LOGIN_WINDOW_MINUTES } from "./login";
import { createSession, deleteCurrentSession } from "./session";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(1_024),
});

export interface LoginState {
  error?: string;
}

async function clientIpAddress() {
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("cf-connecting-ip") ?? requestHeaders.get("x-forwarded-for")?.split(",")[0];
  return forwarded?.trim().slice(0, 64) || null;
}

export async function loginAction(_state: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Wpisz poprawny adres e-mail i hasło." };

  const result = await authenticateWithPassword(parsed.data.email, parsed.data.password, await clientIpAddress());
  if (!result.ok) {
    return {
      error: result.reason === "RATE_LIMITED"
        ? `Zbyt wiele nieudanych prób logowania. Spróbuj ponownie za ${LOGIN_WINDOW_MINUTES} minut.`
        : "Nieprawidłowy e-mail lub hasło.",
    };
  }
  await createSession(result.userId);
  redirect("/");
}

export async function logoutAction() {
  await deleteCurrentSession();
  redirect("/login");
}

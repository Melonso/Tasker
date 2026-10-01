import { cookies } from "next/headers";
import { ZodError } from "zod";

import { UserInputError } from "./errors";

export const FLASH_ERROR_COOKIE = "tasker_flash_error";

export function userFacingErrorMessage(error: unknown) {
  if (error instanceof UserInputError) return error.message;
  if (error instanceof ZodError) return error.issues[0]?.message ?? "Nieprawidłowe dane formularza.";
  return null;
}

export async function setFlashError(message: string) {
  (await cookies()).set(FLASH_ERROR_COOKIE, encodeURIComponent(message.slice(0, 300)), {
    path: "/",
    maxAge: 60,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function readFlashError() {
  const value = (await cookies()).get(FLASH_ERROR_COOKIE)?.value;
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/**
 * Runs a form action and turns user errors (validation, permissions, state conflicts) into a
 * flash message shown above the page, instead of the generic error screen.
 */
export async function runFormAction(work: () => Promise<unknown>) {
  try {
    await work();
  } catch (error) {
    const message = userFacingErrorMessage(error);
    if (!message) throw error;
    await setFlashError(message);
  }
}
